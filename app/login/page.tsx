"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  async function signUp() {
    setMsg(null);
    setLoading(true);

    const { error } = await supabaseBrowser.auth.signUp({ email, password });

    setLoading(false);

    if (error) setMsg(error.message);
    else setMsg("Account created. Please sign in.");
  }

  return (
    <main className="min-h-screen text-white">
      <div className="fixed inset-0 -z-10 bg-[#05060a]">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_top,_rgba(34,255,170,0.20),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(139,92,246,0.20),_transparent_55%)]" />
        <div className="absolute inset-0 opacity-35 bg-[linear-gradient(to_right,rgba(34,255,170,0.10),transparent_35%,rgba(139,92,246,0.10))]" />
      </div>

      <div className="mx-auto max-w-md px-4 pt-24">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-[0_0_60px_rgba(34,255,170,0.08)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.9),rgba(139,92,246,0.7))] shadow-[0_0_24px_rgba(34,255,170,0.25)] animate-pulse" />
            <div>
              <div className="text-xl font-semibold">Kelvin YouTube Short Channel Finder</div>
              <div className="text-xs text-white/60">Sign in</div>
            </div>
          </div>

          <form onSubmit={signIn} className="mt-6 space-y-3">
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <button
              disabled={loading}
              className="w-full rounded-2xl px-4 py-3 text-sm font-semibold
                         bg-[linear-gradient(135deg,rgba(34,255,170,0.25),rgba(139,92,246,0.25))]
                         border border-white/15 hover:border-white/25 transition
                         shadow-[0_0_24px_rgba(34,255,170,0.18)] disabled:opacity-60"
              type="submit"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <button
              disabled={loading}
              className="w-full rounded-2xl px-4 py-3 text-sm font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition disabled:opacity-60"
              type="button"
              onClick={signUp}
            >
              Create account
            </button>
          </form>

          {msg && <p className="mt-4 text-sm text-white/80">{msg}</p>}
        </div>
      </div>
    </main>
  );
}
