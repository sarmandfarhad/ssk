import { useState } from "react";
import { USER_KEY, apiSend } from "../../api";
import { LANGS, useI18n } from "../../i18n";
import "./Setting.css";

function Setting({ user, onUser, dark, onToggleDark, prefs, onPrefs }) {
  const { t, lang, setLang, label } = useI18n();
  const [name, setName] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [passError, setPassError] = useState("");
  const [company, setCompany] = useState(prefs.company);
  const [tagline, setTagline] = useState(prefs.tagline);
  const [companyMsg, setCompanyMsg] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMsg("");
    setProfileError("");
    try {
      const data = await apiSend("/api/auth/profile", "PUT", { name });
      onUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setProfileMsg(t("profileSaved"));
    } catch (err) {
      setProfileError(err.message);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPassMsg("");
    setPassError("");
    if (nextPassword !== confirmPassword) {
      setPassError(t("passwordMismatch"));
      return;
    }
    try {
      const data = await apiSend("/api/auth/password", "PUT", { currentPassword, nextPassword });
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setPassMsg(data.message || t("updatePassword"));
    } catch (err) {
      setPassError(err.message);
    }
  }

  function saveCompany(event) {
    event.preventDefault();
    onPrefs({ ...prefs, company: company.trim() || "SSK Company", tagline: tagline.trim() || "System Transferring", language: lang });
    setCompanyMsg(t("companySaved"));
  }

  function changeLanguage(next) {
    setLang(next);
    onPrefs({ ...prefs, language: next });
  }

  const languageName = lang === "KU" ? t("kurdishSorani") : lang === "AR" ? t("arabic") : t("english");

  return (
    <div className="settings-wrap">
      <section className="settings-hero">
        <div className="settings-avatar">{(user?.name || "S").slice(0, 1)}</div>
        <div>
          <h2>{user?.name}</h2>
          <p>{user?.email} · {label(user?.role || "Admin")}</p>
        </div>
      </section>

      <div className="settings-grid">
        <form className="settings-card" onSubmit={saveProfile}>
          <h3>{t("profile")}</h3>
          <p className="settings-copy">{t("profileCopy")}</p>
          <label>{t("fullName")}
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>{t("email")}
            <input value={user?.email || ""} readOnly />
          </label>
          <label>{t("role")}
            <input value={label(user?.role || "Admin")} readOnly />
          </label>
          {profileError ? <p className="settings-error">{profileError}</p> : null}
          {profileMsg ? <p className="settings-ok">{profileMsg}</p> : null}
          <button type="submit" className="settings-btn">{t("saveProfile")}</button>
        </form>

        <form className="settings-card" onSubmit={savePassword}>
          <h3>{t("password")}</h3>
          <p className="settings-copy">{t("passwordCopy")}</p>
          <label>{t("currentPassword")}
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label>{t("newPassword")}
            <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
          </label>
          <label>{t("confirmPassword")}
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          {passError ? <p className="settings-error">{passError}</p> : null}
          {passMsg ? <p className="settings-ok">{passMsg}</p> : null}
          <button type="submit" className="settings-btn">{t("updatePassword")}</button>
        </form>

        <section className="settings-card">
          <h3>{t("appearance")}</h3>
          <p className="settings-copy">{t("appearanceCopy")}</p>
          <div className="settings-row">
            <div>
              <strong>{t("darkMode")}</strong>
              <span>{dark ? t("on") : t("off")}</span>
            </div>
            <button type="button" className={`toggle ${dark ? "is-on" : ""}`} onClick={onToggleDark} aria-label={t("darkMode")}>
              <span />
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>{t("language")}</strong>
              <span>{languageName}</span>
            </div>
            <div className="lang-pills">
              {Object.values(LANGS).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={lang === item.id ? "is-on" : ""}
                  onClick={() => changeLanguage(item.id)}
                >
                  {item.short}
                </button>
              ))}
            </div>
          </div>
        </section>

        <form className="settings-card" onSubmit={saveCompany}>
          <h3>{t("company")}</h3>
          <p className="settings-copy">{t("companyCopy")}</p>
          <label>{t("companyName")}
            <input value={company} onChange={(event) => setCompany(event.target.value)} />
          </label>
          <label>{t("tagline")}
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} />
          </label>
          {companyMsg ? <p className="settings-ok">{companyMsg}</p> : null}
          <button type="submit" className="settings-btn">{t("saveCompany")}</button>
        </form>
      </div>

      <section className="settings-card about-card">
        <h3>{t("about")}</h3>
        <div className="about-grid">
          <p><span>{t("system")}</span><b>SSK ERP</b></p>
          <p><span>{t("staffLogins")}</span><b>Shahram · Kamaran</b></p>
          <p><span>{t("modules")}</span><b>{t("navReceipts")} · {t("navDrivers")} · {t("navExpenses")}</b></p>
          <p><span>{t("signedInAs")}</span><b>{user?.name} ({user?.email})</b></p>
        </div>
      </section>
    </div>
  );
}

export default Setting;
