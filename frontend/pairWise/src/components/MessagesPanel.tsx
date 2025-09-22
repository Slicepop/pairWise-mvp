"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface MessagesPanelProps {
  threadId: string;
  currentUserId: string;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  user_metadata: { full_name?: string; role?: string };
}

export default function MessagesPanel({
  threadId,
  currentUserId,
}: MessagesPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  // Load existing messages
  useEffect(() => {
    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          id, content, created_at, 
          user:user_id ( user_metadata )
        `
        )
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(
          data.map((d: any) => ({
            id: d.id,
            content: d.content,
            created_at: d.created_at,
            user_metadata: d.user?.user_metadata || {
              full_name: "Unknown",
              role: "user",
            },
          }))
        );
      } else {
        console.error(error);
      }
    }

    if (threadId) loadMessages();
  }, [threadId]);

  // Subscribe to new messages
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`messages-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = {
            id: payload.new.id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            user_metadata: payload.new.user_metadata,
          };
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  // Send new message
  async function sendMessage() {
    if (!newMessage.trim()) return;

    const { error } = await supabase.from("messages").insert([
      {
        thread_id: threadId,
        user_id: currentUserId,
        content: newMessage,
      },
    ]);

    if (error) console.error(error);
    else setNewMessage("");
  }

  return (
    <div className="flex flex-col h-full border-l border-gray-300">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className="p-2 rounded bg-gray-100">
            <span className="font-bold">
              {msg.user_metadata.full_name} ({msg.user_metadata.role}):{" "}
            </span>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-300 flex">
        <input
          type="text"
          className="flex-1 border rounded p-2 mr-2"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
