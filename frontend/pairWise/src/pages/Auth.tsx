import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Check your email for confirmation link!");
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded shadow">
      <h1 className="text-xl mb-4">Login / Signup</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mb-2 p-2 border rounded"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full mb-2 p-2 border rounded"
      />
      <div className="flex justify-between">
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Login
        </button>
        <button
          onClick={handleSignUp}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Sign Up
        </button>
      </div>
    </div>
  );
}
