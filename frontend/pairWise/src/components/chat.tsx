import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface PostsPanelProps {
  currentUserId: string;
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
  profiles: Profile;
  replies?: Reply[];
}

interface NewPost {
  subject: string;
  content: string;
  request_help: boolean;
}

export default function PostsPanel({ currentUserId }: PostsPanelProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState<NewPost>({
    subject: "",
    content: "",
    request_help: false,
  });
  const [replyText, setReplyText] = useState<Record<string, string>>({}); // postId -> text

  // Load posts with author profiles
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
          profiles!inner(id, full_name, role),
          replies(
            id,
            content,
            created_at,
            profiles!inner(id, full_name, role)
          )
        `
        )
        .order("created_at", { ascending: true });

      if (error) return console.error(error);
      setPosts((data as any) || []);
    }
    loadPosts();
  }, []);

  // Send new post
  async function sendPost() {
    if (!newPost.subject.trim() && !newPost.content.trim()) return;
    const { error } = await supabase.from("posts").insert([
      {
        user_id: currentUserId,
        ...newPost,
      },
    ]);
    if (error) {
      console.error(error);
    } else {
      setNewPost({ subject: "", content: "", request_help: false });
      // Reload posts to show the new one
      loadPostsAgain();
    }
  }

  // Helper function to reload posts
  async function loadPostsAgain() {
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
        profiles!inner(id, full_name, role),
        replies(
          id,
          content,
          created_at,
          profiles!inner(id, full_name, role)
        )
      `
      )
      .order("created_at", { ascending: true });

    if (error) return console.error(error);
    setPosts((data as any) || []);
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
      console.error(error);
    } else {
      setReplyText((prev) => ({ ...prev, [postId]: "" }));
      // Reload posts to show the new reply
      loadPostsAgain();
    }
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
      {/* New Post Form */}
      <div className="p-4 border rounded bg-gray-50">
        <input
          type="text"
          placeholder="Subject"
          className="w-full border p-2 rounded mb-2"
          value={newPost.subject}
          onChange={(e) => setNewPost({ ...newPost, subject: e.target.value })}
        />
        <textarea
          placeholder="content"
          className="w-full border p-2 rounded mb-2"
          value={newPost.content}
          onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
        />
        <label className="flex items-center mb-2">
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
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Post
        </button>
      </div>

      {/* Posts */}
      {posts.map((post) => (
        <div key={post.id} className="p-4 border rounded space-y-2 bg-white">
          <div className="flex justify-between items-center">
            <span className="font-bold">
              {post.profiles.full_name} ({post.profiles.role})
            </span>
            {post.request_help && (
              <span className="text-red-500 font-semibold">Help Requested</span>
            )}
          </div>
          <h3 className="font-semibold">{post.subject}</h3>
          <p>{post.content}</p>

          {/* Replies */}
          <div className="pl-4 mt-2 border-l space-y-2">
            {post.replies?.map((reply) => (
              <div key={reply.id} className="p-2 rounded bg-gray-100">
                <span className="font-bold">{reply.profiles.full_name}:</span>{" "}
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
  );
}
