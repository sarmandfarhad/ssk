import { useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, apiGet, apiSend, apiUpload } from "../../api";
import { useI18n } from "../../i18n";
import "./ExpenseClaims.css";

const defaultCategories = ["Fuel", "Maintenance", "Repair", "Driver Expense", "Toll", "Parking"];

const emptyForm = {
  category: "",
  expense_date: "2026-08-22",
  amount: "",
  description: "",
  attachment: null,
};

function money(value) {
  return Number(value || 0).toLocaleString("de-DE");
}

function formatDateTime(item) {
  const date = new Date(item.expense_date);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = item.created_at
    ? new Date(item.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  return time ? `${day} - ${time}` : day;
}

function categoryClass(value) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "-");
  const known = ["fuel", "maintenance", "repair", "driver-expense", "toll", "parking"];
  return known.includes(key) ? `cat cat-${key}` : "cat cat-custom";
}

function CategoryCombo({ value, onChange, options, onAdd, t }) {
  const [open, setOpen] = useState(false);
  const text = String(value || "");
  const filtered = options.filter((item) => item.toLowerCase().includes(text.toLowerCase()));
  const showAdd = text.trim() && !options.some((item) => item.toLowerCase() === text.trim().toLowerCase());

  function commit() {
    if (text.trim()) {
      onAdd(text.trim());
    }
    setOpen(false);
  }

  return (
    <div className="cat-combo">
      <input
        value={text}
        placeholder={t("selectCategorie")}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(commit, 150)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      <button
        type="button"
        className="cat-caret"
        tabIndex={-1}
        aria-label="Show categories"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        ▾
      </button>
      {open ? (
        <div className="cat-menu">
          {filtered.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(item);
                onAdd(item);
                setOpen(false);
              }}
            >
              {item}
            </button>
          ))}
          {showAdd ? (
            <button
              type="button"
              className="cat-add"
              onMouseDown={(event) => {
                event.preventDefault();
                onAdd(text.trim());
                setOpen(false);
              }}
            >
              {t("addCategory", { name: text.trim() })}
            </button>
          ) : null}
          {!filtered.length && !showAdd ? <span>{t("noCategories")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentPreview({ item, onClose }) {
  const { t } = useI18n();
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!item?.has_attachment) {
      return undefined;
    }
    let cancelled = false;
    let objectUrl = "";
    const token = localStorage.getItem(TOKEN_KEY);
    fetch(`/api/expenses/${item.id}/file`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="preview-card" onClick={(event) => event.stopPropagation()}>
        <h2>{t("attachmentTitle")}</h2>
        <div className="preview-frame">
          {src ? <img src={src} alt={t("attachment")} /> : <p>{t("noImage")}</p>}
        </div>
        <button type="button" className="primary-btn" onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

function ExpenseClaims({ user }) {
  const { t, label } = useI18n();
  const [items, setItems] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState(defaultCategories);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [from, setFrom] = useState("2026-05-01");
  const [to, setTo] = useState("2026-08-31");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const limit = 7;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (description) params.set("description", description);
    if (createdBy) params.set("created_by", createdBy);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/expenses?${params.toString()}`;
  }, [page, search, category, description, createdBy, from, to]);

  async function load() {
    setError("");
    try {
      const data = await apiGet(query);
      setItems(data.items);
      setTotal(data.total);
      setDescriptions(data.descriptions || []);
      const fromItems = (data.items || []).map((item) => item.category).filter(Boolean);
      setCategoryOptions((current) => {
        const merged = [...current];
        fromItems.forEach((name) => {
          if (!merged.some((item) => item.toLowerCase() === name.toLowerCase())) {
            merged.push(name);
          }
        });
        return merged;
      });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [query]);

  function addCategoryOption(name) {
    const value = String(name || "").trim();
    if (!value) {
      return;
    }
    setForm((current) => ({ ...current, category: value }));
    setCategoryOptions((current) => (
      current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]
    ));
  }

  function resetForm() {
    setForm(emptyForm);
    setError("");
  }

  async function addExpense(event) {
    event.preventDefault();
    if (!form.category || !form.expense_date || !form.amount || !form.description) {
      setError(t("fillRequired"));
      return;
    }
    addCategoryOption(form.category);
    const data = new FormData();
    data.append("category", form.category.trim());
    data.append("expense_date", form.expense_date);
    data.append("amount", form.amount);
    data.append("description", form.description);
    if (form.attachment) {
      data.append("attachment", form.attachment);
    }
    try {
      await apiUpload("/api/expenses", data);
      resetForm();
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(t("deleteExpense"))) {
      return;
    }
    try {
      await apiSend(`/api/expenses/${item.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function exportPdf() {
    const rows = items
      .map(
        (item) =>
          `<tr><td>${item.id}</td><td>${formatDateTime(item)}</td><td>${item.staff_name || item.user_name || "-"}</td><td>${item.category}</td><td>${item.description}</td><td>${money(item.amount)}</td></tr>`
      )
      .join("");
    const html = `<html><head><title>Expense Claims</title><style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body><h1>SSK Expense Claims</h1><table><thead><tr><th>No.</th><th>Date</th><th>Created by</th><th>Categorie</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  }

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="expense-wrap">
      <form className="card add-card" onSubmit={addExpense}>
        <h2>{t("addExpenseTitle")}</h2>
        <div className="add-grid">
          <label>{t("createdBy")}
            <input className="staff-locked" value={user?.name || ""} readOnly />
          </label>
          <label>{t("expenseCategorie")} <b>*</b>
            <CategoryCombo
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value })}
              options={categoryOptions}
              onAdd={addCategoryOption}
              t={t}
            />
          </label>
          <label>{t("date")} <b>*</b>
            <input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} />
          </label>
          <label>{t("amountIqd")} <b>*</b>
            <input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.000" />
          </label>
          <label>{t("description")} <b>*</b>
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t("enterDescription")} />
          </label>
        </div>
        <p className="attach-label">{t("receiptAttach")}</p>
        <label className="dropzone">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V7 M8 11l4-4 4 4 M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <strong>{t("clickUpload")}</strong>
          <span>{form.attachment ? form.attachment.name : t("pngJpgPdf")}</span>
          <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(event) => setForm({ ...form, attachment: event.target.files[0] || null })} />
        </label>
        {error ? <p className="page-error">{error}</p> : null}
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={resetForm}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12a8 8 0 0113.7-5.7L20 8 M20 12a8 8 0 01-13.7 5.7L4 16 M20 4v4h-4 M4 20v-4h4" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            {t("reset")}
          </button>
          <button type="submit" className="primary-btn">{t("addExpense")}</button>
        </div>
      </form>

      <section className="card list-card">
        <div className="list-head">
          <h2>{t("expenseList")}</h2>
          <button type="button" className="ghost-btn" onClick={exportPdf}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10 M8 10l4 4 4-4 M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            {t("exportPdf")}
          </button>
        </div>
        <div className="filters">
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M16 16l5 5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={t("searchExpense")} />
          </label>
          <select value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }}>
            <option value="">{t("categorie")}</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
          <select value={description} onChange={(event) => { setPage(1); setDescription(event.target.value); }}>
            <option value="">{t("description")}</option>
            {descriptions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="dates">
            <input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
            <span>-</span>
            <input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
          </div>
          <select className="user-filter" value={createdBy} onChange={(event) => { setPage(1); setCreatedBy(event.target.value); }}>
            <option value="">{t("allUsers")}</option>
            <option>Shahram</option>
            <option>Kamaran</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("no")}</th>
                <th>{t("dateTime")}</th>
                <th>{t("createdBy")}</th>
                <th>{t("categorie")}</th>
                <th>{t("description")}</th>
                <th>{t("amountIqd")}</th>
                <th>{t("attachment")}</th>
                <th>{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td>{start + index}</td>
                  <td>{formatDateTime(item)}</td>
                  <td><span className={`staff-tag staff-${String(item.user_name || item.staff_name || "").toLowerCase()}`}>{item.staff_name || item.user_name || "-"}</span></td>
                  <td><span className={categoryClass(item.category)}>{label(item.category)}</span></td>
                  <td>{item.description}</td>
                  <td>{money(item.amount)}</td>
                  <td>
                    {item.has_attachment ? (
                      <button type="button" className="icon-link" onClick={() => setPreview(item)} aria-label={t("view")}>
                        <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                      </button>
                    ) : "-"}
                  </td>
                  <td>
                    <button type="button" className="row-btn view" onClick={() => setPreview(item)} aria-label={t("view")}>
                      <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                    </button>
                    <button type="button" className="row-btn del" onClick={() => deleteItem(item)} aria-label={t("delete")}>
                      <svg viewBox="0 0 24 24"><path d="M5 7h14 M9 7V5h6v2 M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr><td colSpan="8" className="empty">{t("noExpenses")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>{t("showingExpenses", { start, end, total })}</span>
          <div>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
              <button key={number} type="button" className={number === page ? "is-active" : ""} onClick={() => setPage(number)}>{number}</button>
            ))}
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>&gt;</button>
          </div>
        </div>
      </section>

      {preview ? <AttachmentPreview item={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

export default ExpenseClaims;
