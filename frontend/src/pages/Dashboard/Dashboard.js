import "./Dashboard.css";
import { useI18n } from "../../i18n";

function Dashboard() {
  const { t } = useI18n();
  return (
    <section className="simple-page">
      <h1>{t("titleDashboard")}</h1>
      <p>{t("dashboardSoon")}</p>
    </section>
  );
}

export default Dashboard;
