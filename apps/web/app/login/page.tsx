"use client";
// app/login/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";

export default function LoginPage() {
  const [mode,     setMode]     = useState<"login" | "register">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const { login, register } = useAuth();
  const router = useRouter();

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const user = mode === "login"
        ? await login(email, password)
        : await register(email, password);
      router.push(user.role === "ADMIN" ? "/admin" : "/matches");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: "var(--bg3)", border: "1px solid var(--grid-line)",
    borderRadius: "3px", color: "var(--text)",
    fontFamily: "var(--font-mono)", fontSize: "13px",
    letterSpacing: "1px", outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: "380px",
        display: "flex", flexDirection: "column", gap: "24px",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--font-hud)", fontSize: "9px",
            letterSpacing: "6px", color: "var(--text-dim)", marginBottom: "6px",
          }}>
            SECURE ACCESS
          </div>
          <h1 style={{
            fontFamily: "var(--font-hud)", fontSize: "28px", fontWeight: 900,
            letterSpacing: "4px",
            background: "linear-gradient(90deg, var(--amber), var(--cyan))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            MODEL WARS
          </h1>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px",
          background: "var(--bg2)", border: "1px solid var(--grid-line)",
          borderRadius: "4px", padding: "4px",
        }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
              padding: "8px", borderRadius: "2px", border: "none",
              fontFamily: "var(--font-mono)", fontSize: "11px",
              letterSpacing: "2px", cursor: "pointer", transition: "all 0.2s",
              background: mode === m ? "var(--amber-glow)" : "transparent",
              color:      mode === m ? "var(--amber)"     : "var(--text-dim)",
              borderBottom: mode === m ? "1px solid var(--amber-dim)" : "1px solid transparent",
              textTransform: "uppercase",
            }}>
              {m}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--text-dim)",
              display: "block", marginBottom: "6px" }}>EMAIL</label>
            <input
              type="email" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={inputStyle}
              placeholder="operator@example.com"
            />
          </div>
          <div>
            <label style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--text-dim)",
              display: "block", marginBottom: "6px" }}>PASSWORD</label>
            <input
              type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 12px", background: "rgba(80,0,0,0.4)",
              border: "1px solid #600000", borderRadius: "3px",
              fontSize: "11px", color: "#ff6060", letterSpacing: "0.5px",
            }}>
              ⚠ {error}
            </div>
          )}

          <button onClick={submit} disabled={loading || !email || !password} style={{
            padding: "12px", marginTop: "4px",
            background: loading ? "var(--bg3)" : "var(--amber-glow)",
            border: `1px solid ${loading ? "var(--grid-line)" : "var(--amber-dim)"}`,
            borderRadius: "3px", color: loading ? "var(--text-dim)" : "var(--amber)",
            fontFamily: "var(--font-mono)", fontSize: "12px", letterSpacing: "3px",
            cursor: loading ? "not-allowed" : "pointer", textTransform: "uppercase",
            transition: "all 0.2s",
          }}>
            {loading ? "AUTHENTICATING..." : mode === "login" ? "ACCESS GRANTED" : "CREATE ACCOUNT"}
          </button>
        </div>

        <div style={{ textAlign: "center", fontSize: "10px", color: "var(--text-dim)",
          letterSpacing: "1px" }}>
          The first registered account becomes ADMIN.
        </div>
      </div>
    </div>
  );
}
