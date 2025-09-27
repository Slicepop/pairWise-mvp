import { useState, useEffect } from "react";
import Auth from "./pages/Auth";
import EditorPage from "./pages/EditorPage";
import { supabase } from "./lib/supabaseClient";

function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user));
    supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user)
    );
  }, []);

  // For testing purposes, redirect to EditorPage instead of Dashboard
  return <div>{user ? <EditorPage /> : <Auth />}</div>;
}

export default App;
