import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Login.module.css"; // reuse your styles

const API = import.meta.env.VITE_API_URL || "http://localhost:5100";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setOk(false);

  try {
    const r = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "Failed");

    setOk(true);


    setTimeout(() => navigate("/"), 1500);
  } catch (err: any) {
    setError(err.message || "Failed to register");
  }
}


  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your OpenCairn account</h1>

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className={styles.label}>
            Password
            <div className={styles.passwordWrapper}>
              <input
                className={`${styles.input} ${styles.passwordInput}`}
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 chars, 1 uppercase, 1 symbol"
                required
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowPwd((s) => !s)}
              >
                {showPwd ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div className={styles.error}>{error}</div>}
          {ok && <div className={styles.success}>Account created! You can now log in.</div>}

          <button type="submit" className={styles.button}>
            Create Account
          </button>

          {/* Back button */}
          <button
            type="button"
            className={styles.Map_button} 
            onClick={() => navigate("/")}
          >
            ← Back to Login
          </button>
        </form>
      </div>
    </div>
  );
}
