import { supabase } from "./supabaseClient";
let cachedUserID = null;
let hostCandidatesArr = [];
let guestCandidatesArr = [];
let pendingRemoteSDPs = []; // SDPs (answers) received before remoteDescription can be set
let pendingRemoteCandidates = []; // RTCIceCandidate objects received before remoteDescription

const tempPostID = window.location.pathname.split("/")[2];
console.log(tempPostID);
export let channel = null;
export const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
});

// Add connection state logging
pc.onconnectionstatechange = () => {
  if (pc.connectionState === "connected") {
    console.log("🎉 WebRTC connection fully established!");
  }
};

pc.oniceconnectionstatechange = () => {
  if (
    pc.iceConnectionState === "connected" ||
    pc.iceConnectionState === "completed"
  ) {
    console.log("🎉 ICE connection established!");
  }
};

pc.onsignalingstatechange = () => {
  console.log("📡 Signaling state changed:", pc.signalingState);
};

if (typeof window !== "undefined") {
  window.pc = pc; // expose to console
  window.channel = channel;
}
export async function getUserID() {
  if (cachedUserID) return cachedUserID;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  console.log(user.id);
  if (error) throw error;
  if (!user.id) return null;
  cachedUserID = user.id;
  return cachedUserID;
}

// Shared utility function for appending ICE candidates to database
async function appendCandidatesToDB(field, candidateObj) {
  // fetch current array
  const { data: rows, error: selErr } = await supabase
    .from("sessions")
    .select(field)
    .eq("postID", tempPostID)
    .single();
  if (selErr) {
    console.error("select error", selErr);
    return;
  }
  const existing = (rows && rows[field]) || [];
  existing.push(candidateObj);
  const { error: upErr } = await supabase
    .from("sessions")
    .update({ [field]: existing })
    .eq("postID", tempPostID);
  if (upErr) console.error("appendCandidatesToDB update error", upErr);
}

//    HOST
export async function createDataChannel() {
  await getUserID();

  let setRemoteAnswer = false;
  channel = pc.createDataChannel("text");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // upsert host signal WITH the user id
  const { error: upsertError } = await supabase.from("sessions").upsert(
    [
      {
        postID: tempPostID,
        hostSignal: offer,
        hostID: cachedUserID,
      },
    ],
    { onConflict: ["postID"] }
  );
  if (upsertError) console.error(upsertError);

  // Data channel handlers
  channel.onopen = (event) => console.log("Host: Data channel opened:", event);
  channel.onmessage = (event) => {
    console.log("Host received message:", event.data);
    try {
      const message = JSON.parse(event.data);
      // Ignore our own messages
      if (message.sender === "host") return;
      if (message.type === "editor-change") {
        // Dispatch custom event for editor content changes from guest
        window.dispatchEvent(
          new CustomEvent("editor-change-received", {
            detail: { content: message.content, timestamp: message.timestamp },
          })
        );
      } else if (message.type === "cursor-position") {
        // Dispatch custom event for cursor position changes from guest
        window.dispatchEvent(
          new CustomEvent("cursor-position-received", {
            detail: {
              lineNumber: message.lineNumber,
              column: message.column,
              timestamp: message.timestamp,
            },
          })
        );
      }
    } catch (e) {
      console.log("Host received non-JSON message:", event.data, error);
    }
  };
  channel.onerror = (err) => console.log("Host channel error:", err);

  // Send host ICE candidates to DB (consider batching)
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      const c = event.candidate.toJSON();
      hostCandidatesArr.push(c); // local cache (still fine)
      await appendCandidatesToDB("hostCandidates", c);
    }
  };

  // Realtime subscription: handle guestSignal (answer) and guestCandidates
  const sub = supabase
    .channel("session_changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `postID=eq.${tempPostID}`,
      },
      (payload) => {
        const updatedRow = payload.new;
        // guest answer (SDP)
        if (updatedRow.guestSignal) {
          console.log("Host: Received guest signal");
          // if we can set remote now, do it and flush candidate queue
          if (pc.signalingState === "have-local-offer" && !setRemoteAnswer) {
            pc.setRemoteDescription(
              new RTCSessionDescription(updatedRow.guestSignal)
            )
              .then(() => {
                setRemoteAnswer = true;
                console.log("Remote description set (host)");
                // flush pending remote ICE candidates
                pendingRemoteCandidates.forEach((c) =>
                  pc.addIceCandidate(c).catch(console.error)
                );
                pendingRemoteCandidates = [];
                // flush any SDPs we queued earlier (unlikely, but safe)
                while (pendingRemoteSDPs.length) {
                  const sdp = pendingRemoteSDPs.shift();
                  pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(
                    console.error
                  );
                }
              })
              .catch(console.error);
          } else {
            // store SDP for later (don't mix with candidates)
            pendingRemoteSDPs.push(updatedRow.guestSignal);
          }
        }

        // guest ICE candidates (array)
        if (updatedRow.guestCandidates) {
          console.log("Host: Received guest candidates");
          updatedRow.guestCandidates.forEach((candidateObj) => {
            const ice = new RTCIceCandidate(candidateObj);
            if (pc.remoteDescription) {
              pc.addIceCandidate(ice).catch(console.error);
            } else {
              pendingRemoteCandidates.push(ice);
            }
          });
        }
      }
    )
    .subscribe();
}

//    GUEST
export async function guestAcceptConnection() {
  await getUserID();

  pc.ondatachannel = (event) => {
    channel = event.channel;
    channel.onopen = () => {
      console.log("Guest channel state:", channel.readyState);
    };
    channel.onmessage = (evt) => {
      console.log("Guest received:", evt.data);
      try {
        const message = JSON.parse(evt.data);
        if (message.type === "editor-change") {
          // Ignore our own messages
          if (message.sender === "guest") return;

          // Dispatch custom event for editor content changes from host
          window.dispatchEvent(
            new CustomEvent("editor-change-received", {
              detail: {
                content: message.content,
                timestamp: message.timestamp,
              },
            })
          );
        } else if (message.type === "cursor-position") {
          // Ignore our own cursor messages
          if (message.sender === "guest") {
            return;
          }

          // Dispatch custom event for cursor position changes from host
          window.dispatchEvent(
            new CustomEvent("cursor-position-received", {
              detail: {
                lineNumber: message.lineNumber,
                column: message.column,
                timestamp: message.timestamp,
              },
            })
          );
        }
      } catch (e) {
        console.log("Guest received non-JSON message:", evt.data);
      }
    };
    channel.onerror = (err) => console.error("Guest channel error:", err);
  };

  // Set up ICE candidate handling for guest
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log("🧊 Guest: ICE candidate generated");
      const c = event.candidate.toJSON();
      guestCandidatesArr.push(c);
      await appendCandidatesToDB("guestCandidates", c);
    } else {
      console.log("🧊 Guest: ICE gathering completed");
    }
  };

  let answer = null;

  // fetch hostSignal
  const { data } = await supabase
    .from("sessions")
    .select("hostSignal, hostID")
    .eq("postID", tempPostID);

  console.log("🔧 Guest: Fetched host signal:", !!data?.[0]?.hostSignal);

  if (data?.[0]?.hostSignal) {
    console.log("🔧 Guest: Setting remote description...");
    const hostOffer = data[0].hostSignal;
    console.log(
      "🔧 Guest: Host SDP contains data channel:",
      hostOffer.sdp.includes("m=application")
    );

    await pc.setRemoteDescription(new RTCSessionDescription(hostOffer));
    console.log("remote description set (guest)");
    console.log(
      "🔧 Guest: PC signaling state after setRemoteDescription:",
      pc.signalingState
    );

    answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log("Answer created and set as local description");
    console.log(
      "🔧 Guest: PC signaling state after setLocalDescription:",
      pc.signalingState
    );

    // send answer back to supabase
    await supabase
      .from("sessions")
      .update({ guestSignal: answer, guestID: cachedUserID })
      .eq("postID", tempPostID);
    console.log("Guest sent answer to supabase");
  }

  // subscribe to host candidates published later
  const sub = supabase
    .channel("session_changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `postID=eq.${tempPostID}`,
      },
      (payload) => {
        const updatedRow = payload.new;
        if (updatedRow.hostCandidates) {
          updatedRow.hostCandidates.forEach((candidate) => {
            const ice = new RTCIceCandidate(candidate);
            if (pc.remoteDescription) {
              pc.addIceCandidate(ice).catch(console.error);
            } else {
              // push to pendingRemoteCandidates (shared var)
              pendingRemoteCandidates.push(ice);
            }
          });
        }
        // If host later sets hostSignal updates etc, handle separately if needed
      }
    )
    .subscribe();
  if (typeof window !== "undefined") {
    window.pc = pc; // expose to console
    window.channel = channel;
  }
}

// Function to send editor content through data channel
export function sendDocument(content) {
  console.log("sendDocument called. Channel state:", {
    channel: !!channel,
    readyState: channel?.readyState,
    pcState: pc.connectionState,
    signalingState: pc.signalingState,
  });

  try {
    if (!channel) {
      console.warn("No data channel (channel is null)");
      return;
    }
    if (channel.readyState !== "open") {
      console.warn("Data channel not open:", channel.readyState);
      return;
    }

    // Send editor content as JSON
    const message = JSON.stringify({
      type: "editor-change",
      content: content,
      timestamp: Date.now(),
      sender: window.location.hash === "#host" ? "host" : "guest", // Use role instead of ID
    });

    channel.send(message);
    console.log(
      "Editor content sent successfully, length:",
      content?.length || 0
    );
  } catch (error) {
    console.error("Error sending document:", error);
  }
}

// Function to send cursor position through data channel
export function sendCursorPosition(lineNumber, column) {
  try {
    if (!channel || channel.readyState !== "open") {
      return;
    }

    const message = JSON.stringify({
      type: "cursor-position",
      lineNumber: lineNumber,
      column: column,
      timestamp: Date.now(),
      sender: window.location.hash === "#host" ? "host" : "guest",
    });

    channel.send(message);
  } catch (error) {
    console.error("Error sending cursor position:", error);
  }
}
