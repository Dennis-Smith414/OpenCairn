import React, { useState } from "react";
import styles from "./Login.module.css";
import logo from "../assets/logo.png";
import { useNavigate, Link } from "react-router-dom";

const API =
  (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_API_BASE ||
  (window as unknown as { __API_BASE__?: string })?.__API_BASE__ ||
  "http://localhost:5000";

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPwd, setShowPwd] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!emailOrUsername || !password) {
      setError("emailOrUsername and password required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername, password }),
      });

      // Non-2xx -> show API error if present
      const text = await res.text();
      let json: { ok?: boolean; token?: string; error?: string } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        /* ignore; json stays {} */
      }

      if (!res.ok || !json.ok || !json.token) {
        const msg = json.error || `Login failed (${res.status})`;
        setError(msg);
        return;
      }

      // success: persist token and continue
      localStorage.setItem("token", json.token);
      navigate("/", { replace: true }); // adjust if your route is different
    } catch (err) {
      setError((err as Error).message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img src={logo} alt="OpenCairn Logo" className={styles.logo} />
        <h1 className={styles.title}>Welcome to OpenCairn</h1>

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              type="text"
              value={emailOrUsername}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmailOrUsername(e.target.value)
              }
              placeholder="email or username"
              autoComplete="username"
              required
              disabled={loading}
            />
          </label>

          <label className={styles.label}>
            Password
            <div style={{ position: "relative" }}>
              <input
                className={`${styles.input} ${styles.inputWithToggle}`}
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className={styles.toggle}
                disabled={loading}
              >
                {showPwd ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Logging in…" : "Log In"}
          </button>

          <button
            type="button"
            className={styles.Create_button}
            onClick={() => navigate("/register")}
            disabled={loading}
          >
            Create Account
          </button>

          <button type="button" className={styles.Map_button} disabled={loading}>
            Demo Map
          </button>

          <Link to="/routes">
            <button
              type="button"
              className={styles.Routes_button}
              style={{ width: "100%", padding: 12 }}
              disabled={loading}
            >
              Routes
            </button>
          </Link>
        </form>
      </div>
    </div>
  );
}
