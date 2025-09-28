import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";

export default function EditorPage() {
  const signalRef = useRef();
  var peerConnectionRef = useRef(null);
  const sessionRef = useRef(false);
  const userRef = useRef(null);
  const hostCandidatesRef = useRef([]);
  const guestCandidatesRef = useRef([]);
  const hostChannelRef = useRef(null);
  const guestChannelRef = useRef(null);
  const processedSignalsRef = useRef(new Set());
  const editorRef = useRef(null);
  const isUpdatingFromRemote = useRef(false);
  const bufferedRemoteAnswers = useRef([]);
  const bufferedRemoteCandidates = useRef([]);
  const remoteAnswerSetRef = useRef(false);

  const isInitiator = window.location.hash === "#host";
  const tempPostID = "081e6167-62e5-4b96-8ce1-f0d13bc84869";

  // Editor state
  const [editorContent, setEditorContent] = useState(
    isInitiator ? `console.log("Host");` : `console.log("not Host");`
  );

  // --- Universal sendMessage ---
  const sendMessage = useCallback((msg) => {
    if (hostChannelRef.current?.readyState === "open") {
      hostChannelRef.current.send(msg);
      console.log("Sent via host:", msg);
    } else if (guestChannelRef.current?.readyState === "open") {
      guestChannelRef.current.send(msg);
      console.log("Sent via guest:", msg);
    } else {
      console.warn("No open data channel yet");
    }
  }, []);

  // --- Cleanup function ---
  const closeSession = useCallback(() => {
    if (hostChannelRef.current) hostChannelRef.current.close();
    if (guestChannelRef.current) guestChannelRef.current.close();
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    peerConnectionRef.current = null;
    hostChannelRef.current = null;
    guestChannelRef.current = null;
    bufferedRemoteAnswers.current = [];
    bufferedRemoteCandidates.current = [];
    remoteAnswerSetRef.current = false;
    console.log("Session cleaned up");
  }, []);

  // --- Apply remote answer safely ---
  const applyRemoteAnswer = useCallback((answer) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (
      !remoteAnswerSetRef.current &&
      pc.signalingState === "have-local-offer"
    ) {
      pc.setRemoteDescription(answer)
        .then(() => {
          remoteAnswerSetRef.current = true;
          console.log("Remote description applied");

          // Apply any buffered ICE candidates
          bufferedRemoteCandidates.current.forEach((c) =>
            pc.addIceCandidate(c)
          );
          bufferedRemoteCandidates.current = [];
        })
        .catch(console.error);
    } else {
      bufferedRemoteAnswers.current.push(answer);
      console.log("Answer buffered, will apply when ready");
    }
  }, []);

  // --- Add ICE candidate safely ---
  const addRemoteCandidate = useCallback((candidate) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (pc.remoteDescription) {
      pc.addIceCandidate(candidate).catch(console.error);
    } else {
      bufferedRemoteCandidates.current.push(candidate);
      console.log("Candidate buffered until remote description is set");
    }
  }, []);

  // Handle editor content changes
  const handleEditorChange = useCallback(
    (value) => {
      if (!isUpdatingFromRemote.current) {
        setEditorContent(value);
        const message = JSON.stringify({
          type: "editor-change",
          content: value,
          timestamp: Date.now(),
        });
        sendMessage(message);
      }
    },
    [sendMessage]
  );

  // Handle receiving remote editor changes
  const handleRemoteEditorChange = useCallback((content) => {
    console.log("Received remote editor change:", content.length, "characters");
    isUpdatingFromRemote.current = true;
    setEditorContent(content);
    setTimeout(() => {
      isUpdatingFromRemote.current = false;
    }, 100);
  }, []);

  // Expose functions to window for debugging
  if (typeof window !== "undefined") {
    window.sendMessage = sendMessage;
    window.closeSession = closeSession;
  }

  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = true;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userRef.current = user.id;
      if (isInitiator) {
        const offer = await generateSignal();
        await createSessionServer(offer, tempPostID);
      } else {
        // guest joining session
        // guest will provide host with signal
        const hostSignal = await generateGuestSignal(tempPostID);
        console.log("asd");
      }
    }
    async function generateSignal() {
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      const channel = peerConnectionRef.current.createDataChannel("text");
      hostChannelRef.current = channel;
      channel.onopen = () => {
        console.log("Host: Data channel opened");
        // Test message
        channel.send("Hello from host!");
      };
      channel.onmessage = (event) => {
        console.log("Host received:", event.data);
        try {
          const message = JSON.parse(event.data);
          if (message.type === "editor-change") {
            handleRemoteEditorChange(message.content);
          }
        } catch (e) {
          // Handle non-JSON messages (like our test messages)
          console.log("Host received non-JSON message:", event.data);
        }
      };
      channel.onerror = (error) => {
        console.error("Host channel error:", error);
      };
      peerConnectionRef.current.onicecandidate = async (event) => {
        console.log("IceCandidate: ", event.candidate);
        if (event.candidate) {
          hostCandidatesRef.current.push(event.candidate);
          const { error } = await supabase
            .from("sessions")
            .update([
              {
                hostCandidates: hostCandidatesRef.current,
              },
            ])
            .eq("postID", tempPostID);
        }
      };
      const offer = await peerConnectionRef.current.createOffer();
      console.log("Host: Created offer:", offer);
      await peerConnectionRef.current.setLocalDescription(offer);
      console.log(
        "Host: Set local description, signaling state:",
        peerConnectionRef.current.signalingState
      );
      return offer;
    }
    async function createSessionServer(offer, postID) {
      const { error } = await supabase.from("sessions").upsert(
        [
          {
            postID: postID,
            hostSignal: offer,
            hostID: userRef.current,
          },
        ],
        { onConflict: ["postID"] }
      );
      signalRef.current = offer;
      console.log(offer);
      let i = 0;
      const sessionChannel = supabase
        .channel("session_changes")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `postID=eq.${postID}`,
          },
          (payload) => {
            const updatedRow = payload.new;
            if (updatedRow.guestSignal) {
              console.log("Host: Received guest signal");
              applyRemoteAnswer(
                new RTCSessionDescription(updatedRow.guestSignal)
              );
            }
            if (updatedRow.guestCandidates) {
              console.log("Host: Received guest candidates");
              updatedRow.guestCandidates.forEach((candidate) => {
                addRemoteCandidate(new RTCIceCandidate(candidate));
              });
            }
          }
        )
        .subscribe();
    }
    async function generateGuestSignal(postID) {
      const { data } = await supabase
        .from("sessions")
        .select("hostSignal, hostID")
        .eq("postID", postID);
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      console.log(data[0]);
      console.log("data");
      let answer = null;
      // Guest: Set remote description (offer from host)
      if (data[0].hostSignal) {
        console.log("Guest: Setting remote description (offer from host)");
        console.log(
          "Guest: Current signaling state:",
          peerConnectionRef.current.signalingState
        );
        await peerConnectionRef.current.setRemoteDescription(
          data[0].hostSignal
        );
        console.log("Guest: Remote description set, creating answer");
        answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        console.log("Guest: Answer created and set as local description");
      }
      peerConnectionRef.current.ondatachannel = (event) => {
        const guestChannel = event.channel;
        guestChannelRef.current = guestChannel;
        console.log("Guest: Data channel received");
        guestChannel.onopen = () => {
          console.log("Guest: Data channel opened");
          // Test message
          guestChannel.send("Hello from guest!");
        };
        guestChannel.onmessage = (event) => {
          console.log("Guest received:", event.data);
          try {
            const message = JSON.parse(event.data);
            if (message.type === "editor-change") {
              handleRemoteEditorChange(message.content);
            }
          } catch (e) {
            // Handle non-JSON messages (like our test messages)
            console.log("Guest received non-JSON message:", event.data);
          }
        };
        guestChannel.onerror = (error) => {
          console.error("Guest channel error:", error);
        };
      };
      const sessionChannel = supabase
        .channel("session_changes")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `postID=eq.${postID}`,
          },
          (payload) => {
            const updatedRow = payload.new;
            if (updatedRow.hostCandidates) {
            }
          }
        )
        .subscribe();
      peerConnectionRef.current.onicecandidate = async (event) => {
        if (event.candidate) {
          guestCandidatesRef.current.push(event.candidate);
          // Store guest candidates in the DB
          const { error } = await supabase
            .from("sessions")
            .update([
              {
                guestCandidates: guestCandidatesRef.current,
              },
            ])
            .eq("postID", postID);

          if (error) console.error(error);
        }
      };

      try {
        const { error } = await supabase
          .from("sessions")
          .update([
            {
              postID: postID,
              guestSignal: answer,
              guestID: userRef.current,
            },
          ])
          .eq("postID", postID);
      } catch (error) {
        console.error(error);
      }
    }
    init();
  }, []);
  // For host
  function sendHostMessage(msg) {
    if (
      hostChannelRef.current &&
      hostChannelRef.current.readyState === "open"
    ) {
      hostChannelRef.current.send(msg);
      console.log("Host sent:", msg);
    } else {
      console.warn("Host data channel not open");
    }
  }

  // For guest - using ref now
  function sendGuestMessage(msg) {
    if (
      guestChannelRef.current &&
      guestChannelRef.current.readyState === "open"
    ) {
      guestChannelRef.current.send(msg);
      console.log("Guest sent:", msg);
    } else {
      console.warn("Guest data channel not open");
    }
  }

  // Attach to window so you can call from console
  window.sendMessage = sendMessage;

  // Optional: attach to window so you can call it from console
  window.closeSession = closeSession;

  return (
    <div className="relative h-screen  bg-gray-700">
      <div className="flex-1">
        <Editor
          width="85vw"
          height="92vh"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={editorContent}
          onChange={handleEditorChange}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            fontSize: 14,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
