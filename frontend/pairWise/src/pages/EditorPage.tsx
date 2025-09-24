import { useParams } from "react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "../lib/supabaseClient";

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

  // Debouncing for database updates
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingFromRemoteRef = useRef(false);

  // Load post and initialize code
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

        const initialCode = `// Coding Session: ${data.subject}\n// Help requested: ${data.content}\n\nfunction solution() {\n  console.log('Let\\'s solve this together!');\n}`;
        setCode(initialCode);

        // Check if editor content already exists, if not create it
        const { data: existingEditor } = await supabase
          .from("editor_changes")
          .select("content")
          .eq("post_id", data.id)
          .single();

        if (existingEditor) {
          // Use existing code from database
          setCode(existingEditor.content);
        } else {
          // Initialize with default code using upsert to prevent duplicates
          const { error: upsertError } = await supabase
            .from("editor_changes")
            .upsert(
              {
                post_id: data.id,
                content: initialCode,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "post_id",
                ignoreDuplicates: false,
              }
            );

          if (upsertError) {
            console.error("Error initializing editor:", upsertError);
          }
        }
      }
      setLoading(false);
    }

    loadPost();
  }, [postID]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!post) return;

    console.log("Setting up real-time listener for post:", post.id);

    const channel = supabase
      .channel(`editor_changes_${post.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "editor_changes",
          filter: `post_id=eq.${post.id}`,
        },
        (payload) => {
          console.log("Received real-time update:", payload);
          // Set flag to prevent triggering database update from this change
          isUpdatingFromRemoteRef.current = true;
          // Update editor when other users make changes
          setCode(payload.new.content);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Debounced database update function
  const updateDatabase = useCallback(
    async (value: string, postId: string | number) => {
      console.log(
        "Updating database for post:",
        postId,
        "with length:",
        value.length
      );

      const { error } = await supabase.from("editor_changes").upsert(
        {
          post_id: postId,
          content: value,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "post_id",
        }
      );

      if (error) {
        console.error("Error updating editor content:", error);
      } else {
        console.log("Successfully updated editor content");
      }
    },
    []
  );

  // Handle editor changes with debouncing
  const handleEditorChange = (value: string | undefined) => {
    if (!value || !post) return;

    // Don't update if this change came from a remote update
    if (isUpdatingFromRemoteRef.current) {
      isUpdatingFromRemoteRef.current = false;
      return;
    }

    // Update local state immediately for responsive UI
    setCode(value);

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for database update (debounce for 500ms)
    debounceTimeoutRef.current = setTimeout(() => {
      updateDatabase(value, post.id);
    }, 500);
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
