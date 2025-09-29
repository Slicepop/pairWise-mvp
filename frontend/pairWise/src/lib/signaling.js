import { supabase } from "./supabaseClient";
let cachedUserID = null;
let hostCandidatesArr = [];
let guestCandidatesArr = [];
const tempPostID = "081e6167-62e5-4b96-8ce1-f0d13bc84869";

export const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
});
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
//    HOST
export async function createDataChannel() {
  let setRemoteAnswer = false;
  const channel = pc.createDataChannel("text");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const { error } = await supabase.from("sessions").upsert(
    [
      {
        postID: tempPostID,
        hostSignal: offer,
        hostID: cachedUserID,
      },
    ],
    { onConflict: ["postID"] }
  );
  if (error) console.error(error);
  console.log(
    "signaling status after setting local description",
    pc.signalingState
  );
  channel.onopen = (event) => {
    console.log("Host: Data channel opened: ", event);
  };
  channel.onmessage = (event) => {
    console.log("Host Revieved message: ", event.data);
  };
  channel.onerror = (error) => {
    console.log("Host channel error: ", error);
  };
  pc.onicecandidate = async (event) => {
    console.log("iceCandidate: ", event.candidate);
    if (event.candidate) {
      hostCandidatesArr.push(event.candidate.toJSON());
      const { error } = await supabase
        .from("sessions")
        .update([
          {
            hostCandidates: hostCandidatesArr,
          },
        ])
        .eq("postID", tempPostID);
    }
  };
  supabase
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
        if (updatedRow.guestSignal) {
          console.log("Host: Received guest signal");
          if (pc.signalingState === "have-local-offer" && !setRemoteAnswer) {
            pc.setRemoteDescription(
              new RTCSessionDescription(updatedRow.guestSignal)
            ).then(() => {
              setRemoteAnswer = true;
              console.log("Remote description set");
              guestCandidatesArr.forEach((candidate) => {
                pc.addIceCandidate(candidate);
              });
              guestCandidatesArr = [];
            });
          } else {
            guestCandidatesArr.push(updatedRow.guestSignal);
          }
        } else if (updatedRow.guestCandidates) {
          console.log("Host: Received guest candidates");
          updatedRow.guestCandidates.forEach((candidate) => {
            const ice = new RTCIceCandidate(candidate);
            if (pc.remoteDescription) {
              pc.addIceCandidate(ice).catch(console.error);
            } else {
              guestCandidatesArr.push(ice);
            }
          });
        }
      }
    )
    .subscribe();
}

//    GUEST
export async function guestAcceptConnection() {}
