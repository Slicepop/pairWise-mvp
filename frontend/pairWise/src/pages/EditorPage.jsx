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

  const isInitiator = window.location.hash === "#host";
  const tempPostID = "081e6167-62e5-4b96-8ce1-f0d13bc84869";

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
            if (updatedRow.guestSignal && peerConnectionRef.current) {
              // Only set remote description if we're in the right state (have-local-offer)
              if (
                peerConnectionRef.current.signalingState === "have-local-offer"
              ) {
                console.log(
                  "Host: Setting remote description (answer from guest)"
                );
                peerConnectionRef.current
                  .setRemoteDescription(
                    new RTCSessionDescription(updatedRow.guestSignal)
                  )
                  .catch((error) => {
                    console.error("Error setting remote description:", error);
                  });
              } else {
                console.log(
                  "Host: Wrong state for remote description:",
                  peerConnectionRef.current.signalingState
                );
              }
            } else if (
              updatedRow.guestCandidates &&
              peerConnectionRef.current
            ) {
              updatedRow.guestCandidates.forEach((candidate) => {
                if (peerConnectionRef.current.remoteDescription) {
                  peerConnectionRef.current
                    .addIceCandidate(new RTCIceCandidate(candidate))
                    .catch((error) => {
                      console.error("Error adding ICE candidate:", error);
                    });
                }
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
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        console.log("Guest: Answer created and set as local description");
      }
      peerConnectionRef.current.ondatachannel = (event) => {
        const guestChannel = event.channel;
        console.log("Guest: Data channel received");
        guestChannel.onopen = () => {
          console.log("Guest: Data channel opened");
          // Test message
          guestChannel.send("Hello from guest!");
        };
        guestChannel.onmessage = (event) => {
          console.log("Guest received:", event.data);
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
  return (
    <div className="relative h-screen  bg-gray-700">
      <div className="flex-1">
        <Editor
          width="85vw"
          height="92vh"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={
            isInitiator ? `console.log("Host");` : `console.log("not Host");`
          }
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
