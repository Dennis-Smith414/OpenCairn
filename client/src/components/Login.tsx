import { useState } from "react";
import styles from "./Login.module.css";
import logo from "../assets/logo.png"; // 
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError("Please enter a username and password.");
      return;
    }

    alert(`Logged in as ${username} (demo)`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo */}
        <img src={logo} alt="OpenCairn Logo" className={styles.logo} />

        {/* Title */}
        <h1 className={styles.title}>Welcome to OpenCairn</h1>

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
              required
            />
          </label>
          <div className="card">

            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            

            </div>
          </div>
          <label className={styles.label}>
            Password
            <div style={{ position: "relative" }}>
              <input
                className={`${styles.input} ${styles.inputWithToggle}`}
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className={styles.toggle}
              >
                {showPwd ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.button}>
            Log In
          </button>
          <button
            type="button"
            className={styles.Create_button}
            onClick={() => navigate("/register")}  // must be lowercase to match route
          >
            Create Account
          </button>
          <button type="submit" className={styles.Map_button}>
            Demo Map
          </button>
            <Link to="/trails">
                  <button type="button"className={styles.Trails_button}  style={{ width: "100%", padding: 12 }}>Trails</button>
            </Link>
        </form>
      </div>
    </div>
  );
}
