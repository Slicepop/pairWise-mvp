import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";

export default function EditorPage() {
  const signalRef = useRef();
  var peerConnectionRef = useRef(null);
  const sessionRef = useRef(false);
  useEffect(() => {
    if (sessionRef.current) return;
    sessionRef.current = true;
    async function init() {
      const offer = await generateSignal();
      await createSessionServer(offer);
    }
    async function generateSignal() {
      peerConnectionRef.current = new RTCPeerConnection();
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      return offer;
    }
    async function createSessionServer(offer) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user.id;

      const { error } = await supabase.from("sessions").upsert(
        [
          {
            postID: "081e6167-62e5-4b96-8ce1-f0d13bc84869",
            hostSignal: offer,
            hostID: userId,
          },
        ],
        { onConflict: ["postID"] }
      );
      console.log(offer);
    }
    init();
  }, []);
}
