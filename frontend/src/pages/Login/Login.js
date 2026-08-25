import { useState } from "react";
import { LanguageSelect, useI18n } from "../../i18n";
import "./Login.css";

const REMEMBER_KEY = "ssk_remember_email";

function EyeIcon({ off }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 3l18 18M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-1.2M9.9 5.2A10 10 0 0121 12c-.5 1-1.2 2-2 2.8M6.1 6.1C4.4 7.4 3 9.5 2.1 12 3.6 16 7.5 19 12 19c1.6 0 3.1-.3 4.4-.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Login({ onLogin }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || t("couldNotSignIn"));
        return;
      }

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      onLogin(data.user, data.token);
    } catch (err) {
      setError(t("cannotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <LanguageSelect className="lang-switch login-lang" />
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>SSK</h1>

        <label className="login-field">
          <span>{t("email")}</span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="example@gmail.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="login-field">
          <span>{t("password")}</span>
          <div className="login-password">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="@#*%"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
        </label>

        <div className="login-row">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {t("rememberMe")}
          </label>
          <button
            type="button"
            className="login-forgot"
            onClick={() => setInfo(t("askAdminReset"))}
          >
            {t("forgotPassword")}
          </button>
        </div>

        {error ? <p className="login-message login-error">{error}</p> : null}
        {info ? <p className="login-message">{info}</p> : null}

        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? t("signingIn") : t("signIn")}
        </button>
      </form>

      <img className="login-scene" src="/login-footer.png" alt="" />
    </div>
  );
}

export default Login;
