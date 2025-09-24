import { useParams } from "react-router";
import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";
import { io, Socket } from "socket.io-client";

interface Post {
  id: string | number;
  subject: string;
  content: string;
  thread_id: string;
  profiles: {
    full_name: string;
    role: string;
  };
}

export default function EditorPage() {
  const { postID } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const socketRef = useRef<Socket | null>(null);

  // Load post from Supabase
  useEffect(() => {
    async function loadPost() {
      if (!postID) return;

      const { data, error } = await supabase
        .from("posts")
        .select(
          `id, subject, content, thread_id, profiles!inner(full_name, role)`
        )
        .eq("id", postID)
        .single();

      if (error) {
        console.error("Error loading post:", error);
      } else {
        setPost(data as any);
        setCode(
          `// Coding Session: ${data.subject}\n// Help requested: ${data.content}\n\nfunction solution() {\n  console.log('Let's solve this together!');\n}`
        );
      }
      setLoading(false);
    }

    loadPost();
  }, [postID]);

  // Setup Socket.IO
  useEffect(() => {
    if (!post) return;

    socketRef.current = io("https://pairwise-mvp.onrender.com", {
      path: "/socket.io",
      transports: ["websocket"], // force websocket to avoid polling issues
    });

    // Join a thread room
    socketRef.current.emit("join-thread", post.thread_id);

    // Listen for updates from other users
    socketRef.current.on("editor-update", (newCode: string) => {
      setCode(newCode);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [post]);

  const handleEditorChange = (value: string | undefined) => {
    if (!value || !socketRef.current || !post) return;

    setCode(value);

    // Emit changes to server
    socketRef.current.emit("editor-change", {
      threadId: post.thread_id,
      content: value,
    });
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Loading session...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Session not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <h1 className="text-white font-bold">Coding Session: {post.subject}</h1>
        <p className="text-gray-300 text-sm">
          Help requested by {post.profiles.full_name} • Thread {post.thread_id}
        </p>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Editor
          width="85vw"
          height="92vh"
          defaultLanguage="javascript"
          value={code}
          theme="vs-dark"
          onChange={handleEditorChange}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
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
