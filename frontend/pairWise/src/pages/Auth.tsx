import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [remember, setRemember] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"mentor" | "student" | null>(
    null
  );

  const resetMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const validate = () => {
    resetMessages();
    if (!email) {
      setErrorMsg("Please enter your email.");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrorMsg("Please enter a valid email address.");
      return false;
    }
    if (isSignup && (!fullName || fullName.trim().length < 2)) {
      setErrorMsg("Please enter your full name (at least 2 characters).");
      return false;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return false;
    }
    return true;
  };

  const handleAuth = async () => {
    if (!validate()) return;

    if (isSignup) {
      // Show role selection modal for signup
      setShowRoleModal(true);
      return;
    }

    // Handle sign in
    setLoading(true);
    resetMessages();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg("Welcome back!");
        // Optionally persist session: supabase client handles session automatically.
        // Use `remember` to set some local preference if desired.
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupWithRole = async () => {
    if (!selectedRole) return;

    setLoading(true);
    resetMessages();

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: selectedRole,
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(
          "Sign-up successful — check your email for a confirmation link."
        );
        setShowRoleModal(false);
        setSelectedRole(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    resetMessages();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}`,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    resetMessages();
    if (!email) {
      setErrorMsg("Enter your email to receive a reset link.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-callback",
      });
      if (error) setErrorMsg(error.message);
      else setSuccessMsg("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Role Selection Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full mx-4">
            <h2 className="text-xl font-semibold text-center mb-6">
              Choose your role
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Are you looking to mentor someone or learn from a mentor?
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

            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedRole(null);
                }}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedRole || loading}
                onClick={handleSignupWithRole}
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white/70 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-md bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              PW
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">
                {isSignup ? "Create account" : "Welcome back"}
              </h1>
              <p className="text-sm text-slate-500">
                {isSignup
                  ? "Let’s get you started — fast and secure."
                  : "Sign in to continue."}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 p-3 rounded">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-100 p-3 rounded">
              {successMsg}
            </div>
          )}

          <div className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="text-xs text-slate-500">Full Name</span>
                <div className="mt-1 relative">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="peer w-full rounded-lg border border-gray-200 px-4 py-2 text-sm placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoComplete="name"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="text-xs text-slate-500">Email</span>
              <div className="mt-1 relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="peer w-full rounded-lg border border-gray-200 px-4 py-2 text-sm placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="block">
              <span className="flex justify-between text-xs text-slate-500">
                <span>Password</span>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-xs text-blue-600 hover:underline focus:outline-none"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>
            </label>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={loading}
                className="text-blue-600 hover:underline disabled:opacity-60"
              >
                Forgot password?
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={handleAuth}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white font-semibold shadow hover:brightness-105 disabled:opacity-60"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : null}
                <span>{isSignup ? "Create account" : "Sign in"}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <div className="px-2">or</div>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 bg-white text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4 text-gray-600"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M21 12.3c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.1-1.9 2.8v2.3h3.1c1.8-1.7 2.8-4.3 2.8-7.8z" />
                    <path d="M12 22c2.7 0 5-0.9 6.7-2.3l-3.1-2.3c-.9.6-2.1 1-3.6 1-2.8 0-5.2-1.9-6-4.6H2.7v2.9C4.4 19.9 8 22 12 22z" />
                    <path d="M6 13.8A6.8 6.8 0 015.6 12c0-.6.1-1.1.4-1.6V7.5H3.1A10 10 0 002 12c0 1.6.4 3.1 1.1 4.5L6 13.8z" />
                    <path d="M12 6.5c1.5 0 2.9.5 4 1.6l3-3A10 10 0 0012 2 9.8 9.8 0 006 7.5l3 1.9c.9-2.7 3.2-4.6 5.9-4.9z" />
                  </svg>
                )}
                {loading ? "Signing in..." : "Google"}
              </button>

              <button
                type="button"
                onClick={() => setIsSignup((s) => !s)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2 bg-gray-100 text-sm hover:bg-gray-200"
              >
                {isSignup ? "Already have an account?" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
