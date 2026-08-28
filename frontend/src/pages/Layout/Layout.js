import { useEffect, useState } from "react";
import { useI18n, LanguageSelect } from "../../i18n";
import "./Layout.css";

const titles = {
  receipts: ["titleReceipts", "subReceipts"],
  drivers: ["titleDrivers", "subDrivers"],
  expenses: ["titleExpenses", "subExpenses"],
  dashboard: ["titleDashboard", "subDashboard"],
  setting: ["titleSetting", "subSetting"],
};

const menu = [
  { id: "receipts", labelKey: "navReceipts", icon: "receipt" },
  { id: "drivers", labelKey: "navDrivers", icon: "car" },
  { id: "expenses", labelKey: "navExpenses", icon: "card" },
  { id: "dashboard", labelKey: "navDashboard", icon: "grid" },
  { id: "setting", labelKey: "navSetting", icon: "gear" },
];

function MenuIcon({ name }) {
  const icons = {
    receipt: "M6 3h9l5 5v13H6z M15 3v5h5 M9 13h8 M9 17h8",
    car: "M4 14h16v4H4z M6 14l2-5h8l2 5 M7 18v2 M17 18v2",
    card: "M3 7h18v11H3z M3 11h18",
    grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
    gear: "M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3 M12 19v3 M4.2 6.2l2.1 2.1 M17.7 15.7l2.1 2.1 M2 12h3 M19 12h3 M4.2 17.8l2.1-2.1 M17.7 8.3l2.1-2.1",
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function formatClock(date) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const time = date.toLocaleTimeString("en-GB", { hour12: false });
  return `Time ${time} ${days[date.getDay()]}`;
}

function Layout({ user, page, onPage, onLogout, children, dark, onToggleDark, prefs }) {
  const { t, label } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = dark ? "dark" : "light";
    root.classList.toggle("is-dark", dark);
    return () => {
      root.style.colorScheme = "";
      root.classList.remove("is-dark");
    };
  }, [dark]);

  return (
    <div className={`app-shell ${dark ? "is-dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/ssk-logo.png" alt="SSK Transport & Logistics" />
          <div>
            <strong>{prefs?.company || "SSK Company"}</strong>
            <span>{prefs?.tagline || "System Transferring"}</span>
          </div>
        </div>

        <nav>
          {menu.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "is-active" : ""}
              onClick={() => onPage(item.id)}
            >
              <MenuIcon name={item.icon} />
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <button type="button" className="logout" onClick={onLogout}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 6H6v12h4 M10 12h10 M16 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          {t("logout")}
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="title-block">
            <h1>{t(titles[page][0])}</h1>
            <p>{t(titles[page][1])}</p>
          </div>
          <div className="top-tools">
            <LanguageSelect className="chip lang-switch" />
            <button type="button" className="icon-btn" onClick={onToggleDark} aria-label="Theme">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 13a6 6 0 11-7-9 7 7 0 107 9z" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            <div className="clock">{t("time", { value: formatClock(now).replace("Time ", "") })}</div>
            <div className="profile">
              <div className="avatar">{(user.name || "N").slice(0, 1)}</div>
              <div>
                <strong>{user.name || t("name")}</strong>
                <span>{label(user.role || "Admin")}</span>
              </div>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export default Layout;
