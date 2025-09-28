import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";

export default function EditorPage() {
  const signalRef = useRef();
  var peerConnectionRef = useRef(null);
  const sessionRef = useRef(false);
  const userRef = useRef(null);
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
      peerConnectionRef.current.onicecandidate = async (event) => {
        console.log("iceCandidate");
        if (event.candidate) {
          const { error } = await supabase.from("sessions").update([
            {
              hostCandidates: event.candidate,
            },
          ]);
        }
      };
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(
        new RTCSessionDescription(offer)
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
            if (updatedRow.guestSignal) {
              peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(updatedRow.guestSignal)
              );
              console.log(updatedRow.guestSignal);
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
      await peerConnectionRef.current.setRemoteDescription(data[0].hostSignal);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(
        new RTCSessionDescription(answer)
      );
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
