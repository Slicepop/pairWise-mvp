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
  const [userCache, setUserCache] = useState<
    Map<string, { full_name: string; role: string }>
  >(new Map());

  // Get current user data
  useEffect(() => {
    async function getCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);

      // Add current user to cache
      if (user) {
        setUserCache(
          (prev) =>
            new Map(
              prev.set(user.id, {
                full_name: user.user_metadata?.full_name || "You",
                role: user.user_metadata?.role || "user",
              })
            )
        );
      }
    }
    getCurrentUser();
  }, []);

  // Function to get user metadata by user_id
  const getUserMetadata = async (userId: string) => {
    // Check cache first
    if (userCache.has(userId)) {
      return userCache.get(userId)!;
    }

    // Try to fetch from profiles table (if it exists)
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", userId)
        .single();

      if (!error && profile) {
        const userMetadata = {
          full_name: profile.full_name || "Unknown User",
          role: profile.role || "user",
        };

        // Cache the result
        setUserCache((prev) => new Map(prev.set(userId, userMetadata)));
        return userMetadata;
      }
    } catch (err) {
      // Profiles table might not exist, that's ok
    }

    // Fallback
    const fallbackMetadata = { full_name: "Unknown User", role: "user" };
    setUserCache((prev) => new Map(prev.set(userId, fallbackMetadata)));
    return fallbackMetadata;
  };

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

      // Create messages with user data (fetch metadata for each unique user)
      const uniqueUserIds = [
        ...new Set(messagesData.map((msg) => msg.user_id)),
      ];

      // Fetch metadata for all unique users
      const userMetadataPromises = uniqueUserIds.map((userId) =>
        getUserMetadata(userId)
      );
      await Promise.all(userMetadataPromises);

      // Now map messages with the cached user data
      const messagesWithUsers = messagesData.map((msg) => {
        const userMetadata = userCache.get(msg.user_id) || {
          full_name: "Unknown User",
          role: "user",
        };

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
  }, [threadId, currentUser, userCache]);

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
          // Get user metadata for the message sender
          const userMetadata = await getUserMetadata(payload.new.user_id);

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
