import { useState, type ReactNode } from "react";

const SESSION_KEY = "admin_authed";

async function checkPassword(password: string): Promise<boolean> {
  const res = await fetch("/api/admin/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (authed) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await checkPassword(input);
    setLoading(false);
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, "1");
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
