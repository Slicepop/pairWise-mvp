import { useState, useEffect } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import { supabase } from "./lib/supabaseClient";

function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user));
    supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user)
    );
  }, []);

  return <div>{user ? <Dashboard /> : <Auth />}</div>;
}

export default App;
