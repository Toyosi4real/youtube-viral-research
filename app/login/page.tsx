"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      return;
    }

    // cookie is now set; refresh + push so middleware sees it
    router.refresh();
    router.push("/dashboard");
  }

  async function signUp() {
    setMsg(null);
    const { error } = await supabaseBrowser.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else setMsg("Account created. If email confirmation is on, check your inbox, then sign in.");
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>Sign in</h1>
      <form onSubmit={signIn}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        <button style={{ width: "100%", marginBottom: 8 }} type="submit">Sign in</button>
        <button style={{ width: "100%" }} type="button" onClick={signUp}>Create account</button>
      </form>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
