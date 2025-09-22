import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Chat from "../components/chat";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user)
    );
  }, []);

  if (!user) return <p>Loading...</p>;

  return (
    <div className="p-6">
      <h1 className="text-xl mb-4">Welcome, {user.email}</h1>
      <p>Dashboard placeholder — Week 1 MVP goal!</p>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
        }}
        className="px-4 py-2 bg-red-500 text-white rounded"
      >
        Logout
      </button>

      <div className="mt-6">
        <Chat />
      </div>
    </div>
  );
}
