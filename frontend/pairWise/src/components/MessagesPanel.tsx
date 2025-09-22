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
  user_id: string;
  user_metadata: { full_name?: string; role?: string };
}

export default function MessagesPanel({
  threadId,
  currentUserId,
}: MessagesPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Get current user data
  useEffect(() => {
    async function getCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    getCurrentUser();
  }, []);

  // Load existing messages
  useEffect(() => {
    async function loadMessages() {
      if (!threadId || !currentUser) return;

      // First, fetch messages
      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select("id, content, created_at, user_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Error loading messages:", messagesError);
        return;
      }

      if (!messagesData || messagesData.length === 0) {
        setMessages([]);
        return;
      }

      // Create messages with available user data
      const messagesWithUsers = messagesData.map((msg) => {
        let userMetadata = { full_name: "Unknown", role: "user" };

        // If this message is from the current user, use their metadata
        if (currentUser && msg.user_id === currentUser.id) {
          userMetadata = {
            full_name: currentUser.user_metadata?.full_name || "Unknown",
            role: currentUser.user_metadata?.role || "user",
          };
        }

        return {
          id: msg.id,
          content: msg.content,
          created_at: msg.created_at,
          user_id: msg.user_id,
          user_metadata: userMetadata,
        };
      });

      setMessages(messagesWithUsers);
    }

    loadMessages();
  }, [threadId, currentUser]);

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
        async (payload) => {
          // When a new message arrives, we need to determine the user metadata
          let userMetadata = { full_name: "Unknown", role: "user" };

          // If it's from the current user, use their metadata
          if (currentUser && payload.new.user_id === currentUser.id) {
            userMetadata = {
              full_name: currentUser.user_metadata?.full_name || "Unknown",
              role: currentUser.user_metadata?.role || "user",
            };
          }

          const newMsg = {
            id: payload.new.id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            user_id: payload.new.user_id,
            user_metadata: userMetadata,
          };

          // Check if message already exists (to avoid duplicates from optimistic updates)
          setMessages((prev) => {
            const exists = prev.some(
              (msg) =>
                msg.id === newMsg.id ||
                (msg.content === newMsg.content &&
                  msg.user_id === newMsg.user_id &&
                  Math.abs(
                    new Date(msg.created_at).getTime() -
                      new Date(newMsg.created_at).getTime()
                  ) < 1000)
            );

            if (exists) {
              return prev;
            }

            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, currentUser]);

  // Send new message
  async function sendMessage() {
    if (!newMessage.trim() || !currentUser) return;

    const messageContent = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    // Optimistic update - immediately add message to UI
    const optimisticMessage = {
      id: tempId,
      content: messageContent,
      created_at: new Date().toISOString(),
      user_id: currentUserId,
      user_metadata: {
        full_name: currentUser.user_metadata?.full_name || "You",
        role: currentUser.user_metadata?.role || "user",
      },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage(""); // Clear input immediately

    // Send to database
    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          thread_id: threadId,
          user_id: currentUserId,
          content: messageContent,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      // Restore message in input
      setNewMessage(messageContent);
    } else {
      // Replace optimistic message with real one from database
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? {
                ...msg,
                id: data.id,
                created_at: data.created_at,
              }
            : msg
        )
      );
    }
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
