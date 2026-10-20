"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setError("");
    setInfo("");
    setLoading(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) setError(error.message);
      else if (data.session) router.push("/dashboard");
      else setInfo("Check your email to confirm your account, then log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push("/dashboard");
    }

    setLoading(false);
  }

 const input =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <a href="/" className="text-lg font-bold tracking-tight">
          Form<span className="text-accent">Chat</span>
        </a>
        <h1 className="mt-6 text-2xl font-bold">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isSignup && (
            <input className={input} placeholder="Full name" value={name}
              onChange={(e) => setName(e.target.value)} required />
          )}
          <input className={input} type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />

          <div className="relative">
            <input
              className={`${input} pr-12`}
              type={showPassword ? "text" : "password"}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {info && <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-violet-500 py-3 font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {loading ? "Please wait..." : isSignup ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          {isSignup ? "Already have an account? " : "New here? "}
          <a href={isSignup ? "/login" : "/signup"} className="text-accent hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </a>
        </p>
      </div>
    </main>
  );
}