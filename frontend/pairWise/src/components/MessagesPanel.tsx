import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface PostsPanelProps {
  currentUserId: string;
  threadId: string;
}

interface Profile {
  id: string;
  full_name: string;
  role: string;
}

interface Reply {
  id: string | number;
  content: string;
  created_at: string;
  profiles: Profile;
}

interface Post {
  id: string | number;
  subject: string;
  content: string;
  request_help: boolean;
  created_at: string;
  user_id: string;
  thread_id: string;
  profiles: Profile;
  replies?: Reply[];
}

interface NewPost {
  subject: string;
  content: string;
  request_help: boolean;
}

export default function PostsPanel({
  currentUserId,
  threadId,
}: PostsPanelProps) {
  const [newPost, setNewPost] = useState<NewPost>({
    subject: "",
    content: "",
    request_help: false,
  });

  const [posts, setPosts] = useState<Post[]>([]);
  const [replyText, setReplyText] = useState<Record<string | number, string>>(
    {}
  );

  // Load posts with author profiles and replies
  useEffect(() => {
    async function loadPosts() {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          id,
          subject,
          content,
          request_help,
          created_at,
          user_id,
          thread_id,
          profiles!inner(id, full_name, role),
          replies(
            id,
            content,
            created_at,
            profiles!inner(id, full_name, role)
          )
        `
        )
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading posts:", error);
        return;
      }
      setPosts((data as any) || []);
    }

    loadPosts();

    // Subscribe to new posts
    const postsChannel = supabase
      .channel("posts_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
        },
        async (payload) => {
          console.log("New post received:", payload);
          // Only add posts for the current thread
          if (payload.new.thread_id !== threadId) return;

          // Fetch the complete post with profile data
          const { data, error } = await supabase
            .from("posts")
            .select(
              `
              id,
              subject,
              content,
              request_help,
              created_at,
              user_id,
              thread_id,
              profiles!inner(id, full_name, role)
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && data) {
            setPosts((prev) => [{ ...(data as any), replies: [] }, ...prev]);
          }
        }
      )
      .subscribe();

    // Subscribe to new replies
    const repliesChannel = supabase
      .channel("replies_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "replies",
        },
        async (payload) => {
          console.log("New reply received:", payload);
          // Fetch the complete reply with profile data
          const { data, error } = await supabase
            .from("replies")
            .select(
              `
              id,
              content,
              created_at,
              post_id,
              profiles!inner(id, full_name, role)
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && data) {
            setPosts((prev) =>
              prev.map((post) =>
                post.id === data.post_id
                  ? { ...post, replies: [...(post.replies || []), data as any] }
                  : post
              )
            );
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(repliesChannel);
    };
  }, [threadId]); // Re-run when threadId changes

  // Send new post
  async function sendPost() {
    if (!newPost.subject.trim() && !newPost.content.trim()) return;

    const { error } = await supabase.from("posts").insert([
      {
        user_id: currentUserId,
        thread_id: threadId,
        ...newPost,
      },
    ]);

    if (error) {
      console.error("Error creating post:", error);
    } else {
      setNewPost({ subject: "", content: "", request_help: false });
      // Real-time subscription will handle adding the post to the UI
    }
  }

  // Send reply
  async function sendReply(postId: string | number) {
    const content = replyText[postId];
    if (!content?.trim()) return;

    const { error } = await supabase.from("replies").insert([
      {
        post_id: postId,
        user_id: currentUserId,
        content,
      },
    ]);

    if (error) {
      console.error("Error creating reply:", error);
    } else {
      setReplyText((prev) => ({ ...prev, [postId]: "" }));
      // Real-time subscription will handle adding the reply to the UI
    }
  }

  return (
    <div className="relative h-full">
      {/* Posts Section - Scrollable with bottom padding to avoid form overlap */}
      <div
        className="absolute inset-0 overflow-y-auto"
        style={{ paddingBottom: "200px" }}
      >
        <div className="p-4 space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 border rounded space-y-2 bg-white"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold">
                  {post.profiles.full_name} ({post.profiles.role})
                </span>
                {post.request_help && (
                  <span className="text-red-500 font-semibold">
                    Help Requested
                  </span>
                )}
              </div>
              <h3 className="font-semibold">{post.subject}</h3>
              <p>{post.content}</p>

              {/* Replies */}
              <div className="pl-4 mt-2 border-l space-y-2">
                {post.replies?.map((reply) => (
                  <div key={reply.id} className="p-2 rounded bg-gray-100">
                    <span className="font-bold">
                      {reply.profiles.full_name}:
                    </span>{" "}
                    {reply.content}
                  </div>
                ))}

                {/* Reply Input */}
                <div className="flex mt-2">
                  <input
                    type="text"
                    className="flex-1 border rounded p-2 mr-2"
                    placeholder="Write a reply..."
                    value={replyText[post.id] || ""}
                    onChange={(e) =>
                      setReplyText((prev) => ({
                        ...prev,
                        [post.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && sendReply(post.id)}
                  />
                  <button
                    onClick={() => sendReply(post.id)}
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Absolutely Positioned Form - Always at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
        <input
          type="text"
          placeholder="Subject"
          className="w-full border p-2 rounded mb-2"
          value={newPost.subject}
          onChange={(e) => setNewPost({ ...newPost, subject: e.target.value })}
        />
        <textarea
          placeholder="Content"
          className="w-full border p-2 rounded mb-2 resize-none"
          rows={3}
          value={newPost.content}
          onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={newPost.request_help}
              onChange={(e) =>
                setNewPost({ ...newPost, request_help: e.target.checked })
              }
              className="mr-2"
            />
            Request Help
          </label>
          <button
            onClick={sendPost}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
