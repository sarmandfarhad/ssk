const { query } = require("../../config/db");

function toInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function ensureReceiptInvoices() {
  await query(`
    CREATE TABLE IF NOT EXISTS receipt_invoices (
      id SERIAL PRIMARY KEY,
      receipt_id INTEGER NOT NULL UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function normalizeInvoiceItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const items = [];
  for (const row of list) {
    const name = String(row?.name || "").trim();
    const amount = Number(row?.amount_iqd ?? row?.amount);
    if (!name && !(Number.isFinite(amount) && amount !== 0)) {
      continue;
    }
    if (!name) {
      throw new Error("Each invoice line needs a name.");
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Each invoice line needs a valid IQD amount.");
    }
    items.push({ name, amount_iqd: Math.round(amount) });
  }
  return items;
}

function invoiceTotal(items) {
  return items.reduce((sum, row) => sum + Number(row.amount_iqd || 0), 0);
}

async function receiptWithInvoiceFlag(id) {
  const result = await query(
    `SELECT r.*,
      EXISTS(SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id) AS has_invoice
     FROM receipts r
     WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function list(req, res) {
  try {
    await ensureReceiptInvoices();
    const search = String(req.query.search || "").trim();
    const deliveryStatus = String(req.query.delivery_status || "").trim();
    const paymentStatus = String(req.query.payment_status || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 13);
    const offset = (page - 1) * limit;

    const filters = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      filters.push(`(
        LOWER(customer) LIKE $${params.length}
        OR LOWER(driver_name) LIKE $${params.length}
        OR LOWER(vehicle) LIKE $${params.length}
        OR LOWER(destination) LIKE $${params.length}
        OR LOWER(COALESCE(customer_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(company_name, '')) LIKE $${params.length}
      )`);
    }

    if (deliveryStatus) {
      params.push(deliveryStatus);
      filters.push(`delivery_status = $${params.length}`);
    }

    if (paymentStatus) {
      params.push(paymentStatus);
      filters.push(`payment_status = $${params.length}`);
    }

    if (from) {
      params.push(from);
      filters.push(`receipt_date >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      filters.push(`receipt_date <= $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const totalResult = await query(`SELECT COUNT(*)::int AS count FROM receipts ${where}`, params);
    const total = totalResult.rows[0].count;

    params.push(limit);
    params.push(offset);
    const result = await query(
      `SELECT r.*,
        EXISTS(SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id) AS has_invoice
       FROM receipts r
       ${where}
       ORDER BY r.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      items: result.rows,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("List receipts error:", error);
    return res.status(500).json({ message: "Could not load receipts." });
  }
}

const OPTION_KINDS = ["customer_name", "company_name", "receiving_location", "delivery_location"];

async function ensureReceiptOptions() {
  await query(`
    CREATE TABLE IF NOT EXISTS receipt_options (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL
    )
  `);
}

async function saveOption(kind, name) {
  const type = String(kind || "").trim();
  const value = String(name || "").trim();
  if (!OPTION_KINDS.includes(type) || !value) {
    return;
  }
  await ensureReceiptOptions();
  const existing = await query(
    "SELECT id FROM receipt_options WHERE kind = $1 AND LOWER(name) = LOWER($2)",
    [type, value]
  );
  if (!existing.rowCount) {
    await query("INSERT INTO receipt_options (kind, name) VALUES ($1, $2)", [type, value]);
  }
}

async function namesFor(kind) {
  const result = await query(
    "SELECT name FROM receipt_options WHERE kind = $1 ORDER BY LOWER(name) ASC",
    [kind]
  );
  return result.rows.map((row) => row.name);
}

async function allOptions() {
  await ensureReceiptOptions();
  const items = {};
  for (const kind of OPTION_KINDS) {
    items[kind] = await namesFor(kind);
  }
  return items;
}

async function seedReceiptOptions() {
  await ensureReceiptOptions();
  const rows = await query(
    `SELECT customer, customer_name, company_name, receiving_location, delivery_location, destination
     FROM receipts`
  );
  for (const row of rows.rows) {
    await saveOption("customer_name", row.customer_name);
    await saveOption("company_name", row.company_name);
    if (row.customer) {
      if (!row.customer_name) {
        await saveOption("customer_name", row.customer);
      }
      if (!row.company_name) {
        await saveOption("company_name", row.customer);
      }
    }
    await saveOption("receiving_location", row.receiving_location);
    await saveOption("delivery_location", row.delivery_location);
    if (!row.receiving_location && !row.delivery_location && row.destination) {
      const parts = String(row.destination).split(/\s+-\s+/);
      if (parts[0]) {
        await saveOption("receiving_location", parts[0].trim());
      }
      if (parts[1]) {
        await saveOption("delivery_location", parts[1].trim());
      }
    }
  }
}

async function listOptions(req, res) {
  try {
    return res.json({ items: await allOptions() });
  } catch (error) {
    console.error("List receipt options error:", error);
    return res.status(500).json({ message: "Could not load saved names." });
  }
}

async function addOption(req, res) {
  try {
    const kind = String(req.body.kind || "").trim();
    const name = String(req.body.name || "").trim();
    if (!OPTION_KINDS.includes(kind) || !name) {
      return res.status(400).json({ message: "Please enter a name to save." });
    }
    await saveOption(kind, name);
    return res.json({ items: await allOptions(), kind, name });
  } catch (error) {
    console.error("Add receipt option error:", error);
    return res.status(500).json({ message: "Could not save the name." });
  }
}

function toNumber(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const customerName = String(body.customer_name || "").trim();
    const companyName = String(body.company_name || "").trim();
    const customer = String(body.customer || [customerName, companyName].filter(Boolean).join(" / ")).trim();
    const driverName = String(body.driver_name || "").trim();
    const vehicle = String(body.vehicle || "").trim();
    const receiving = String(body.receiving_location || "").trim();
    const delivery = String(body.delivery_location || "").trim();
    const destination = String(body.destination || [receiving, delivery].filter(Boolean).join(" - ")).trim();
    const amount = toNumber(body.amount);

    if (!customer || !driverName || !vehicle || !destination || amount == null) {
      return res.status(400).json({ message: "Please fill the required fields." });
    }

    const result = await query(
      `INSERT INTO receipts (
        customer, driver_name, vehicle, destination, amount, delivery_status, payment_status, receipt_date,
        customer_name, company_name, phone, receiving_location, delivery_location,
        goods_type, pieces, weight, car_type, driver_id, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        customer,
        driverName,
        vehicle,
        destination,
        amount,
        body.delivery_status || "Pending",
        body.payment_status || "Pending",
        body.receipt_date || new Date().toISOString().slice(0, 10),
        customerName || null,
        companyName || null,
        String(body.phone || "").trim() || null,
        receiving || null,
        delivery || null,
        String(body.goods_type || "").trim() || null,
        toNumber(body.pieces),
        toNumber(body.weight),
        String(body.car_type || "").trim() || null,
        toNumber(body.driver_id),
        String(body.notes || "").trim() || null,
      ]
    );

    await saveOption("customer_name", customerName);
    await saveOption("company_name", companyName);
    await saveOption("receiving_location", receiving);
    await saveOption("delivery_location", delivery);

    const item = await receiptWithInvoiceFlag(result.rows[0].id);
    return res.status(201).json({ item });
  } catch (error) {
    console.error("Create receipt error:", error);
    return res.status(500).json({ message: "Could not add receipt." });
  }
}

async function update(req, res) {
  try {
    const body = req.body || {};
    const current = await query("SELECT * FROM receipts WHERE id = $1", [req.params.id]);
    const row = current.rows[0];
    if (!row) {
      return res.status(404).json({ message: "Receipt not found." });
    }

    const delivery = String(body.delivery_status || "").trim();
    const payment = String(body.payment_status || "").trim();
    const allowedDelivery = ["Pending", "Delivered", "In Transmit", "Canceled"];
    const allowedPayment = ["Pending", "Paid", "Unpaid"];

    if (delivery && !allowedDelivery.includes(delivery)) {
      return res.status(400).json({ message: "Invalid delivery status." });
    }
    if (payment && !allowedPayment.includes(payment)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const isFull = body.customer_name !== undefined || body.company_name !== undefined || body.driver_name !== undefined;

    if (!isFull) {
      if (!delivery && !payment) {
        return res.status(400).json({ message: "Choose a status to update." });
      }
      await query(
        `UPDATE receipts SET
          delivery_status = COALESCE($2, delivery_status),
          payment_status = COALESCE($3, payment_status)
         WHERE id = $1`,
        [req.params.id, delivery || null, payment || null]
      );
      return res.json({ item: await receiptWithInvoiceFlag(req.params.id) });
    }

    const customerName = String(body.customer_name || "").trim();
    const companyName = String(body.company_name || "").trim();
    const customer = String(body.customer || [customerName, companyName].filter(Boolean).join(" / ")).trim();
    const driverName = String(body.driver_name || "").trim();
    const vehicle = String(body.vehicle || "").trim();
    const receiving = String(body.receiving_location || "").trim();
    const deliveryLoc = String(body.delivery_location || "").trim();
    const destination = String(body.destination || [receiving, deliveryLoc].filter(Boolean).join(" - ")).trim();
    const amount = toNumber(body.amount);

    if (!customer || !driverName || !vehicle || !destination || amount == null) {
      return res.status(400).json({ message: "Please fill the required fields." });
    }

    const result = await query(
      `UPDATE receipts SET
        customer = $2, driver_name = $3, vehicle = $4, destination = $5, amount = $6,
        delivery_status = $7, payment_status = $8, receipt_date = $9,
        customer_name = $10, company_name = $11, phone = $12, receiving_location = $13, delivery_location = $14,
        goods_type = $15, pieces = $16, weight = $17, car_type = $18, driver_id = $19, notes = $20
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        customer,
        driverName,
        vehicle,
        destination,
        amount,
        delivery || row.delivery_status,
        payment || row.payment_status,
        body.receipt_date || row.receipt_date,
        customerName || null,
        companyName || null,
        String(body.phone || "").trim() || null,
        receiving || null,
        deliveryLoc || null,
        String(body.goods_type || "").trim() || null,
        toNumber(body.pieces),
        toNumber(body.weight),
        String(body.car_type || "").trim() || null,
        toNumber(body.driver_id),
        String(body.notes || "").trim() || null,
      ]
    );

    await saveOption("customer_name", customerName);
    await saveOption("company_name", companyName);
    await saveOption("receiving_location", receiving);
    await saveOption("delivery_location", deliveryLoc);

    return res.json({ item: await receiptWithInvoiceFlag(result.rows[0].id) });
  } catch (error) {
    console.error("Update receipt error:", error);
    return res.status(500).json({ message: "Could not update receipt." });
  }
}

async function one(req, res) {
  try {
    await ensureReceiptInvoices();
    const item = await receiptWithInvoiceFlag(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Receipt not found." });
    }
    return res.json({ item });
  } catch (error) {
    console.error("Get receipt error:", error);
    return res.status(500).json({ message: "Could not load receipt." });
  }
}

async function remove(req, res) {
  try {
    const result = await query("DELETE FROM receipts WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "Receipt not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete receipt error:", error);
    return res.status(500).json({ message: "Could not delete receipt." });
  }
}

async function getInvoice(req, res) {
  try {
    await ensureReceiptInvoices();
    const receipt = await receiptWithInvoiceFlag(req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found." });
    }
    const result = await query(
      "SELECT id, receipt_id, items, total_amount, created_at, updated_at FROM receipt_invoices WHERE receipt_id = $1",
      [req.params.id]
    );
    return res.json({
      receipt,
      item: result.rows[0] || null,
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    return res.status(500).json({ message: "Could not load invoice." });
  }
}

async function upsertInvoice(req, res) {
  try {
    await ensureReceiptInvoices();
    const receipt = await receiptWithInvoiceFlag(req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found." });
    }
    if (receipt.delivery_status !== "Delivered") {
      return res.status(400).json({ message: "Invoice is only available when delivery status is Delivered." });
    }

    let items;
    try {
      items = normalizeInvoiceItems(req.body?.items);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }
    if (!items.length) {
      return res.status(400).json({ message: "Add at least one invoice line." });
    }

    const total = invoiceTotal(items);
    const result = await query(
      `INSERT INTO receipt_invoices (receipt_id, items, total_amount, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (receipt_id) DO UPDATE SET
         items = EXCLUDED.items,
         total_amount = EXCLUDED.total_amount,
         updated_at = NOW()
       RETURNING id, receipt_id, items, total_amount, created_at, updated_at`,
      [req.params.id, JSON.stringify(items), total]
    );

    return res.json({
      receipt: await receiptWithInvoiceFlag(req.params.id),
      item: result.rows[0],
    });
  } catch (error) {
    console.error("Upsert invoice error:", error);
    return res.status(500).json({ message: "Could not save invoice." });
  }
}

async function removeInvoice(req, res) {
  try {
    await ensureReceiptInvoices();
    const receipt = await receiptWithInvoiceFlag(req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found." });
    }
    const result = await query(
      "DELETE FROM receipt_invoices WHERE receipt_id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: "Invoice not found." });
    }
    return res.json({ ok: true, receipt: await receiptWithInvoiceFlag(req.params.id) });
  } catch (error) {
    console.error("Delete invoice error:", error);
    return res.status(500).json({ message: "Could not delete invoice." });
  }
}

module.exports = {
  list,
  create,
  one,
  update,
  remove,
  listOptions,
  addOption,
  seedReceiptOptions,
  ensureReceiptInvoices,
  getInvoice,
  upsertInvoice,
  removeInvoice,
};
