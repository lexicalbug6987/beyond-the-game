import { useState, type ReactNode } from "react";
import { ADMIN_TOKEN_KEY } from "./adminAuth";

async function checkPassword(password: string): Promise<string | null> {
  const res = await fetch("/api/admin/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { token?: string };
  return body.token ?? null;
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY)));
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (authed) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const token = await checkPassword(input);
    setLoading(false);
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAuthed(true);
    } else {
      setError("Incorrect password");
      setInput("");
    }
  }

  return (
    <div className="admin-gate">
      <form className="admin-gate-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Beyond the Game · Admin</p>
        <h1>Enter password</h1>
        <input
          type="password"
          className="text-input"
          placeholder="Password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          disabled={loading}
        />
        {error && <p className="admin-gate-error">{error}</p>}
        <button type="submit" className="primary" disabled={loading || !input}>
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
