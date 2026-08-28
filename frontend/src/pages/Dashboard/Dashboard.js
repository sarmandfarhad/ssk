import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api";
import { useI18n } from "../../i18n";
import "./Dashboard.css";

function money(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) {
    return `IQD ${(n / 1000000).toFixed(n >= 10000000 ? 1 : 2)}M`;
  }
  if (n >= 1000) {
    return `IQD ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  }
  return `IQD ${n.toLocaleString()}`;
}

function shortMoney(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(Math.round(n));
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "delivered" || value === "paid" || value === "active") return "is-ok";
  if (value === "pending" || value === "unpaid") return "is-warn";
  if (value === "in transmit" || value === "in transit") return "is-info";
  if (value === "canceled") return "is-bad";
  return "";
}

function BarChart({ items, valueKey = "count", color = "#0e79a7" }) {
  const max = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);
  return (
    <div className="dash-bars" role="img" aria-label="chart">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const height = Math.max((value / max) * 100, value ? 8 : 0);
        return (
          <div key={item.label} className="dash-bar-col">
            <div className="dash-bar-track">
              <div
                className="dash-bar-fill"
                style={{ height: `${height}%`, background: color }}
                title={`${item.label}: ${value}`}
              />
            </div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TwinBars({ items }) {
  const max = Math.max(
    ...items.flatMap((item) => [Number(item.revenue) || 0, Number(item.expenses) || 0]),
    1
  );
  return (
    <div className="dash-twin" role="img" aria-label="revenue expenses">
      {items.map((item) => (
        <div key={item.label} className="dash-twin-col">
          <div className="dash-twin-track">
            <div
              className="dash-twin-fill is-rev"
              style={{ height: `${Math.max(((Number(item.revenue) || 0) / max) * 100, item.revenue ? 6 : 0)}%` }}
              title={`Revenue ${shortMoney(item.revenue)}`}
            />
            <div
              className="dash-twin-fill is-exp"
              style={{ height: `${Math.max(((Number(item.expenses) || 0) / max) * 100, item.expenses ? 6 : 0)}%` }}
              title={`Expenses ${shortMoney(item.expenses)}`}
            />
          </div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}

function fullMoney(value) {
  return `IQD ${Number(value || 0).toLocaleString()}`;
}

function Dashboard({ onPage }) {
  const { t, label } = useI18n();
  const [range, setRange] = useState("monthly");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [financeTab, setFinanceTab] = useState("overview");
  const [finance, setFinance] = useState(null);
  const [financeError, setFinanceError] = useState("");
  const [financeLoading, setFinanceLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet(`/api/dashboard?range=${range}`)
      .then((payload) => {
        if (alive) {
          setData(payload);
          setError("");
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || t("dashboardLoadError"));
          setData(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range, t]);

  async function openFinance() {
    setFinanceOpen(true);
    setFinanceTab("overview");
    setFinanceLoading(true);
    setFinanceError("");
    try {
      const payload = await apiGet("/api/dashboard/finance");
      setFinance(payload);
    } catch (err) {
      setFinance(null);
      setFinanceError(err.message || t("dashFinanceLoadError"));
    } finally {
      setFinanceLoading(false);
    }
  }

  const kpis = data?.kpis || {};
  const fleet = data?.fleetStatus || { active: 0, onTrip: 0, idle: 0, total: 0 };
  const fleetTotal = fleet.total || 1;
  const financeSummary = finance?.summary || {};

  const actionCopy = useMemo(
    () => ({
      open_deliveries: {
        title: t("dashActionOpenDeliveries"),
        hint: t("dashActionOpenDeliveriesHint"),
      },
      unpaid: {
        title: t("dashActionUnpaid"),
        hint: t("dashActionUnpaidHint"),
      },
      missing_invoice: {
        title: t("dashActionMissingInvoice"),
        hint: t("dashActionMissingInvoiceHint"),
      },
      expenses: {
        title: t("dashActionExpenses"),
        hint: t("dashActionExpensesHint"),
      },
    }),
    [t]
  );

  return (
    <section className="dash-wrap">
      <div className="dash-toolbar">
        <div className="dash-range">
          <button type="button" className={range === "weekly" ? "is-on" : ""} onClick={() => setRange("weekly")}>
            {t("dashWeekly")}
          </button>
          <button type="button" className={range === "monthly" ? "is-on" : ""} onClick={() => setRange("monthly")}>
            {t("dashMonthly")}
          </button>
        </div>
        <div className="dash-tools">
          <button type="button" className="ghost-btn" onClick={() => window.print()}>
            {t("dashExport")}
          </button>
          <button type="button" className="primary-btn" onClick={() => onPage?.("receipts")}>
            + {t("dashNewShipment")}
          </button>
        </div>
      </div>

      {error ? <p className="page-error">{error}</p> : null}
      {loading && !data ? <p className="dash-loading">{t("loading")}</p> : null}

      <div className="dash-kpis">
        <article className="kpi kpi-blue">
          <span>{t("dashTotalShipments")}</span>
          <strong>{kpis.totalShipments ?? "—"}</strong>
          <small>{t("dashAllTime")}</small>
        </article>
        <article className="kpi kpi-mint">
          <span>{t("dashActiveVehicles")}</span>
          <strong>
            {kpis.activeVehicles ?? 0}/{kpis.totalVehicles ?? 0}
          </strong>
          <small>{t("dashDriversActive")}</small>
        </article>
        <article className="kpi kpi-lilac">
          <span>{t("dashDeliveryRate")}</span>
          <strong>{kpis.deliveryRate ?? 0}%</strong>
          <small>{t("dashDeliveredShare")}</small>
        </article>
        <button type="button" className="kpi kpi-amber is-click" onClick={openFinance}>
          <span>{t("dashRevenue")}</span>
          <strong>{money(kpis.revenue)}</strong>
          <small>{t("dashRevenueClickHint")}</small>
        </button>
      </div>

      <div className="dash-grid-2">
        <article className="dash-card">
          <header>
            <h3>{t("dashShipmentAnalytics")}</h3>
            <span>{range === "weekly" ? t("dashWeekly") : t("dashMonthly")}</span>
          </header>
          {(data?.shipmentAnalytics || []).length ? (
            <BarChart items={data.shipmentAnalytics} />
          ) : (
            <p className="dash-empty">{t("dashNoChartData")}</p>
          )}
        </article>

        <article className="dash-card">
          <header>
            <h3>
              <button type="button" className="link-btn dash-title-btn" onClick={openFinance}>
                {t("dashRevenueExpenses")}
              </button>
            </h3>
            <div className="dash-legend">
              <i className="is-rev" /> {t("dashRevenue")}
              <i className="is-exp" /> {t("dashExpenses")}
            </div>
          </header>
          {(data?.revenueExpenses || []).length ? (
            <TwinBars items={data.revenueExpenses} />
          ) : (
            <p className="dash-empty">{t("dashNoChartData")}</p>
          )}
          <div className="dash-money-foot">
            <span>{t("dashRevenue")}: <b>{money(kpis.revenue)}</b></span>
            <span>{t("dashExpenses")}: <b>{money(kpis.expenses)}</b></span>
          </div>
        </article>
      </div>

      <div className="dash-grid-3">
        <article className="dash-card dash-span-2">
          <header>
            <h3>{t("dashRecentShipments")}</h3>
            <button type="button" className="link-btn" onClick={() => onPage?.("receipts")}>
              {t("dashViewAll")}
            </button>
          </header>
          <div className="dash-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("dashShipmentId")}</th>
                  <th>{t("customerName")}</th>
                  <th>{t("deliveryLocation")}</th>
                  <th>{t("status")}</th>
                  <th>{t("amountIqd")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentShipments || []).map((item) => (
                  <tr key={item.id}>
                    <td>SSK-{item.id}</td>
                    <td>
                      <b>{item.customer}</b>
                      {item.company ? <small>{item.company}</small> : null}
                    </td>
                    <td>{item.route}</td>
                    <td>
                      <span className={`dash-pill ${statusClass(item.deliveryStatus)}`}>
                        {label(item.deliveryStatus)}
                      </span>
                    </td>
                    <td>{Number(item.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {!data?.recentShipments?.length ? (
                  <tr>
                    <td colSpan={5} className="dash-empty">{t("dashNoShipments")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <div className="dash-side">
          <article className="dash-card">
            <header>
              <h3>{t("dashFleetStatus")}</h3>
            </header>
            <div className="fleet-row">
              <span>{t("dashOnTrip")}</span>
              <b>{fleet.onTrip}</b>
            </div>
            <div className="fleet-bar">
              <i style={{ width: `${(fleet.onTrip / fleetTotal) * 100}%` }} className="is-trip" />
            </div>
            <div className="fleet-row">
              <span>{t("dashAvailable")}</span>
              <b>{fleet.active}</b>
            </div>
            <div className="fleet-bar">
              <i style={{ width: `${(fleet.active / fleetTotal) * 100}%` }} className="is-active" />
            </div>
            <div className="fleet-row">
              <span>{t("dashIdle")}</span>
              <b>{fleet.idle}</b>
            </div>
            <div className="fleet-bar">
              <i style={{ width: `${(fleet.idle / fleetTotal) * 100}%` }} className="is-idle" />
            </div>
          </article>

          <article className="dash-card">
            <header>
              <h3>{t("dashPendingActions")}</h3>
              <span className="dash-alert">
                {(data?.pendingActions || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0)}
              </span>
            </header>
            <ul className="dash-actions">
              {(data?.pendingActions || []).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onPage?.(item.page)}>
                    <span>
                      <b>{actionCopy[item.id]?.title || item.id}</b>
                      <small>{actionCopy[item.id]?.hint}</small>
                    </span>
                    {item.count != null ? <em>{item.count}</em> : <em className="is-go">→</em>}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>

      <div className="dash-grid-2">
        <article className="dash-card">
          <header>
            <h3>{t("dashTopDrivers")}</h3>
            <button type="button" className="link-btn" onClick={() => onPage?.("drivers")}>
              {t("dashViewAll")}
            </button>
          </header>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("driverName")}</th>
                <th>{t("dashTrips")}</th>
                <th>{t("dashOnTime")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topDrivers || []).map((item) => (
                <tr key={item.name}>
                  <td>{item.rank}</td>
                  <td>{item.name}</td>
                  <td>{item.trips}</td>
                  <td>
                    <span className={`dash-pill ${item.onTimeRate >= 70 ? "is-ok" : "is-warn"}`}>
                      {item.onTimeRate}%
                    </span>
                  </td>
                </tr>
              ))}
              {!data?.topDrivers?.length ? (
                <tr>
                  <td colSpan={4} className="dash-empty">{t("dashNoDrivers")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>

        <article className="dash-card">
          <header>
            <h3>{t("dashTopRoutes")}</h3>
          </header>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("dashRoute")}</th>
                <th>{t("dashTrips")}</th>
                <th>{t("dashShare")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topRoutes || []).map((item) => (
                <tr key={`${item.rank}-${item.route}`}>
                  <td>{item.rank}</td>
                  <td>{item.route}</td>
                  <td>{item.trips}</td>
                  <td>
                    <div className="share-cell">
                      <div className="share-bar">
                        <i style={{ width: `${Math.min(item.share, 100)}%` }} />
                      </div>
                      <span>{item.share}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!data?.topRoutes?.length ? (
                <tr>
                  <td colSpan={4} className="dash-empty">{t("dashNoRoutes")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      </div>

      {financeOpen ? (
        <div className="dash-finance-back" onClick={() => setFinanceOpen(false)}>
          <div
            className="dash-finance-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("dashFinanceTitle")}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="dash-finance-head">
              <div>
                <h2>{t("dashFinanceTitle")}</h2>
                <p>{t("dashFinanceSubtitle")}</p>
              </div>
              <button type="button" className="icon-close" onClick={() => setFinanceOpen(false)} aria-label={t("close")}>
                ×
              </button>
            </header>

            <div className="dash-finance-tabs">
              {[
                ["overview", t("dashFinanceOverview")],
                ["transports", t("dashFinanceTransports")],
                ["expenses", t("dashFinanceExpenses")],
                ["payments", t("dashFinancePayments")],
              ].map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  className={financeTab === id ? "is-on" : ""}
                  onClick={() => setFinanceTab(id)}
                >
                  {text}
                </button>
              ))}
            </div>

            {financeLoading ? <p className="dash-loading">{t("loading")}</p> : null}
            {financeError ? <p className="page-error">{financeError}</p> : null}

            {!financeLoading && finance ? (
              <>
                {financeTab === "overview" ? (
                  <div className="dash-finance-body">
                    <div className="dash-finance-kpis">
                      <article>
                        <span>{t("dashFinanceTransportIncome")}</span>
                        <strong>{fullMoney(financeSummary.transportRevenue)}</strong>
                        <small>{financeSummary.transportCount || 0} {t("dashFinanceRecords")}</small>
                      </article>
                      <article>
                        <span>{t("dashFinancePaid")}</span>
                        <strong>{fullMoney(financeSummary.paidTransport)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceUnpaid")}</span>
                        <strong>{fullMoney(financeSummary.unpaidTransport)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceInvoices")}</span>
                        <strong>{fullMoney(financeSummary.invoiceTotal)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceExpenseClaims")}</span>
                        <strong>{fullMoney(financeSummary.expenseTotal)}</strong>
                        <small>{financeSummary.expenseCount || 0} {t("dashFinanceRecords")}</small>
                      </article>
                      <article className={(financeSummary.net || 0) >= 0 ? "is-net-ok" : "is-net-bad"}>
                        <span>{t("dashFinanceNet")}</span>
                        <strong>{fullMoney(financeSummary.net)}</strong>
                        <small>{t("dashFinanceNetHint")}</small>
                      </article>
                    </div>

                    <div className="dash-finance-split">
                      <article className="dash-card">
                        <header><h3>{t("dashFinancePayments")}</h3></header>
                        <ul className="dash-finance-list">
                          {(finance.paymentSplit || []).map((item) => (
                            <li key={item.status}>
                              <span>
                                <b>{label(item.status)}</b>
                                <small>{item.count} {t("dashFinanceRecords")}</small>
                              </span>
                              <em>{fullMoney(item.amount)}</em>
                            </li>
                          ))}
                          {!finance.paymentSplit?.length ? <li className="dash-empty">{t("dashNoChartData")}</li> : null}
                        </ul>
                      </article>
                      <article className="dash-card">
                        <header><h3>{t("dashFinanceByCategory")}</h3></header>
                        <ul className="dash-finance-list">
                          {(finance.expenseByCategory || []).map((item) => (
                            <li key={item.category}>
                              <span>
                                <b>{label(item.category) || item.category}</b>
                                <small>{item.count} {t("dashFinanceRecords")}</small>
                              </span>
                              <em>{fullMoney(item.amount)}</em>
                            </li>
                          ))}
                          {!finance.expenseByCategory?.length ? <li className="dash-empty">{t("dashNoChartData")}</li> : null}
                        </ul>
                      </article>
                    </div>
                  </div>
                ) : null}

                {financeTab === "transports" ? (
                  <div className="dash-finance-body">
                    <div className="dash-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("dashShipmentId")}</th>
                            <th>{t("customerName")}</th>
                            <th>{t("driverName")}</th>
                            <th>{t("deliveryLocation")}</th>
                            <th>{t("deliveryStatus")}</th>
                            <th>{t("payment")}</th>
                            <th>{t("dashFinanceInvoice")}</th>
                            <th>{t("amountIqd")}</th>
                            <th>{t("date")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(finance.transports || []).map((item) => (
                            <tr key={item.id}>
                              <td>SSK-{item.id}</td>
                              <td>
                                <b>{item.customer}</b>
                                {item.company ? <small>{item.company}</small> : null}
                              </td>
                              <td>{item.driver}</td>
                              <td>{item.route}</td>
                              <td><span className={`dash-pill ${statusClass(item.deliveryStatus)}`}>{label(item.deliveryStatus)}</span></td>
                              <td><span className={`dash-pill ${statusClass(item.paymentStatus)}`}>{label(item.paymentStatus)}</span></td>
                              <td>{item.hasInvoice ? t("invoiceYes") : t("invoiceNo")}</td>
                              <td>{Number(item.amount || 0).toLocaleString()}</td>
                              <td>{formatDate(item.date)}</td>
                            </tr>
                          ))}
                          {!finance.transports?.length ? (
                            <tr><td colSpan={9} className="dash-empty">{t("dashNoShipments")}</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="dash-finance-foot">
                      <button type="button" className="link-btn" onClick={() => { setFinanceOpen(false); onPage?.("receipts"); }}>
                        {t("dashViewAll")} → {t("navReceipts")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {financeTab === "expenses" ? (
                  <div className="dash-finance-body">
                    <div className="dash-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{t("dashFinanceStaff")}</th>
                            <th>{t("categorie")}</th>
                            <th>{t("description")}</th>
                            <th>{t("amountIqd")}</th>
                            <th>{t("date")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(finance.expenses || []).map((item) => (
                            <tr key={item.id}>
                              <td>{item.id}</td>
                              <td>{item.staff}</td>
                              <td>{label(item.category) || item.category}</td>
                              <td>{item.description}</td>
                              <td>{Number(item.amount || 0).toLocaleString()}</td>
                              <td>{formatDate(item.date)}</td>
                            </tr>
                          ))}
                          {!finance.expenses?.length ? (
                            <tr><td colSpan={6} className="dash-empty">{t("dashNoChartData")}</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="dash-finance-foot">
                      <button type="button" className="link-btn" onClick={() => { setFinanceOpen(false); onPage?.("expenses"); }}>
                        {t("dashViewAll")} → {t("navExpenses")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {financeTab === "payments" ? (
                  <div className="dash-finance-body">
                    <div className="dash-finance-kpis">
                      <article>
                        <span>{t("dashFinancePaid")}</span>
                        <strong>{fullMoney(financeSummary.paidTransport)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceUnpaid")}</span>
                        <strong>{fullMoney(financeSummary.unpaidTransport)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceInvoices")}</span>
                        <strong>{fullMoney(financeSummary.invoiceTotal)}</strong>
                      </article>
                      <article>
                        <span>{t("dashFinanceExpenseClaims")}</span>
                        <strong>{fullMoney(financeSummary.expenseTotal)}</strong>
                      </article>
                    </div>
                    <div className="dash-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("payment")}</th>
                            <th>{t("dashFinanceRecords")}</th>
                            <th>{t("amountIqd")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(finance.paymentSplit || []).map((item) => (
                            <tr key={item.status}>
                              <td><span className={`dash-pill ${statusClass(item.status)}`}>{label(item.status)}</span></td>
                              <td>{item.count}</td>
                              <td>{Number(item.amount || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                          {(finance.expenseByCategory || []).map((item) => (
                            <tr key={`exp-${item.category}`}>
                              <td><span className="dash-pill is-warn">{t("dashFinanceExpenseTag")}: {label(item.category) || item.category}</span></td>
                              <td>{item.count}</td>
                              <td>{Number(item.amount || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default Dashboard;
