import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Threads from "../components/threads";
import PostsPanel from "../components/MessagesPanel";
import type { Thread } from "../components/threads";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"mentor" | "student" | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user;
      setUser(currentUser);

      // Check if user needs to select a role (for Google OAuth users)
      if (currentUser && !currentUser.user_metadata?.role) {
        setShowRoleModal(true);
      }
    });
  }, []);

  const handleRoleSelection = async () => {
    if (!selectedRole || !user) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { role: selectedRole },
      });

      if (error) {
        console.error("Error updating user role:", error);
      } else {
        setShowRoleModal(false);
        // Refresh user data
        const {
          data: { user: updatedUser },
        } = await supabase.auth.getUser();
        setUser(updatedUser);
      }
    } catch (err) {
      console.error("Error updating role:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <p>Loading...</p>;

  return (
    <>
      {/* Role Selection Modal for Google OAuth users */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full mx-4">
            <h2 className="text-xl font-semibold text-center mb-6">
              Welcome! Choose your role
            </h2>
            <p className="text-gray-600 text-center mb-6">
              To get started, please let us know if you're here to mentor or
              learn.
            </p>

            <div className="space-y-3">
              <button
                className={`w-full rounded-lg px-4 py-3 font-medium border transition-colors ${
                  selectedRole === "mentor"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-blue-600 border-blue-600 hover:bg-blue-50"
                }`}
                onClick={() => setSelectedRole("mentor")}
              >
                <div className="text-left">
                  <div className="font-semibold">I'm a Mentor</div>
                  <div className="text-sm opacity-80">
                    I want to share my knowledge and help others
                  </div>
                </div>
              </button>

              <button
                className={`w-full rounded-lg px-4 py-3 font-medium border transition-colors ${
                  selectedRole === "student"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-purple-600 border-purple-600 hover:bg-purple-50"
                }`}
                onClick={() => setSelectedRole("student")}
              >
                <div className="text-left">
                  <div className="font-semibold">I'm a Student</div>
                  <div className="text-sm opacity-80">
                    I want to learn from experienced mentors
                  </div>
                </div>
              </button>
            </div>

            <button
              className="w-full mt-6 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedRole || loading}
              onClick={handleRoleSelection}
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col h-screen">
        {/* Header Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-800">PairWise</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {user.user_metadata?.role || "User"}
                </div>
              </div>

              {/* Role Badge */}
              <div
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.user_metadata?.role === "mentor"
                    ? "bg-blue-100 text-blue-800"
                    : user.user_metadata?.role === "student"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {user.user_metadata?.role === "mentor"
                  ? "🎓 Mentor"
                  : user.user_metadata?.role === "student"
                  ? "📚 Student"
                  : "👤 User"}
              </div>

              {/* Logout Button */}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Threads onSelect={(t) => setActiveThread(t)} />

          <main className="flex-1 p-4">
            {activeThread ? (
              <div className="flex flex-col h-full">
                <h1 className="text-xl font-bold mb-4">
                  {activeThread.name} Thread
                </h1>
                <div className="flex-1">
                  <PostsPanel
                    currentUserId={user.id}
                    threadId={activeThread.threadID}
                  />
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Select a thread to start chatting</p>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
