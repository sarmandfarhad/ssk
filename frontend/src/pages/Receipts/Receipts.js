import { useEffect, useMemo, useState } from "react";
import { PREFS_KEY, apiGet, apiSend } from "../../api";
import { useI18n } from "../../i18n";
import "./Receipts.css";

const GOODS = ["Box", "Pallet", "Crate", "Bag", "Barrel", "Furniture", "Food", "Electronics", "Mixed"];
const DELIVERY_STATUSES = ["Pending", "Delivered", "In Transmit", "Canceled"];
const PAYMENT_STATUSES = ["Pending", "Paid", "Unpaid"];

function companyPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      company: prefs.company || "SSK Company",
      tagline: prefs.tagline || "System Transferring",
    };
  } catch (error) {
    return { company: "SSK Company", tagline: "System Transferring" };
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    customer_name: "",
    company_name: "",
    phone: "",
    receiving_location: "",
    delivery_location: "",
    goods_type: "",
    pieces: "",
    weight: "",
    car_type: "",
    driver_id: "",
    driver_name: "",
    vehicle: "",
    amount: "",
    delivery_status: "Pending",
    payment_status: "Pending",
    receipt_date: today(),
    notes: "",
  };
}

function statusClass(value) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "-");
  return `badge badge-${key}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("en-GB");
}

function sameType(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function typeMatches(driverType, query) {
  const type = String(driverType || "").trim().toLowerCase();
  const text = String(query || "").trim().toLowerCase();
  if (!text) {
    return true;
  }
  return type === text || type.includes(text);
}

function vehicleOf(driver) {
  if (!driver) {
    return "";
  }
  return `${driver.vehicle_type} - ${driver.plate_number}`;
}

function emptyInvoiceLine() {
  return { name: "", amount_iqd: "" };
}

function defaultInvoiceLines() {
  return [emptyInvoiceLine()];
}

function isDelivered(item) {
  return String(item?.delivery_status || "") === "Delivered";
}

function hasInvoiceFlag(item) {
  return item?.has_invoice === true || item?.has_invoice === "t" || item?.has_invoice === 1;
}

function Stepper({ step, labels }) {
  return (
    <div className="stepper">
      {labels.map((text, index) => {
        const number = index + 1;
        const done = step > number;
        const active = step === number;
        return (
          <div key={text} className="stepper-wrap">
            {index > 0 ? <div className={`stepper-line ${step >= number ? "is-on" : ""} ${step > number ? "is-done" : ""}`} /> : null}
            <div className={`stepper-item ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
              <span>{done ? "✓" : ""}</span>
              <small>{text}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SearchCombo({ value, onChange, onPick, options, placeholder, emptyText, disabled, addText, onAdd }) {
  const [open, setOpen] = useState(false);
  const text = String(value || "");
  const exact = options.some((item) => sameType(item.value || item.label, text));
  const showAdd = Boolean(onAdd && text.trim() && !exact);

  async function saveNew() {
    const name = text.trim();
    if (!name || !onAdd) {
      return;
    }
    await onAdd(name);
    setOpen(false);
  }

  return (
    <div className={`type-combo ${disabled ? "is-off" : ""}`}>
      <div className="type-combo-control">
        <input
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => {
            if (showAdd) {
              saveNew();
            } else {
              setOpen(false);
            }
          }, 160)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (showAdd) {
                saveNew();
              } else if (options[0]) {
                onPick(options[0]);
                setOpen(false);
              }
            }
          }}
        />
        <button
          type="button"
          className="type-caret"
          tabIndex={-1}
          disabled={disabled}
          aria-label={placeholder}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
        >
          ▾
        </button>
      </div>
      {open && !disabled ? (
        <div className="type-menu">
          {options.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.sub ? <small>{item.sub}</small> : null}
            </button>
          ))}
          {showAdd ? (
            <button
              type="button"
              className="type-add"
              onMouseDown={(event) => {
                event.preventDefault();
                saveNew();
              }}
            >
              {addText}
            </button>
          ) : null}
          {!options.length && !showAdd ? <span>{emptyText}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function FieldIcon({ children, unit }) {
  return (
    <span className={`field-control ${unit ? "has-unit" : ""}`}>
      {children}
      {unit ? <em className="unit">{unit}</em> : null}
    </span>
  );
}

function Receipts() {
  const { t, label, dir } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [reload, setReload] = useState(0);
  const [statusBusy, setStatusBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [invoiceReceipt, setInvoiceReceipt] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState(defaultInvoiceLines);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [printKind, setPrintKind] = useState("receipt");
  const [lists, setLists] = useState({
    customer_name: [],
    company_name: [],
    receiving_location: [],
    delivery_location: [],
  });
  const [contacts, setContacts] = useState([]);
  const limit = 13;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const arrow = dir === "rtl" ? "←" : "→";

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (deliveryStatus) params.set("delivery_status", deliveryStatus);
    if (paymentStatus) params.set("payment_status", paymentStatus);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/receipts?${params.toString()}`;
  }, [page, search, deliveryStatus, paymentStatus, from, to]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(query);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [query, reload]);

  useEffect(() => {
    if (modal !== "add") {
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      apiGet("/api/drivers?limit=300"),
      apiGet("/api/receipts/options"),
      apiGet("/api/receipts/contacts"),
    ])
      .then(([driverData, optionData, contactData]) => {
        if (cancelled) {
          return;
        }
        setDrivers(driverData.items || []);
        setLists({
          customer_name: optionData.items?.customer_name || [],
          company_name: optionData.items?.company_name || [],
          receiving_location: optionData.items?.receiving_location || [],
          delivery_location: optionData.items?.delivery_location || [],
        });
        setContacts(contactData.items || []);
      })
      .catch(() => {
        if (!cancelled) {
          setDrivers([]);
          setContacts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [modal]);

  const carTypes = useMemo(() => {
    const names = [];
    drivers.forEach((driver) => {
      const name = String(driver.vehicle_type || "").trim();
      if (name && !names.some((item) => sameType(item, name))) {
        names.push(name);
      }
    });
    return names.sort((a, b) => a.localeCompare(b));
  }, [drivers]);

  const typeQuery = String(form.car_type || "").trim();
  const exactType = carTypes.find((name) => sameType(name, typeQuery));

  const typeOptions = useMemo(() => {
    const text = typeQuery.toLowerCase();
    return carTypes
      .filter((name) => {
        if (exactType) {
          return true;
        }
        const shown = label(name);
        return !text || name.toLowerCase().includes(text) || String(shown).toLowerCase().includes(text);
      })
      .map((name) => ({
        id: name,
        label: label(name),
        value: name,
      }));
  }, [carTypes, typeQuery, exactType, label]);

  const matchingDrivers = useMemo(() => {
    const nameQuery = String(form.driver_name || "").trim().toLowerCase();
    const selected = drivers.find((item) => String(item.id) === String(form.driver_id));
    const browsing = selected && String(selected.first_name).toLowerCase() === nameQuery;
    return drivers.filter((driver) => {
      const typeOk = exactType
        ? sameType(driver.vehicle_type, exactType)
        : typeQuery
          ? typeMatches(driver.vehicle_type, typeQuery)
          : true;
      const nameOk =
        browsing ||
        !nameQuery ||
        String(driver.first_name || "").toLowerCase().includes(nameQuery) ||
        String(driver.plate_number || "").toLowerCase().includes(nameQuery) ||
        String(driver.vehicle_name || "").toLowerCase().includes(nameQuery);
      return typeOk && nameOk;
    });
  }, [drivers, typeQuery, exactType, form.driver_name, form.driver_id]);

  const driverOptions = matchingDrivers.map((driver) => ({
    id: String(driver.id),
    label: driver.first_name,
    sub: `${label(driver.vehicle_type)} · ${driver.plate_number}`,
    driver,
  }));

  const goodsOptions = GOODS.filter((name) => {
    const text = String(form.goods_type || "").trim().toLowerCase();
    const shown = label(name).toLowerCase();
    return !text || name.toLowerCase().includes(text) || shown.includes(text);
  }).map((name) => ({ id: name, label: label(name), value: name }));

  if (form.goods_type.trim() && !GOODS.some((name) => sameType(name, form.goods_type))) {
    goodsOptions.unshift({ id: form.goods_type.trim(), label: form.goods_type.trim(), value: form.goods_type.trim() });
  }

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function sameText(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  function contactsFor(customerName, companyName) {
    const customer = String(customerName || "").trim().toLowerCase();
    const company = String(companyName || "").trim().toLowerCase();
    return contacts.filter((item) => {
      const itemCustomer = String(item.customer_name || "").trim().toLowerCase();
      const itemCompany = String(item.company_name || "").trim().toLowerCase();
      const customerOk = !customer || itemCustomer === customer || itemCustomer.includes(customer);
      const companyOk = !company || itemCompany === company || itemCompany.includes(company);
      return customerOk && companyOk;
    });
  }

  function uniqueValues(rows, key) {
    const values = [];
    rows.forEach((row) => {
      const value = String(row[key] || "").trim();
      if (value && !values.some((item) => sameText(item, value))) {
        values.push(value);
      }
    });
    return values;
  }

  function applyContactFill(next) {
    const matched = contactsFor(next.customer_name, next.company_name);
    const exact = matched.filter((item) => {
      const customerOk = !String(next.customer_name || "").trim()
        || sameText(item.customer_name, next.customer_name);
      const companyOk = !String(next.company_name || "").trim()
        || sameText(item.company_name, next.company_name);
      return customerOk && companyOk;
    });
    const pool = exact.length ? exact : matched;
    const phones = uniqueValues(pool, "phone");
    const companies = uniqueValues(pool, "company_name");
    const customers = uniqueValues(pool, "customer_name");

    if (!String(next.phone || "").trim() && phones.length === 1) {
      next.phone = phones[0];
    }
    if (!String(next.company_name || "").trim() && companies.length === 1) {
      next.company_name = companies[0];
    }
    if (!String(next.customer_name || "").trim() && customers.length === 1) {
      next.customer_name = customers[0];
    }
    return next;
  }

  function updateCustomerField(name, value) {
    setForm((current) => applyContactFill({ ...current, [name]: value }));
  }

  function pickCustomerContact(option) {
    setForm((current) => applyContactFill({
      ...current,
      customer_name: option.value || option.customer_name || current.customer_name,
      company_name: option.company_name || current.company_name,
      phone: option.phone || current.phone,
    }));
  }

  function pickCompanyContact(option) {
    setForm((current) => applyContactFill({
      ...current,
      company_name: option.value || option.company_name || current.company_name,
      customer_name: option.customer_name || current.customer_name,
      phone: option.phone || current.phone,
    }));
  }

  function filterSaved(kind, text) {
    const queryText = String(text || "").trim().toLowerCase();
    return (lists[kind] || [])
      .filter((name) => !queryText || name.toLowerCase().includes(queryText))
      .map((name) => ({ id: `${kind}-${name}`, label: name, value: name }));
  }

  const customerOptions = useMemo(() => {
    const queryText = String(form.customer_name || "").trim().toLowerCase();
    const fromContacts = [];
    contacts.forEach((item) => {
      const name = String(item.customer_name || "").trim();
      if (!name) return;
      if (queryText && !name.toLowerCase().includes(queryText)) return;
      const key = `${name}|${item.company_name}|${item.phone}`;
      if (fromContacts.some((row) => row.id === key)) return;
      fromContacts.push({
        id: key,
        label: name,
        value: name,
        company_name: item.company_name,
        phone: item.phone,
        sub: [item.company_name, item.phone].filter(Boolean).join(" · "),
      });
    });
    const known = filterSaved("customer_name", form.customer_name).filter(
      (option) => !fromContacts.some((item) => sameText(item.value, option.value))
    );
    return fromContacts.concat(known);
  }, [contacts, form.customer_name, lists.customer_name]);

  const companyOptions = useMemo(() => {
    const queryText = String(form.company_name || "").trim().toLowerCase();
    const fromContacts = [];
    contacts.forEach((item) => {
      const name = String(item.company_name || "").trim();
      if (!name) return;
      if (queryText && !name.toLowerCase().includes(queryText)) return;
      const customerFilter = String(form.customer_name || "").trim();
      if (customerFilter && !sameText(item.customer_name, customerFilter)
        && !String(item.customer_name || "").toLowerCase().includes(customerFilter.toLowerCase())) {
        return;
      }
      const key = `${name}|${item.customer_name}|${item.phone}`;
      if (fromContacts.some((row) => row.id === key)) return;
      fromContacts.push({
        id: key,
        label: name,
        value: name,
        customer_name: item.customer_name,
        phone: item.phone,
        sub: [item.customer_name, item.phone].filter(Boolean).join(" · "),
      });
    });
    const known = filterSaved("company_name", form.company_name).filter(
      (option) => !fromContacts.some((item) => sameText(item.value, option.value))
    );
    return fromContacts.concat(known);
  }, [contacts, form.company_name, form.customer_name, lists.company_name]);

  const phoneOptions = useMemo(() => {
    const queryText = String(form.phone || "").trim().toLowerCase();
    const matched = contactsFor(form.customer_name, form.company_name);
    const phones = uniqueValues(matched.length ? matched : contacts, "phone");
    return phones
      .filter((phone) => !queryText || phone.toLowerCase().includes(queryText))
      .map((phone) => {
        const hit = matched.find((item) => sameText(item.phone, phone))
          || contacts.find((item) => sameText(item.phone, phone));
        return {
          id: `phone-${phone}`,
          label: phone,
          value: phone,
          sub: hit ? [hit.customer_name, hit.company_name].filter(Boolean).join(" · ") : "",
        };
      });
  }, [contacts, form.phone, form.customer_name, form.company_name]);

  async function saveSaved(kind, name) {
    const value = String(name || "").trim();
    if (!value) {
      return;
    }
    update(kind, value);
    try {
      const data = await apiSend("/api/receipts/options", "POST", { kind, name: value });
      if (data.items) {
        setLists({
          customer_name: data.items.customer_name || [],
          company_name: data.items.company_name || [],
          receiving_location: data.items.receiving_location || [],
          delivery_location: data.items.delivery_location || [],
        });
      }
    } catch (err) {
      setLists((current) => {
        const currentList = current[kind] || [];
        if (currentList.some((item) => sameType(item, value))) {
          return current;
        }
        return { ...current, [kind]: currentList.concat(value) };
      });
    }
  }

  function setCarType(value) {
    setForm((current) => {
      const driver = drivers.find((item) => String(item.id) === String(current.driver_id));
      const keepDriver = driver && typeMatches(driver.vehicle_type, value);
      return {
        ...current,
        car_type: value,
        driver_id: keepDriver ? current.driver_id : "",
        driver_name: keepDriver ? current.driver_name : "",
        vehicle: keepDriver ? current.vehicle : "",
      };
    });
  }

  function pickType(option) {
    setCarType(option.value);
  }

  function pickDriver(option) {
    const driver = option.driver;
    setForm((current) => ({
      ...current,
      driver_id: driver.id,
      driver_name: driver.first_name,
      car_type: driver.vehicle_type,
      vehicle: vehicleOf(driver),
    }));
  }

  function setDriverText(value) {
    setForm((current) => {
      const selected = drivers.find((item) => String(item.id) === String(current.driver_id));
      const still = selected && String(selected.first_name).toLowerCase() === value.trim().toLowerCase();
      return {
        ...current,
        driver_name: value,
        driver_id: still ? current.driver_id : "",
        vehicle: still ? current.vehicle : "",
      };
    });
  }

  function openAdd() {
    setForm(emptyForm());
    setStep(1);
    setSaved(null);
    setError("");
    setEditingId(null);
    setModal("add");
  }

  function openEdit(item) {
    const customerParts = String(item.customer || "").split(" / ");
    const destinationParts = String(item.destination || "").split(/\s+-\s+/);
    setForm({
      ...emptyForm(),
      customer_name: item.customer_name || customerParts[0] || "",
      company_name: item.company_name || customerParts[1] || "",
      phone: item.phone || "",
      receiving_location: item.receiving_location || destinationParts[0] || "",
      delivery_location: item.delivery_location || destinationParts[1] || "",
      goods_type: item.goods_type || "",
      pieces: item.pieces || "",
      weight: item.weight || "",
      car_type: item.car_type || "",
      driver_id: item.driver_id || "",
      driver_name: item.driver_name || "",
      vehicle: item.vehicle || "",
      amount: item.amount || "",
      delivery_status: item.delivery_status || "Pending",
      payment_status: item.payment_status || "Pending",
      receipt_date: item.receipt_date ? String(item.receipt_date).slice(0, 10) : today(),
      notes: item.notes || "",
    });
    setEditingId(item.id);
    setStep(1);
    setSaved(null);
    setError("");
    setModal("add");
  }

  function closeWizard() {
    setModal(null);
    setStep(1);
    setSaved(null);
    setEditingId(null);
    setForm(emptyForm());
  }

  function validateStepOne() {
    const filled = [
      form.customer_name,
      form.company_name,
      form.phone,
      form.receiving_location,
      form.delivery_location,
      form.goods_type,
      form.pieces,
      form.weight,
      form.car_type,
      form.driver_name,
    ].every((value) => String(value || "").trim());
    if (!filled) {
      setError(t("completeReceipt"));
      return false;
    }
    if (!form.driver_id && !editingId) {
      setError(t("pickDriver"));
      return false;
    }
    setError("");
    return true;
  }

  async function saveReceipt() {
    if (!String(form.amount || "").trim()) {
      setError(t("completePayment"));
      return;
    }
    const canonicalType = exactType || form.car_type;
    const payload = {
      customer: `${form.customer_name} / ${form.company_name}`,
      customer_name: form.customer_name,
      company_name: form.company_name,
      phone: form.phone,
      receiving_location: form.receiving_location,
      delivery_location: form.delivery_location,
      destination: `${form.receiving_location} - ${form.delivery_location}`,
      goods_type: form.goods_type,
      pieces: form.pieces,
      weight: form.weight,
      car_type: canonicalType,
      driver_id: form.driver_id,
      driver_name: form.driver_name,
      vehicle: form.vehicle,
      amount: form.amount,
      delivery_status: form.delivery_status,
      payment_status: form.payment_status,
      receipt_date: form.receipt_date,
      notes: form.notes,
    };
    try {
      const data = editingId
        ? await apiSend(`/api/receipts/${editingId}`, "PUT", payload)
        : await apiSend("/api/receipts", "POST", payload);
      setSaved(data.item);
      setStep(3);
      setError("");
      if (!editingId) {
        setSearch("");
        setDeliveryStatus("");
        setPaymentStatus("");
        setFrom("");
        setTo("");
        setPage(1);
      }
      setReload((value) => value + 1);
      try {
        const contactData = await apiGet("/api/receipts/contacts");
        setContacts(contactData.items || []);
      } catch (contactError) {
        // keep previous contacts if refresh fails
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function openView(item) {
    setError("");
    setInvoiceReceipt(null);
    setModal(item);
    try {
      const data = await apiGet(`/api/receipts/${item.id}`);
      setModal(data.item);
    } catch (err) {
      setModal(item);
    }
  }

  function printDetails() {
    setPrintKind("receipt");
    setTimeout(() => window.print(), 50);
  }

  function printInvoiceSheet() {
    setPrintKind("invoice");
    setTimeout(() => window.print(), 50);
  }

  async function openInvoice(item) {
    if (!isDelivered(item)) {
      setError(t("invoiceNeedDelivered"));
      return;
    }
    setError("");
    setInvoiceMsg("");
    setModal(null);
    setInvoiceBusy(true);
    setInvoiceReceipt(item);
    setInvoiceLines(defaultInvoiceLines());
    try {
      const data = await apiGet(`/api/receipts/${item.id}/invoice`);
      setInvoiceReceipt(data.receipt || item);
      const saved = Array.isArray(data.item?.items) ? data.item.items : [];
      setInvoiceLines(
        saved.length
          ? saved.map((row) => ({
              name: row.name || "",
              amount_iqd: row.amount_iqd != null ? String(row.amount_iqd) : "",
            }))
          : defaultInvoiceLines()
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoiceBusy(false);
    }
  }

  function closeInvoice() {
    setInvoiceReceipt(null);
    setInvoiceLines(defaultInvoiceLines());
    setInvoiceMsg("");
    setInvoiceBusy(false);
  }

  function updateInvoiceLine(index, field, value) {
    setInvoiceLines((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addInvoiceLine() {
    setInvoiceLines((rows) => rows.concat(emptyInvoiceLine()));
  }

  function removeInvoiceLine(index) {
    setInvoiceLines((rows) => (rows.length <= 1 ? defaultInvoiceLines() : rows.filter((_, i) => i !== index)));
  }

  const invoiceTotal = useMemo(
    () => invoiceLines.reduce((sum, row) => sum + (Number(row.amount_iqd) || 0), 0),
    [invoiceLines]
  );

  async function saveInvoice() {
    if (!invoiceReceipt) {
      return;
    }
    const items = invoiceLines
      .map((row) => ({
        name: String(row.name || "").trim(),
        amount_iqd: Number(row.amount_iqd),
      }))
      .filter((row) => row.name || (Number.isFinite(row.amount_iqd) && row.amount_iqd !== 0));

    if (!items.length || items.some((row) => !row.name || !Number.isFinite(row.amount_iqd) || row.amount_iqd < 0)) {
      setInvoiceMsg("");
      setError(t("invoiceNeedLines"));
      return;
    }

    setInvoiceBusy(true);
    setError("");
    setInvoiceMsg("");
    try {
      const data = await apiSend(`/api/receipts/${invoiceReceipt.id}/invoice`, "PUT", { items });
      setInvoiceReceipt(data.receipt || invoiceReceipt);
      const saved = Array.isArray(data.item?.items) ? data.item.items : items;
      setInvoiceLines(
        saved.map((row) => ({
          name: row.name || "",
          amount_iqd: row.amount_iqd != null ? String(row.amount_iqd) : "",
        }))
      );
      setItems((rows) =>
        rows.map((row) =>
          row.id === (data.receipt?.id || invoiceReceipt.id)
            ? { ...row, ...(data.receipt || {}), has_invoice: true }
            : row
        )
      );
      setInvoiceMsg(t("invoiceSaved"));
      setReload((count) => count + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function updateStatus(field, value) {
    if (!modal || modal === "add" || modal[field] === value || statusBusy) {
      return;
    }
    setStatusBusy(true);
    setError("");
    try {
      const data = await apiSend(`/api/receipts/${modal.id}`, "PUT", { [field]: value });
      setModal(data.item);
      setItems((rows) => rows.map((row) => (row.id === data.item.id ? data.item : row)));
      setReload((count) => count + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function deleteReceipt(item) {
    if (!window.confirm(t("deleteReceipt", { id: item.id }))) {
      return;
    }
    try {
      await apiSend(`/api/receipts/${item.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const view = modal && modal !== "add" ? modal : null;
  const printItem = view || saved;

  return (
    <div className="receipts-wrap">
      <div className="page-head">
        <button type="button" className="add-btn" onClick={openAdd}>
          + {t("addReceipts").replace("+ ", "")}
        </button>
      </div>

      <section className="receipts-page">
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
              placeholder={t("searchReceipts")}
            />
          </label>
          <select
            value={deliveryStatus}
            onChange={(event) => {
              setPage(1);
              setDeliveryStatus(event.target.value);
            }}
          >
            <option value="">{t("deliveryStatus")}</option>
            <option value="Pending">{t("pending")}</option>
            <option value="Delivered">{t("delivered")}</option>
            <option value="In Transmit">{t("inTransmit")}</option>
            <option value="Canceled">{t("canceled")}</option>
          </select>
          <select
            value={paymentStatus}
            onChange={(event) => {
              setPage(1);
              setPaymentStatus(event.target.value);
            }}
          >
            <option value="">{t("paymentStatus")}</option>
            <option value="Pending">{t("pending")}</option>
            <option value="Paid">{t("paid")}</option>
            <option value="Unpaid">{t("unpaid")}</option>
          </select>
          <div className="dates">
            <input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
            <span>-</span>
            <input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
          </div>
        </div>

        {error && modal !== "add" && !invoiceReceipt ? <p className="page-error">{error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("id")}</th>
                <th>{t("customerCompany")}</th>
                <th>{t("driverName")}</th>
                <th>{t("carVehicle")}</th>
                <th>{t("destination")}</th>
                <th>{t("amountIqd")}</th>
                <th>{t("deliveryStatus")}</th>
                <th>{t("payment")}</th>
                <th>{t("invoice")}</th>
                <th>{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="is-row" onClick={() => openView(item)}>
                  <td>{item.id}</td>
                  <td>{item.customer}</td>
                  <td>
                    <span className="driver">
                      <span className="mini-avatar">{item.driver_name.slice(0, 1)}</span>
                      {item.driver_name}
                    </span>
                  </td>
                  <td>{item.vehicle}</td>
                  <td>{item.destination}</td>
                  <td>{money(item.amount)}</td>
                  <td>
                    <span className={statusClass(item.delivery_status)}>{label(item.delivery_status)}</span>
                  </td>
                  <td>
                    <span className={statusClass(item.payment_status)}>{label(item.payment_status)}</span>
                  </td>
                  <td className="invoice-cell" onClick={(event) => event.stopPropagation()}>
                    {hasInvoiceFlag(item) ? (
                      <button
                        type="button"
                        className="invoice-badge is-yes"
                        onClick={() => openInvoice(item)}
                        title={t("openInvoice")}
                      >
                        {t("invoiceYes")}
                      </button>
                    ) : isDelivered(item) ? (
                      <button
                        type="button"
                        className="invoice-badge is-create"
                        onClick={() => openInvoice(item)}
                        title={t("createInvoice")}
                      >
                        {t("invoiceNo")}
                      </button>
                    ) : (
                      <span className="invoice-badge is-off" title={t("invoiceUnavailable")}>
                        {t("invoiceNo")}
                      </span>
                    )}
                  </td>
                  <td className="row-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="row-btn view" onClick={() => openView(item)} aria-label={t("view")}>
                      <svg viewBox="0 0 24 24">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                    <button type="button" className="row-btn edit" onClick={() => openEdit(item)} aria-label={t("edit")}>
                      <svg viewBox="0 0 24 24">
                        <path d="M4 20h4l10-10-4-4L4 16v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                    <button type="button" className="row-btn del" onClick={() => deleteReceipt(item)} aria-label={t("delete")}>
                      <svg viewBox="0 0 24 24">
                        <path d="M5 7h14 M9 7V5h6v2 M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan="10" className="empty">{t("noReceipts")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>{t("showingReceipts", { start, end, total })}</span>
          <div>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                className={number === page ? "is-active" : ""}
                onClick={() => setPage(number)}
              >
                {number}
              </button>
            ))}
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next">
              &gt;
            </button>
          </div>
        </div>
      </section>

      {modal === "add" ? (
        <div className="modal-back">
          <div className="wizard receipt-wizard">
            <div className="wizard-head">
              <div>
                <h2>{editingId ? t("editReceiptTitle") : t("addReceiptTitle")}</h2>
                <p>{t("createReceiptCopy")}</p>
              </div>
              <Stepper
                step={step}
                labels={[t("stepReceiptInfo"), t("stepPaymentNote"), t("stepConfirm")]}
              />
              <button type="button" className="icon-close" onClick={closeWizard}>×</button>
            </div>

            {error && modal === "add" ? <p className="page-error">{error}</p> : null}

            {step === 1 ? (
              <>
                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <circle cx="18" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                    {t("customerInformation")}
                  </h3>
                  <div className="grid-3">
                    <label>{t("customerName")} <b>*</b>
                      <SearchCombo
                        value={form.customer_name}
                        onChange={(value) => updateCustomerField("customer_name", value)}
                        onPick={pickCustomerContact}
                        options={customerOptions}
                        placeholder={t("selectCustomer")}
                        emptyText={t("noSavedItems")}
                        addText={t("addToList", { name: form.customer_name.trim() })}
                        onAdd={(name) => saveSaved("customer_name", name)}
                      />
                    </label>
                    <label>{t("companyName")} <b>*</b>
                      <SearchCombo
                        value={form.company_name}
                        onChange={(value) => updateCustomerField("company_name", value)}
                        onPick={pickCompanyContact}
                        options={companyOptions}
                        placeholder={t("selectCompany")}
                        emptyText={t("noSavedItems")}
                        addText={t("addToList", { name: form.company_name.trim() })}
                        onAdd={(name) => saveSaved("company_name", name)}
                      />
                    </label>
                    <label>{t("phoneNumber")} <b>*</b>
                      <SearchCombo
                        value={form.phone}
                        onChange={(value) => update("phone", value)}
                        onPick={(option) => update("phone", option.value)}
                        options={phoneOptions}
                        placeholder={t("phoneAutoHint")}
                        emptyText={t("noSavedPhones")}
                        addText={t("usePhone", { name: form.phone.trim() })}
                        onAdd={(name) => update("phone", name)}
                      />
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    {t("deliveryLocations")}
                  </h3>
                  <div className="grid-2">
                    <label>{t("receivingLocation")} <b>*</b>
                      <SearchCombo
                        value={form.receiving_location}
                        onChange={(value) => update("receiving_location", value)}
                        onPick={(option) => update("receiving_location", option.value)}
                        options={filterSaved("receiving_location", form.receiving_location)}
                        placeholder={t("cityArea")}
                        emptyText={t("noSavedItems")}
                        addText={t("addToList", { name: form.receiving_location.trim() })}
                        onAdd={(name) => saveSaved("receiving_location", name)}
                      />
                    </label>
                    <label>{t("deliveryLocation")} <b>*</b>
                      <SearchCombo
                        value={form.delivery_location}
                        onChange={(value) => update("delivery_location", value)}
                        onPick={(option) => update("delivery_location", option.value)}
                        options={filterSaved("delivery_location", form.delivery_location)}
                        placeholder={t("cityArea")}
                        emptyText={t("noSavedItems")}
                        addText={t("addToList", { name: form.delivery_location.trim() })}
                        onAdd={(name) => saveSaved("delivery_location", name)}
                      />
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 8h16v11H4z M8 8V6h8v2 M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    {t("shipmentInformation")}
                  </h3>
                  <div className="grid-3 ship-grid">
                    <label>{t("typeOfPieces")} <b>*</b>
                      <SearchCombo
                        value={form.goods_type}
                        onChange={(value) => update("goods_type", value)}
                        onPick={(option) => update("goods_type", option.value)}
                        options={goodsOptions}
                        placeholder={t("selectPieces")}
                        emptyText={t("noTypes")}
                      />
                    </label>
                    <label>{t("numberOfPieces")} <b>*</b>
                      <FieldIcon>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 8h16v11H4z M8 8V6h8v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                        <input type="number" min="1" value={form.pieces} onChange={(event) => update("pieces", event.target.value)} placeholder={t("setNumberPieces")} />
                      </FieldIcon>
                    </label>
                    <label>{t("weightKg")} <b>*</b>
                      <FieldIcon unit="KG">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M7 10h10l1 9H6z M9 10V8a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                        <input type="number" min="0" step="0.1" value={form.weight} onChange={(event) => update("weight", event.target.value)} />
                      </FieldIcon>
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 15h13v4H3z M6 15l2-5h6l2 5 M16 16h4l2 3h-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <circle cx="7" cy="19" r="1.4" />
                      <circle cx="17" cy="19" r="1.4" />
                    </svg>
                    {t("transportation")}
                  </h3>
                  <div className="grid-2">
                    <label>{t("vehicleTypeCat")} <b>*</b>
                      <SearchCombo
                        value={form.car_type}
                        onChange={setCarType}
                        onPick={pickType}
                        options={typeOptions}
                        placeholder={t("selectOption")}
                        emptyText={t("noTypes")}
                      />
                    </label>
                    <label>{t("driverName")} <b>*</b>
                      <SearchCombo
                        value={form.driver_name}
                        onChange={setDriverText}
                        onPick={pickDriver}
                        options={driverOptions}
                        placeholder={t("selectDriver")}
                        emptyText={t("noDriversForType")}
                      />
                    </label>
                  </div>
                </section>

                <div className="wizard-actions">
                  <button
                    type="button"
                    className="next-btn"
                    onClick={() => validateStepOne() && setStep(2)}
                  >
                    {t("nextPayment")}
                    <span>{arrow}</span>
                  </button>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <section className="panel">
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                    {t("paymentAndNote")}
                  </h3>
                  <div className="grid-2">
                    <label>{t("amountIqd")} <b>*</b>
                      <input type="number" min="0" value={form.amount} onChange={(event) => update("amount", event.target.value)} />
                    </label>
                    <label>{t("date")} <b>*</b>
                      <input type="date" value={form.receipt_date} onChange={(event) => update("receipt_date", event.target.value)} />
                    </label>
                    <label>{t("deliveryStatus")}
                      <select value={form.delivery_status} onChange={(event) => update("delivery_status", event.target.value)}>
                        <option value="Pending">{t("pending")}</option>
                        <option value="Delivered">{t("delivered")}</option>
                        <option value="In Transmit">{t("inTransmit")}</option>
                        <option value="Canceled">{t("canceled")}</option>
                      </select>
                    </label>
                    <label>{t("payment")}
                      <select value={form.payment_status} onChange={(event) => update("payment_status", event.target.value)}>
                        <option value="Pending">{t("pending")}</option>
                        <option value="Paid">{t("paid")}</option>
                        <option value="Unpaid">{t("unpaid")}</option>
                      </select>
                    </label>
                    <label className="span-2">{t("note")}
                      <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder={t("enterNote")} rows="3" />
                    </label>
                  </div>
                </section>
                <div className="wizard-actions">
                  <button type="button" className="ghost-btn" onClick={() => setStep(1)}>{t("backReceipt")}</button>
                  <button type="button" className="next-btn" onClick={saveReceipt}>
                    {t("nextConfirm")}
                    <span>{arrow}</span>
                  </button>
                </div>
              </>
            ) : null}

            {step === 3 && saved ? (
              <div className="success-box">
                <div className="success-glow">
                  <div className="success-mark">✓</div>
                </div>
                <h3>{editingId ? t("receiptUpdated") : t("receiptAdded")}</h3>
                <p className="success-copy">{editingId ? t("receiptUpdatedCopy") : t("receiptSavedCopy")}</p>
                <div className="summary">
                  <div>
                    <h4>{t("customerInformation")}</h4>
                    <p><span>{t("customerName")} :</span> <b>{saved.customer_name || saved.customer}</b></p>
                    <p><span>{t("companyName")} :</span> <b>{saved.company_name || "-"}</b></p>
                    <p><span>{t("phoneNumber")} :</span> <b>{saved.phone || "-"}</b></p>
                    <p><span>{t("receivingLocation")} :</span> <b>{saved.receiving_location || "-"}</b></p>
                    <p><span>{t("deliveryLocation")} :</span> <b>{saved.delivery_location || saved.destination}</b></p>
                  </div>
                  <div>
                    <h4>{t("transportation")}</h4>
                    <p><span>{t("driverName")} :</span> <b>{saved.driver_name}</b></p>
                    <p><span>{t("vehicleTypeCat")} :</span> <b>{label(saved.car_type) || saved.vehicle}</b></p>
                    <p><span>{t("typeOfPieces")} :</span> <b>{label(saved.goods_type) || "-"}</b></p>
                    <p><span>{t("amountIqd")} :</span> <b>{money(saved.amount)}</b></p>
                    <p><span>{t("payment")} :</span> <b>{label(saved.payment_status)}</b></p>
                  </div>
                </div>
                <div className="wizard-actions">
                  <button type="button" className="ghost-btn" onClick={printDetails}>{t("printDetails")}</button>
                  <button type="button" className="next-btn" onClick={closeWizard}>
                    {t("saveDetails")}
                    <span>{arrow}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {view ? (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal receipt-details" onClick={(event) => event.stopPropagation()}>
            <div className="details-head">
              <div>
                <h2>{t("receiptDetails")}</h2>
                <p>{t("id")} #{view.id}</p>
              </div>
              <button type="button" className="icon-close" onClick={() => setModal(null)}>×</button>
            </div>

            {error && view ? <p className="page-error">{error}</p> : null}

            <div className="summary">
              <div>
                <h4>{t("customerInformation")}</h4>
                <p><span>{t("customerName")}</span><b>{view.customer_name || view.customer || "-"}</b></p>
                <p><span>{t("companyName")}</span><b>{view.company_name || "-"}</b></p>
                <p><span>{t("phoneNumber")}</span><b>{view.phone || "-"}</b></p>
                <p><span>{t("receivingLocation")}</span><b>{view.receiving_location || "-"}</b></p>
                <p><span>{t("deliveryLocation")}</span><b>{view.delivery_location || view.destination || "-"}</b></p>
                <p><span>{t("date")}</span><b>{formatDate(view.receipt_date)}</b></p>
              </div>
              <div>
                <h4>{t("transportation")}</h4>
                <p><span>{t("driverName")}</span><b>{view.driver_name || "-"}</b></p>
                <p><span>{t("vehicleTypeCat")}</span><b>{label(view.car_type) || view.vehicle || "-"}</b></p>
                <p><span>{t("carVehicle")}</span><b>{view.vehicle || "-"}</b></p>
                <p><span>{t("typeOfPieces")}</span><b>{label(view.goods_type) || "-"}</b></p>
                <p><span>{t("numberOfPieces")}</span><b>{view.pieces || "-"}</b></p>
                <p><span>{t("weightKg")}</span><b>{view.weight || "-"}</b></p>
                <p><span>{t("amountIqd")}</span><b>{money(view.amount)}</b></p>
              </div>
            </div>
            {view.notes ? <p className="details-note"><b>{t("note")}:</b> {view.notes}</p> : null}

            <section className="panel status-panel">
              <h3>{t("changeDelivery")}</h3>
              <div className="status-actions">
                {DELIVERY_STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${statusClass(value)} ${view.delivery_status === value ? "is-on" : ""}`}
                    disabled={statusBusy}
                    onClick={() => updateStatus("delivery_status", value)}
                  >
                    {label(value)}
                  </button>
                ))}
              </div>
              <h3>{t("changePayment")}</h3>
              <div className="status-actions">
                {PAYMENT_STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${statusClass(value)} ${view.payment_status === value ? "is-on" : ""}`}
                    disabled={statusBusy}
                    onClick={() => updateStatus("payment_status", value)}
                  >
                    {label(value)}
                  </button>
                ))}
              </div>
            </section>

            <div className="wizard-actions">
              {isDelivered(view) ? (
                <button type="button" className="ghost-btn" onClick={() => openInvoice(view)}>
                  {hasInvoiceFlag(view) ? t("openInvoice") : t("createInvoice")}
                </button>
              ) : null}
              <button type="button" className="ghost-btn" onClick={printDetails}>{t("printDetails")}</button>
              <button type="button" className="ghost-btn" onClick={() => setModal(null)}>{t("close")}</button>
              <button type="button" className="next-btn" onClick={() => openEdit(view)}>
                {t("edit")}
                <span>{arrow}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invoiceReceipt ? (
        <div className="modal-back" onClick={closeInvoice}>
          <div className="modal receipt-details invoice-modal" onClick={(event) => event.stopPropagation()}>
            <div className="details-head">
              <div>
                <h2>{t("invoiceTitle")}</h2>
                <p>{t("invoiceCopy")}</p>
              </div>
              <button type="button" className="icon-close" onClick={closeInvoice}>×</button>
            </div>

            {error ? <p className="page-error">{error}</p> : null}
            {invoiceMsg ? <p className="page-ok">{invoiceMsg}</p> : null}

            <section className="panel">
              <h3>{t("invoiceReceiptInfo")}</h3>
              <div className="summary invoice-summary">
                <div>
                  <h4>{t("senderInfo")}</h4>
                  <p><span>{t("receiptNo")}</span><b>SSK-{invoiceReceipt.id}</b></p>
                  <p><span>{t("date")}</span><b>{formatDate(invoiceReceipt.receipt_date)}</b></p>
                  <p><span>{t("customerName")}</span><b>{invoiceReceipt.customer_name || invoiceReceipt.customer || "-"}</b></p>
                  <p><span>{t("companyName")}</span><b>{invoiceReceipt.company_name || "-"}</b></p>
                  <p><span>{t("phoneNumber")}</span><b>{invoiceReceipt.phone || "-"}</b></p>
                </div>
                <div>
                  <h4>{t("receiverInfo")}</h4>
                  <p><span>{t("receivingLocation")}</span><b>{invoiceReceipt.receiving_location || "-"}</b></p>
                  <p><span>{t("deliveryLocation")}</span><b>{invoiceReceipt.delivery_location || invoiceReceipt.destination || "-"}</b></p>
                  <p><span>{t("driverName")}</span><b>{invoiceReceipt.driver_name || "-"}</b></p>
                  <p><span>{t("vehicleTypeCat")}</span><b>{label(invoiceReceipt.car_type) || invoiceReceipt.vehicle || "-"}</b></p>
                  <p><span>{t("carVehicle")}</span><b>{invoiceReceipt.vehicle || "-"}</b></p>
                </div>
                <div>
                  <h4>{t("cargoInfo")}</h4>
                  <p><span>{t("typeOfPieces")}</span><b>{label(invoiceReceipt.goods_type) || "-"}</b></p>
                  <p><span>{t("numberOfPieces")}</span><b>{invoiceReceipt.pieces || "-"}</b></p>
                  <p><span>{t("weightKg")}</span><b>{invoiceReceipt.weight || "-"}</b></p>
                  <p><span>{t("deliveryStatus")}</span><b>{label(invoiceReceipt.delivery_status)}</b></p>
                  <p><span>{t("payment")}</span><b>{label(invoiceReceipt.payment_status)}</b></p>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3>{t("invoiceCosts")}</h3>
              <p className="invoice-hint">{t("invoiceEmptyHint")}</p>
              <div className="invoice-lines">
                <div className="invoice-line-head">
                  <span>{t("invoiceLineName")}</span>
                  <span>{t("invoiceLineAmount")}</span>
                  <span />
                </div>
                {invoiceLines.map((row, index) => (
                  <div className="invoice-line" key={`line-${index}`}>
                    <input
                      value={row.name}
                      onChange={(event) => updateInvoiceLine(index, "name", event.target.value)}
                      placeholder={t("invoiceLineName")}
                      disabled={invoiceBusy}
                    />
                    <input
                      type="number"
                      min="0"
                      value={row.amount_iqd}
                      onChange={(event) => updateInvoiceLine(index, "amount_iqd", event.target.value)}
                      placeholder="0"
                      disabled={invoiceBusy}
                    />
                    <button
                      type="button"
                      className="row-btn del"
                      onClick={() => removeInvoiceLine(index)}
                      disabled={invoiceBusy}
                      aria-label={t("removeInvoiceLine")}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M5 7h14 M9 7V5h6v2 M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="invoice-line-actions">
                <button type="button" className="ghost-btn" onClick={addInvoiceLine} disabled={invoiceBusy}>
                  {t("addInvoiceLine")}
                </button>
                <div className="invoice-total">
                  <span>{t("totalAmount")}</span>
                  <b>{money(invoiceTotal)}</b>
                </div>
              </div>
            </section>

            <div className="wizard-actions">
              <button type="button" className="ghost-btn" onClick={printInvoiceSheet} disabled={invoiceBusy}>
                {t("printInvoice")}
              </button>
              <button type="button" className="ghost-btn" onClick={closeInvoice}>{t("close")}</button>
              <button type="button" className="next-btn" onClick={saveInvoice} disabled={invoiceBusy}>
                {t("saveInvoice")}
                <span>{arrow}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printKind === "receipt" && printItem ? (
        <section className="print-sheet">
          <header className="print-head">
            <div className="print-brand">
              <img className="print-logo" src="/ssk-logo.png" alt="SSK" />
              <div>
                <strong>{companyPrefs().company}</strong>
                <span>{companyPrefs().tagline}</span>
              </div>
            </div>
            <h1>{t("receiptDetails")}</h1>
            <p>{t("record", { id: printItem.id || "-" })}</p>
          </header>
          <div className="print-grid">
            <article>
              <h2>{t("customerInformation")}</h2>
              <p><span>{t("customerName")}</span><b>{printItem.customer_name || printItem.customer || "-"}</b></p>
              <p><span>{t("companyName")}</span><b>{printItem.company_name || "-"}</b></p>
              <p><span>{t("phoneNumber")}</span><b>{printItem.phone || "-"}</b></p>
              <p><span>{t("receivingLocation")}</span><b>{printItem.receiving_location || "-"}</b></p>
              <p><span>{t("deliveryLocation")}</span><b>{printItem.delivery_location || printItem.destination || "-"}</b></p>
              <p><span>{t("date")}</span><b>{formatDate(printItem.receipt_date)}</b></p>
              {printItem.notes ? <p><span>{t("note")}</span><b>{printItem.notes}</b></p> : null}
            </article>
            <article>
              <h2>{t("transportation")}</h2>
              <p><span>{t("driverName")}</span><b>{printItem.driver_name || "-"}</b></p>
              <p><span>{t("vehicleTypeCat")}</span><b>{label(printItem.car_type) || printItem.vehicle || "-"}</b></p>
              <p><span>{t("carVehicle")}</span><b>{printItem.vehicle || "-"}</b></p>
              <p><span>{t("typeOfPieces")}</span><b>{label(printItem.goods_type) || "-"}</b></p>
              <p><span>{t("numberOfPieces")}</span><b>{printItem.pieces || "-"}</b></p>
              <p><span>{t("weightKg")}</span><b>{printItem.weight || "-"}</b></p>
              <p><span>{t("amountIqd")}</span><b>{money(printItem.amount)}</b></p>
              <p><span>{t("deliveryStatus")}</span><b>{label(printItem.delivery_status)}</b></p>
              <p><span>{t("payment")}</span><b>{label(printItem.payment_status)}</b></p>
            </article>
          </div>
          <footer>{t("printed", { value: new Date().toLocaleString("en-GB") })}</footer>
        </section>
      ) : null}

      {printKind === "invoice" && invoiceReceipt ? (
        <section className="print-sheet invoice-print">
          <header className="print-head">
            <div className="print-brand">
              <img className="print-logo" src="/ssk-logo.png" alt="SSK" />
              <div>
                <strong>{companyPrefs().company}</strong>
                <span>{companyPrefs().tagline}</span>
              </div>
            </div>
            <h1>{t("invoiceTitle")}</h1>
            <p>{t("receiptNo")} SSK-{invoiceReceipt.id}</p>
          </header>
          <div className="print-grid">
            <article>
              <h2>{t("senderInfo")}</h2>
              <p><span>{t("date")}</span><b>{formatDate(invoiceReceipt.receipt_date)}</b></p>
              <p><span>{t("customerName")}</span><b>{invoiceReceipt.customer_name || invoiceReceipt.customer || "-"}</b></p>
              <p><span>{t("companyName")}</span><b>{invoiceReceipt.company_name || "-"}</b></p>
              <p><span>{t("phoneNumber")}</span><b>{invoiceReceipt.phone || "-"}</b></p>
              <p><span>{t("receivingLocation")}</span><b>{invoiceReceipt.receiving_location || "-"}</b></p>
            </article>
            <article>
              <h2>{t("receiverInfo")}</h2>
              <p><span>{t("deliveryLocation")}</span><b>{invoiceReceipt.delivery_location || invoiceReceipt.destination || "-"}</b></p>
              <p><span>{t("driverName")}</span><b>{invoiceReceipt.driver_name || "-"}</b></p>
              <p><span>{t("vehicleTypeCat")}</span><b>{label(invoiceReceipt.car_type) || invoiceReceipt.vehicle || "-"}</b></p>
              <p><span>{t("typeOfPieces")}</span><b>{label(invoiceReceipt.goods_type) || "-"}</b></p>
              <p><span>{t("numberOfPieces")}</span><b>{invoiceReceipt.pieces || "-"}</b></p>
              <p><span>{t("weightKg")}</span><b>{invoiceReceipt.weight || "-"}</b></p>
            </article>
          </div>
          <article className="print-costs">
            <h2>{t("invoiceCosts")}</h2>
            {invoiceLines
              .filter((row) => String(row.name || "").trim())
              .map((row, index) => (
                <p key={`print-cost-${index}`}>
                  <span>{row.name}</span>
                  <b>{money(row.amount_iqd)}</b>
                </p>
              ))}
            <p className="print-total">
              <span>{t("totalAmount")}</span>
              <b>{money(invoiceTotal)}</b>
            </p>
          </article>
          <footer>{t("printed", { value: new Date().toLocaleString("en-GB") })}</footer>
        </section>
      ) : null}
    </div>
  );
}

export default Receipts;
