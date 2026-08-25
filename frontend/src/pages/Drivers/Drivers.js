import { useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, apiGet, apiSend, apiUpload } from "../../api";
import { useI18n } from "../../i18n";
import "./Drivers.css";

const emptyForm = {
  first_name: "",
  age: "",
  date_of_birth: "2026-08-21",
  phone1: "",
  phone2: "",
  vehicle_name: "",
  vehicle_type: "",
  plate_number: "",
  annual_card_number: "",
  model_year: "",
  color: "",
  license: null,
  national_id: null,
  renewal: null,
  status: "Active",
};

const years = Array.from({ length: 16 }, (_, index) => String(2026 - index));

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("en-GB");
}

function dateInput(value) {
  if (!value) {
    return "";
  }
  return String(value).slice(0, 10);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function UploadBox({ title, action, file, onFile, hint }) {
  return (
    <label className="upload-box">
      <span className="upload-title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {title}
      </span>
      <span className="upload-center">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V7 M8 11l4-4 4 4 M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <strong>{file ? file.name : action}</strong>
        <em>{hint || "JPG, PNG up to 2MB"}</em>
      </span>
      <input type="file" accept="image/jpeg,image/png" onChange={(event) => onFile(event.target.files[0] || null)} />
    </label>
  );
}

function Stepper({ step, labels }) {
  const items = labels || ["driver Information", "Vehicle Information", "Confirmation"];
  return (
    <div className="stepper">
      {items.map((label, index) => {
        const number = index + 1;
        const done = step > number;
        const active = step === number;
        return (
          <div key={label} className="stepper-wrap">
            {index > 0 ? <div className={`stepper-line ${step >= number ? "is-on" : ""} ${step > number ? "is-done" : ""}`} /> : null}
            <div className={`stepper-item ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
              <span>{done ? "✓" : ""}</span>
              <small>{label}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocImage({ driverId, kind, label, available, missing, empty }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!available) {
      setSrc("");
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";
    const token = localStorage.getItem(TOKEN_KEY);

    fetch(`/api/drivers/${driverId}/file/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("missing");
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc("");
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [driverId, kind, available]);

  return (
    <div className="doc-card">
      <p>{label}</p>
      {src ? <img src={src} alt={label} /> : <span>{available ? missing : empty}</span>}
    </div>
  );
}

function TypeCombo({ value, onChange, options, onSaveCustom, t }) {
  const [open, setOpen] = useState(false);
  const text = String(value || "");
  const filtered = options.filter((item) => item.toLowerCase().includes(text.toLowerCase()));
  const showAdd = text.trim() && !options.some((item) => item.toLowerCase() === text.trim().toLowerCase());

  async function commit() {
    if (text.trim()) {
      await onSaveCustom(text.trim());
    }
    setOpen(false);
  }

  return (
    <div className="type-combo">
      <input
        value={text}
        placeholder={t ? t("selectVehicleType") : "select vehicle type"}
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
        className="type-caret"
        tabIndex={-1}
        aria-label="Show vehicle types"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        ▾
      </button>
      {open ? (
        <div className="type-menu">
          {filtered.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(item);
                onSaveCustom(item);
                setOpen(false);
              }}
            >
              {item}
            </button>
          ))}
          {showAdd ? (
            <button
              type="button"
              className="type-add"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(text.trim());
                onSaveCustom(text.trim());
                setOpen(false);
              }}
            >
              {t ? t("addType", { name: text.trim() }) : `Add "${text.trim()}" to category list`}
            </button>
          ) : null}
          {!filtered.length && !showAdd ? <span>{t ? t("noTypes") : "No types yet"}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Drivers() {
  const { t, label } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(null);
  const [docs, setDocs] = useState(null);
  const [types, setTypes] = useState(["Truck", "Van", "Pickup"]);
  const [editingId, setEditingId] = useState(null);
  const limit = 10;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (vehicleType) params.set("vehicle_type", vehicleType);
    return `/api/drivers?${params.toString()}`;
  }, [page, search, status, vehicleType]);

  async function load() {
    setError("");
    try {
      const data = await apiGet(query);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [query]);

  async function loadTypes() {
    try {
      const data = await apiGet("/api/drivers/vehicle-types");
      if (data.items && data.items.length) {
        setTypes(data.items);
      }
    } catch (err) {
      // keep default types
    }
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function saveCustomType(name) {
    updateField("vehicle_type", name);
    try {
      const data = await apiSend("/api/drivers/vehicle-types", "POST", { name });
      if (data.items) {
        setTypes(data.items);
      }
    } catch (err) {
      setTypes((current) => (current.some((item) => item.toLowerCase() === name.toLowerCase()) ? current : [...current, name]));
    }
  }

  function openWizard() {
    loadTypes();
    setForm(emptyForm);
    setSaved(null);
    setStep(1);
    setEditingId(null);
    setError("");
    setWizard(true);
  }

  function openEdit(item) {
    loadTypes();
    setForm({
      first_name: item.first_name || "",
      age: item.age || "",
      date_of_birth: dateInput(item.date_of_birth),
      phone1: item.phone1 || "",
      phone2: item.phone2 || "",
      vehicle_name: item.vehicle_name || "",
      vehicle_type: item.vehicle_type || "",
      plate_number: item.plate_number || "",
      annual_card_number: item.annual_card_number || "",
      model_year: item.model_year ? String(item.model_year) : "",
      color: item.color || "",
      license: null,
      national_id: null,
      renewal: null,
      status: item.status || "Active",
      has_license: Boolean(item.license_file),
      has_national_id: Boolean(item.national_id_file),
      has_renewal: Boolean(item.renewal_file),
    });
    setEditingId(item.id);
    setSaved(null);
    setStep(1);
    setError("");
    setWizard(true);
  }

  function closeWizard() {
    setWizard(false);
    setEditingId(null);
    setSaved(null);
    setForm(emptyForm);
    setStep(1);
  }

  function resetList() {
    setSearch("");
    setStatus("");
    setVehicleType("");
    setPage(1);
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function validateStepOne() {
    const age = Number.parseInt(String(form.age || "").trim(), 10);
    if (!form.first_name || !form.date_of_birth || !form.phone1) {
      setError(t("completeDriver"));
      return false;
    }
    if (!Number.isFinite(age) || age < 1 || age > 120) {
      setError(t("ageNumber"));
      return false;
    }
    if ((!form.license && !form.has_license) || (!form.national_id && !form.has_national_id)) {
      setError(t("uploadLicenseId"));
      return false;
    }
    setError("");
    return true;
  }

  function validateStepTwo() {
    if (!form.vehicle_name || !form.vehicle_type || !form.plate_number || !form.annual_card_number || !form.model_year) {
      setError(t("completeVehicle"));
      return false;
    }
    if (!form.renewal && !form.has_renewal) {
      setError(t("uploadRenewal"));
      return false;
    }
    setError("");
    return true;
  }

  async function saveDriver() {
    if (!validateStepTwo()) {
      return;
    }
    const data = new FormData();
    [
      "first_name",
      "date_of_birth",
      "phone1",
      "phone2",
      "vehicle_name",
      "vehicle_type",
      "plate_number",
      "annual_card_number",
      "model_year",
      "color",
    ].forEach((key) => data.append(key, form[key] || ""));
    data.append("age", String(Number.parseInt(String(form.age || "").trim(), 10) || ""));
    data.append("status", form.status || "Active");
    if (form.license) {
      data.append("license", form.license);
    }
    if (form.national_id) {
      data.append("national_id", form.national_id);
    }
    if (form.renewal) {
      data.append("renewal", form.renewal);
    }

    try {
      const result = editingId
        ? await apiUpload(`/api/drivers/${editingId}`, data, "PUT")
        : await apiUpload("/api/drivers", data);
      setSaved(result.item);
      setStep(3);
      if (!editingId) {
        setPage(1);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDriver(item) {
    if (!window.confirm(t("deleteDriver", { name: item.first_name }))) {
      return;
    }
    try {
      await apiSend(`/api/drivers/${item.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function exportCsv() {
    const token = localStorage.getItem(TOKEN_KEY);
    fetch("/api/drivers/export.csv", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "drivers.csv";
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError(t("couldNotExportCsv")));
  }

  function printDetails() {
    window.print();
  }

  const subtitles = ["", t("subDriver1"), t("subDriver2"), t("subDriver3")];

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="drivers-wrap">
      <div className="drivers-toolbar">
        <p>{t("showingRecords", { end: end ? `${start}-${end}` : 0, total })}</p>
        <div>
          <button type="button" className="ghost-btn" onClick={resetList}>{t("listDrivers")}</button>
          <button type="button" className="ghost-btn" onClick={exportCsv}>{t("exportCsv")}</button>
          <button type="button" className="add-btn" onClick={openWizard}>{t("addDriver")}</button>
        </div>
      </div>

      <section className="drivers-page">
        <div className="filters">
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M16 16l5 5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder={t("searchDrivers")}
            />
          </label>
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
            <option value="">{t("allStatus")}</option>
            <option value="Active">{t("active")}</option>
            <option value="Off Duty">{t("offDuty")}</option>
          </select>
          <select value={vehicleType} onChange={(event) => { setPage(1); setVehicleType(event.target.value); }}>
            <option value="">{t("vehicleType")}</option>
            {types.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </div>

        {error && !wizard ? <p className="page-error">{error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("id")}</th>
                <th>{t("driverNameCol")}</th>
                <th>{t("carPlate")}</th>
                <th>{t("dateAdded")}</th>
                <th>{t("phone")}</th>
                <th>{t("status")}</th>
                <th>{t("totalRevenue")}</th>
                <th>{t("documents")}</th>
                <th>{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <span className="driver">
                      <span className="mini-avatar">{item.first_name.slice(0, 1)}</span>
                      {item.first_name}
                    </span>
                  </td>
                  <td>
                    <strong>{item.vehicle_name}</strong>
                    <div className="muted">{item.plate_number}</div>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>{item.phone1}</td>
                  <td>
                    <span className={`badge ${item.status === "Active" ? "badge-paid" : "badge-canceled"}`}>
                      {label(item.status)}
                    </span>
                  </td>
                  <td>{money(item.total_revenue)} IQD</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setDocs(item)}>
                      {t("view")}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="row-btn edit" onClick={() => openEdit(item)} aria-label={t("edit")}>
                      <svg viewBox="0 0 24 24">
                        <path d="M4 20h4l10-10-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                    <button type="button" className="row-btn del" onClick={() => deleteDriver(item)} aria-label={t("delete")}>
                      <svg viewBox="0 0 24 24">
                        <path d="M5 7h14 M9 7V5h6v2 M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty">{t("noDrivers")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>{t("showingDrivers", { start, end, total })}</span>
          <div>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
              <button key={number} type="button" className={number === page ? "is-active" : ""} onClick={() => setPage(number)}>
                {number}
              </button>
            ))}
          </div>
        </div>
      </section>

      {wizard ? (
        <div className="modal-back">
          <div className="wizard">
            <div className="wizard-head">
              <div>
                <h2>{editingId ? t("editDriverTitle") : t("addDriverTitle")}</h2>
                <p className="crumb">{editingId ? t("crumbEditDriver") : t("crumbAddDriver")}</p>
                <p>{subtitles[step]}</p>
              </div>
              <Stepper step={step} labels={[t("stepDriver"), t("stepVehicle"), t("stepConfirm")]} />
              <button type="button" className="icon-close" onClick={closeWizard}>×</button>
            </div>

            {error && wizard ? <p className="page-error">{error}</p> : null}

            {step === 1 ? (
              <>
                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    {t("driverInformation")}
                  </h3>
                  <div className="grid-3">
                    <label>{t("fullName")} <b>*</b>
                      <input value={form.first_name} onChange={(event) => updateField("first_name", event.target.value)} placeholder={t("enterFullName")} />
                    </label>
                    <label>{t("age")} <b>*</b>
                      <input type="number" min="1" max="120" value={form.age} onChange={(event) => updateField("age", event.target.value)} placeholder={t("enterAge")} />
                    </label>
                    <label>{t("dateOfStart")} <b>*</b>
                      <input type="date" value={form.date_of_birth} onChange={(event) => updateField("date_of_birth", event.target.value)} />
                    </label>
                    <label>{t("phone1")} <b>*</b>
                      <input value={form.phone1} onChange={(event) => updateField("phone1", event.target.value)} placeholder="+964-000-0000000" />
                    </label>
                    <label>{t("phone2")}
                      <input value={form.phone2} onChange={(event) => updateField("phone2", event.target.value)} placeholder="+964-000-0000000" />
                    </label>
                    <label>{t("status")}
                      <select value={form.status || "Active"} onChange={(event) => updateField("status", event.target.value)}>
                        <option value="Active">{t("active")}</option>
                        <option value="Off Duty">{t("offDuty")}</option>
                      </select>
                    </label>
                  </div>
                </section>
                <h3 className="docs-title">{t("docsUpload")} <b>*</b></h3>
                <div className="grid-2">
                  <UploadBox title={t("driverLicense")} action={t("uploadLicense")} hint={form.has_license && !form.license ? t("keepCurrentFile") : t("jpgPng")} file={form.license} onFile={(file) => updateField("license", file)} />
                  <UploadBox title={t("nationalId")} action={t("uploadId")} hint={form.has_national_id && !form.national_id ? t("keepCurrentFile") : t("jpgPng")} file={form.national_id} onFile={(file) => updateField("national_id", file)} />
                </div>
                <div className="wizard-actions">
                  <button type="button" className="next-btn" onClick={() => validateStepOne() && setStep(2)}>
                    {t("nextVehicle")}
                    <span>→</span>
                  </button>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 14h16v4H4z M6 14l2-5h8l2 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    {t("vehicleInformation")}
                  </h3>
                  <div className="grid-2">
                    <label>{t("vehicleName")} <b>*</b>
                      <input value={form.vehicle_name} onChange={(event) => updateField("vehicle_name", event.target.value)} placeholder={t("enterFullName")} />
                    </label>
                    <label>{t("vehicleTypeCat")} <b>*</b>
                      <TypeCombo
                        value={form.vehicle_type}
                        onChange={(value) => updateField("vehicle_type", value)}
                        options={types}
                        onSaveCustom={saveCustomType}
                        t={t}
                      />
                    </label>
                    <label>{t("plateNumber")} <b>*</b>
                      <input value={form.plate_number} onChange={(event) => updateField("plate_number", event.target.value)} placeholder="22-223344" />
                    </label>
                    <label>{t("annualCard")} <b>*</b>
                      <input value={form.annual_card_number} onChange={(event) => updateField("annual_card_number", event.target.value)} placeholder="1234567" />
                    </label>
                    <label>{t("modelYear")} <b>*</b>
                      <select value={form.model_year} onChange={(event) => updateField("model_year", event.target.value)}>
                        <option value="">2020</option>
                        {years.map((year) => <option key={year}>{year}</option>)}
                      </select>
                    </label>
                    <label>{t("color")}
                      <input value={form.color} onChange={(event) => updateField("color", event.target.value)} placeholder={t("color")} />
                    </label>
                  </div>
                </section>
                <h3 className="docs-title">{t("docsUpload")} <b>*</b></h3>
                <UploadBox title={t("annualRenewal")} action={t("uploadAnnual")} hint={form.has_renewal && !form.renewal ? t("keepCurrentFile") : t("jpgPng")} file={form.renewal} onFile={(file) => updateField("renewal", file)} />
                <div className="wizard-actions">
                  <button type="button" className="ghost-btn" onClick={() => setStep(1)}>{t("backDriver")}</button>
                  <button type="button" className="next-btn" onClick={saveDriver}>
                    {t("nextConfirm")}
                    <span>→</span>
                  </button>
                </div>
              </>
            ) : null}

            {step === 3 && saved ? (
              <div className="success-box">
                <div className="success-glow">
                  <div className="success-mark">✓</div>
                </div>
                <h3>{editingId ? t("driverUpdated") : t("driverAdded")}</h3>
                <p className="success-copy">{editingId ? t("driverUpdatedCopy") : t("driverSavedCopy")}</p>
                <div className="summary">
                  <div>
                    <h4>{t("driverInformation")}</h4>
                    <p><span>{t("fullName")} :</span> <b>{saved.first_name}</b></p>
                    <p><span>{t("phone")} :</span> <b>{saved.phone1}</b></p>
                    <p><span>{t("startDate")} :</span> <b>{formatDate(saved.date_of_birth || saved.created_at)}</b></p>
                    <p><span>{t("license")} :</span> <b className="ok">{t("uploaded")}</b></p>
                    <p><span>{t("nationalId")} :</span> <b className="ok">{t("uploaded")}</b></p>
                  </div>
                  <div>
                    <h4>{t("vehicleInformation")}</h4>
                    <p><span>{t("vehicle")} :</span> <b>{saved.vehicle_name}</b></p>
                    <p><span>{t("type")} :</span> <b>{label(saved.vehicle_type)}</b></p>
                    <p><span>{t("plateNumber")} :</span> <b>{saved.plate_number}</b></p>
                    <p><span>{t("modelYear")} :</span> <b>{saved.model_year}</b></p>
                    <p><span>{t("annualCard")} :</span> <b>{saved.annual_card_number}</b></p>
                  </div>
                </div>
                <div className="wizard-actions">
                  <button type="button" className="ghost-btn" onClick={printDetails}>{t("printDetails")}</button>
                  <button type="button" className="next-btn" onClick={closeWizard}>
                    {t("saveDetails")}
                    <span>→</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {saved ? (
        <section className="print-sheet">
          <header className="print-head">
            <div>
              <strong>SSK Company</strong>
              <span>System Transferring</span>
            </div>
              <h1>{t("driverDetails")}</h1>
              <p>{t("record", { id: saved.id || "-" })}</p>
          </header>
          <div className="print-grid">
            <article>
              <h2>{t("driverInformation")}</h2>
              <p><span>{t("fullName")}</span><b>{saved.first_name || "-"}</b></p>
              <p><span>{t("age")}</span><b>{saved.age || "-"}</b></p>
              <p><span>{t("dateOfStart")}</span><b>{formatDate(saved.date_of_birth || saved.created_at)}</b></p>
              <p><span>{t("phone1")}</span><b>{saved.phone1 || "-"}</b></p>
              <p><span>{t("phone2")}</span><b>{saved.phone2 || "-"}</b></p>
              <p><span>{t("status")}</span><b>{label(saved.status || "Active")}</b></p>
              <p><span>{t("dateAdded")}</span><b>{formatDate(saved.created_at)}</b></p>
              <p><span>{t("driverLicense")}</span><b>{saved.license_file ? t("uploaded") : t("notUploaded")}</b></p>
              <p><span>{t("nationalId")}</span><b>{saved.national_id_file ? t("uploaded") : t("notUploaded")}</b></p>
            </article>
            <article>
              <h2>{t("vehicleInformation")}</h2>
              <p><span>{t("vehicleName")}</span><b>{saved.vehicle_name || "-"}</b></p>
              <p><span>{t("vehicleTypeCat")}</span><b>{label(saved.vehicle_type) || "-"}</b></p>
              <p><span>{t("plateNumber")}</span><b>{saved.plate_number || "-"}</b></p>
              <p><span>{t("annualCard")}</span><b>{saved.annual_card_number || "-"}</b></p>
              <p><span>{t("modelYear")}</span><b>{saved.model_year || "-"}</b></p>
              <p><span>{t("color")}</span><b>{saved.color || "-"}</b></p>
              <p><span>{t("annualRenewal")}</span><b>{saved.renewal_file ? t("uploaded") : t("notUploaded")}</b></p>
              <p><span>{t("totalRevenue")}</span><b>{money(saved.total_revenue)} IQD</b></p>
            </article>
          </div>
          <footer>{t("printed", { value: new Date().toLocaleString("en-GB") })}</footer>
        </section>
      ) : null}

      {docs ? (
        <div className="modal-back" onClick={() => setDocs(null)}>
          <div className="docs-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{t("driverDocs", { name: docs.first_name })}</h2>
            <div className="docs-grid">
              <DocImage driverId={docs.id} kind="license" label={t("driverLicense")} available={Boolean(docs.license_file)} missing={t("couldNotLoadImage")} empty={t("noImage")} />
              <DocImage driverId={docs.id} kind="national_id" label={t("nationalId")} available={Boolean(docs.national_id_file)} missing={t("couldNotLoadImage")} empty={t("noImage")} />
              <DocImage driverId={docs.id} kind="renewal" label={t("vehicleRenewal")} available={Boolean(docs.renewal_file)} missing={t("couldNotLoadImage")} empty={t("noImage")} />
            </div>
            <button type="button" className="add-btn" onClick={() => setDocs(null)}>{t("close")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Drivers;
