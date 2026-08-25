import { useState } from "react";
import Login from "./pages/Login/Login";
import Layout from "./pages/Layout/Layout";
import Receipts from "./pages/Receipts/Receipts";
import Drivers from "./pages/Drivers/Drivers";
import ExpenseClaims from "./pages/ExpenseClaims/ExpenseClaims";
import Dashboard from "./pages/Dashboard/Dashboard";
import Setting from "./pages/Setting/Setting";
import { TOKEN_KEY, USER_KEY, PREFS_KEY, DARK_KEY } from "./api";
import { useI18n } from "./i18n";
import "./App.css";

function loadPrefs() {
  try {
    return {
      language: "EN",
      company: "SSK Company",
      tagline: "System Transferring",
      ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"),
    };
  } catch (error) {
    return { language: "EN", company: "SSK Company", tagline: "System Transferring" };
  }
}

function App() {
  const { lang, setLang } = useI18n();
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (error) {
      return null;
    }
  });
  const [page, setPage] = useState("receipts");
  const [dark, setDark] = useState(() => localStorage.getItem(DARK_KEY) === "1");
  const [prefs, setPrefs] = useState(loadPrefs);

  function handleLogin(nextUser, token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setPage("receipts");
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  function toggleDark() {
    setDark((value) => {
      const next = !value;
      localStorage.setItem(DARK_KEY, next ? "1" : "0");
      return next;
    });
  }

  function savePrefs(next) {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    if (next.language && next.language !== lang) {
      setLang(next.language);
    }
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout
      user={user}
      page={page}
      onPage={setPage}
      onLogout={handleSignOut}
      dark={dark}
      onToggleDark={toggleDark}
      prefs={prefs}
    >
      {page === "receipts" ? <Receipts /> : null}
      {page === "drivers" ? <Drivers /> : null}
      {page === "expenses" ? <ExpenseClaims user={user} /> : null}
      {page === "dashboard" ? <Dashboard /> : null}
      {page === "setting" ? (
        <Setting
          user={user}
          onUser={setUser}
          dark={dark}
          onToggleDark={toggleDark}
          prefs={prefs}
          onPrefs={savePrefs}
        />
      ) : null}
    </Layout>
  );
}

export default App;
