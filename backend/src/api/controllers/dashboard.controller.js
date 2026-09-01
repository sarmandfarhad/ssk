const { query } = require("../../config/db");
const { ensureReceiptInvoices } = require("./receipt.controller");

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function readRange(req) {
  let from = parseDate(req.query.from);
  let to = parseDate(req.query.to);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

function pushDateFilter(filters, params, expr, from, to) {
  if (from) {
    params.push(from);
    filters.push(`${expr} >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    filters.push(`${expr} <= $${params.length}::date`);
  }
}

function whereSql(filters) {
  return filters.length ? `WHERE ${filters.join(" AND ")}` : "";
}

function chartBucket(from, to) {
  if (!from || !to) return "month";
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  if (days <= 45) return "day";
  if (days <= 140) return "week";
  return "month";
}

function chartSelect(bucket) {
  if (bucket === "day") {
    return {
      trunc: "day",
      label: "YYYY-MM-DD",
    };
  }
  if (bucket === "week") {
    return {
      trunc: "week",
      label: "Mon DD",
    };
  }
  return {
    trunc: "month",
    label: "Mon YYYY",
  };
}

async function summary(req, res) {
  try {
    await ensureReceiptInvoices();
    const { from, to } = readRange(req);
    const bucket = chartBucket(from, to);
    const chart = chartSelect(bucket);
    const receiptDate = "COALESCE(receipt_date, created_at::date)";
    const receiptDateR = "COALESCE(r.receipt_date, r.created_at::date)";

    const receiptFilters = [];
    const receiptParams = [];
    pushDateFilter(receiptFilters, receiptParams, receiptDate, from, to);
    const receiptWhere = whereSql(receiptFilters);

    const receiptFiltersR = [];
    const receiptParamsR = [];
    pushDateFilter(receiptFiltersR, receiptParamsR, receiptDateR, from, to);
    const receiptWhereR = whereSql(receiptFiltersR);

    const expenseFilters = [];
    const expenseParams = [];
    pushDateFilter(expenseFilters, expenseParams, "expense_date", from, to);
    const expenseWhere = whereSql(expenseFilters);

    const invoiceFilters = [];
    const invoiceParams = [];
    pushDateFilter(invoiceFilters, invoiceParams, receiptDateR, from, to);
    const invoiceWhere = whereSql(invoiceFilters);

    const driverFilters = [`COALESCE(NULLIF(TRIM(driver_name), ''), '') <> ''`];
    const driverParams = [];
    pushDateFilter(driverFilters, driverParams, receiptDate, from, to);

    const routeFilters = [];
    const routeParams = [];
    pushDateFilter(routeFilters, routeParams, receiptDate, from, to);

    const [
      shipmentStats,
      driverStats,
      moneyRow,
      expenseRow,
      invoiceMoney,
      recent,
      recentInvoices,
      topDrivers,
      topRoutes,
      pending,
      onTrip,
      chartShipments,
    ] = await Promise.all([
      query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE delivery_status = 'Delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE delivery_status = 'Pending')::int AS pending,
          COUNT(*) FILTER (WHERE delivery_status = 'In Transmit')::int AS in_transit,
          COUNT(*) FILTER (WHERE delivery_status = 'Canceled')::int AS canceled
        FROM receipts
        ${receiptWhere}
        `,
        receiptParams
      ),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Active')::int AS active
        FROM drivers
      `),
      query(
        `
        SELECT
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.delivery_status = 'Delivered' OR r.payment_status = 'Paid'
          ), 0)::float AS transactions,
          COUNT(*) FILTER (
            WHERE r.delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id)
          )::int AS missing_invoice,
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id)
          ), 0)::float AS missing_invoice_amount
        FROM receipts r
        ${receiptWhereR}
        `,
        receiptParamsR
      ),
      query(`SELECT COALESCE(SUM(amount), 0)::float AS total FROM expenses ${expenseWhere}`, expenseParams),
      query(
        `
        SELECT
          COALESCE(SUM(COALESCE(i.total_amount, 0)), 0)::float AS invoice_total,
          COUNT(*)::int AS invoice_count
        FROM receipt_invoices i
        JOIN receipts r ON r.id = i.receipt_id
        ${invoiceWhere}
        `,
        invoiceParams
      ),
      query(
        `
        SELECT id, customer_name, customer, company_name, driver_name, vehicle,
               delivery_location, destination, amount, delivery_status, payment_status,
               receipt_date, created_at,
               EXISTS(SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = receipts.id) AS has_invoice
        FROM receipts
        ${receiptWhere}
        ORDER BY id DESC
        LIMIT 6
        `,
        receiptParams
      ),
      query(
        `
        SELECT
          i.id,
          i.receipt_id,
          i.total_amount::float AS total_amount,
          i.created_at,
          i.updated_at,
          COALESCE(NULLIF(TRIM(r.customer_name), ''), NULLIF(TRIM(r.customer), ''), '—') AS customer,
          COALESCE(NULLIF(TRIM(r.company_name), ''), '') AS company,
          COALESCE(r.amount, 0)::float AS receipt_amount,
          r.delivery_status,
          r.payment_status,
          ${receiptDateR} AS date
        FROM receipt_invoices i
        JOIN receipts r ON r.id = i.receipt_id
        ${invoiceWhere}
        ORDER BY i.updated_at DESC, i.id DESC
        LIMIT 8
        `,
        invoiceParams
      ),
      query(
        `
        SELECT
          COALESCE(NULLIF(TRIM(driver_name), ''), '—') AS name,
          COUNT(*)::int AS trips,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE delivery_status = 'Delivered')
            / NULLIF(COUNT(*), 0),
            1
          )::float AS on_time_rate
        FROM receipts
        ${whereSql(driverFilters)}
        GROUP BY 1
        ORDER BY trips DESC, on_time_rate DESC
        LIMIT 5
        `,
        driverParams
      ),
      query(
        `
        SELECT
          CONCAT(
            COALESCE(NULLIF(TRIM(receiving_location), ''), '-'),
            ' -> ',
            COALESCE(NULLIF(TRIM(delivery_location), ''), NULLIF(TRIM(destination), ''), '-')
          ) AS route,
          COUNT(*)::int AS trips
        FROM receipts
        ${whereSql(routeFilters)}
        GROUP BY 1
        ORDER BY trips DESC
        LIMIT 5
        `,
        routeParams
      ),
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE delivery_status IN ('Pending', 'In Transmit'))::int AS open_deliveries,
          COUNT(*) FILTER (WHERE payment_status IN ('Pending', 'Unpaid'))::int AS unpaid,
          COUNT(*) FILTER (
            WHERE delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = receipts.id)
          )::int AS missing_invoice
        FROM receipts
        ${receiptWhere}
        `,
        receiptParams
      ),
      query(`
        SELECT COUNT(DISTINCT driver_name)::int AS count
        FROM receipts
        WHERE delivery_status = 'In Transmit'
          AND COALESCE(NULLIF(TRIM(driver_name), ''), '') <> ''
      `),
      query(
        `
        SELECT TO_CHAR(DATE_TRUNC('${chart.trunc}', ${receiptDate}), '${chart.label}') AS label,
               COUNT(*)::int AS count,
               DATE_TRUNC('${chart.trunc}', ${receiptDate}) AS bucket
        FROM receipts
        ${receiptWhere}
        GROUP BY 1, 3
        ORDER BY 3
        `,
        receiptParams
      ),
    ]);

    const chartMoneyParams = [];
    const chartReceiptFilters = [];
    pushDateFilter(chartReceiptFilters, chartMoneyParams, receiptDateR, from, to);
    const chartReceiptWhere = whereSql(chartReceiptFilters);
    const chartInvoiceParams = [];
    const chartInvoiceFilters = [];
    pushDateFilter(chartInvoiceFilters, chartInvoiceParams, receiptDateR, from, to);
    const chartInvoiceWhere = whereSql(chartInvoiceFilters);
    const chartExpenseParams = [];
    const chartExpenseFilters = [];
    pushDateFilter(chartExpenseFilters, chartExpenseParams, "expense_date", from, to);
    const chartExpenseWhere = whereSql(chartExpenseFilters);

    const chartMoneyResult = await query(
      `
      SELECT TO_CHAR(DATE_TRUNC('${chart.trunc}', day), '${chart.label}') AS label,
             COALESCE(SUM(rev), 0)::float AS revenue,
             COALESCE(SUM(exp), 0)::float AS expenses,
             DATE_TRUNC('${chart.trunc}', day) AS bucket
      FROM (
        SELECT DATE_TRUNC('${chart.trunc}', ${receiptDateR}) AS day,
               COALESCE(SUM(COALESCE(r.amount, 0)), 0) AS rev,
               0::float AS exp
        FROM receipts r
        ${chartReceiptWhere}
        GROUP BY 1
        UNION ALL
        SELECT DATE_TRUNC('${chart.trunc}', ${receiptDateR}) AS day,
               0::float AS rev,
               COALESCE(SUM(COALESCE(i.total_amount, 0)), 0) AS exp
        FROM receipt_invoices i
        JOIN receipts r ON r.id = i.receipt_id
        ${chartInvoiceWhere.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + chartMoneyParams.length}`)}
        GROUP BY 1
        UNION ALL
        SELECT DATE_TRUNC('${chart.trunc}', expense_date) AS day,
               0::float AS rev,
               COALESCE(SUM(amount), 0) AS exp
        FROM expenses
        ${chartExpenseWhere.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + chartMoneyParams.length + chartInvoiceParams.length}`)}
        GROUP BY 1
      ) x
      GROUP BY 1, 4
      ORDER BY 4
      `,
      chartMoneyParams.concat(chartInvoiceParams, chartExpenseParams)
    );

    const shipments = shipmentStats.rows[0] || {};
    const drivers = driverStats.rows[0] || {};
    const money = moneyRow.rows[0] || {};
    const invoiceInfo = invoiceMoney.rows[0] || {};
    const transactions = num(money.transactions);
    const invoiceTotal = num(invoiceInfo.invoice_total);
    const expenses = num(expenseRow.rows[0]?.total);
    const netAfterInvoice = transactions - invoiceTotal;
    const netGet = netAfterInvoice - expenses;
    const delivered = num(shipments.delivered);
    const totalShipments = num(shipments.total);
    const deliveryRate = totalShipments ? Math.round((delivered / totalShipments) * 1000) / 10 : 0;
    const activeDrivers = num(drivers.active);
    const totalDrivers = num(drivers.total);
    const onTripCount = num(onTrip.rows[0]?.count);
    const idleDrivers = Math.max(totalDrivers - activeDrivers, 0);
    const pendingRow = pending.rows[0] || {};
    const routeTotal = topRoutes.rows.reduce((sum, row) => sum + num(row.trips), 0) || 1;

    return res.json({
      from,
      to,
      bucket,
      kpis: {
        totalShipments,
        activeVehicles: activeDrivers,
        totalVehicles: totalDrivers,
        deliveryRate,
        transactions,
        invoiceTotal,
        invoiceCount: num(invoiceInfo.invoice_count),
        missingInvoice: num(money.missing_invoice),
        missingInvoiceAmount: num(money.missing_invoice_amount),
        netAfterInvoice,
        expenses,
        netGet,
        revenue: netGet,
      },
      shipmentAnalytics: chartShipments.rows.map((row) => ({
        label: row.label,
        count: num(row.count),
      })),
      revenueExpenses: chartMoneyResult.rows.map((row) => ({
        label: row.label,
        revenue: num(row.revenue),
        expenses: num(row.expenses),
      })),
      recentShipments: recent.rows.map((row) => ({
        id: row.id,
        customer: row.customer_name || row.customer || "—",
        company: row.company_name || "",
        route: row.delivery_location || row.destination || "—",
        driver: row.driver_name || "—",
        vehicle: row.vehicle || "—",
        amount: num(row.amount),
        deliveryStatus: row.delivery_status,
        paymentStatus: row.payment_status,
        hasInvoice: Boolean(row.has_invoice),
        date: row.receipt_date || row.created_at,
      })),
      recentInvoices: recentInvoices.rows.map((row) => ({
        id: row.id,
        receiptId: row.receipt_id,
        customer: row.customer,
        company: row.company,
        receiptAmount: num(row.receipt_amount),
        invoiceAmount: num(row.total_amount),
        net: num(row.receipt_amount) - num(row.total_amount),
        deliveryStatus: row.delivery_status,
        paymentStatus: row.payment_status,
        date: row.date || row.updated_at || row.created_at,
      })),
      fleetStatus: {
        active: Math.max(activeDrivers - onTripCount, 0),
        onTrip: onTripCount,
        idle: idleDrivers,
        total: totalDrivers,
      },
      pendingActions: [
        { id: "open_deliveries", count: num(pendingRow.open_deliveries), page: "receipts" },
        { id: "unpaid", count: num(pendingRow.unpaid), page: "receipts" },
        { id: "missing_invoice", count: num(pendingRow.missing_invoice), page: "receipts" },
        { id: "expenses", count: null, page: "expenses" },
      ],
      topDrivers: topDrivers.rows.map((row, index) => ({
        rank: index + 1,
        name: row.name,
        trips: num(row.trips),
        onTimeRate: num(row.on_time_rate),
      })),
      topRoutes: topRoutes.rows.map((row, index) => ({
        rank: index + 1,
        route: row.route,
        trips: num(row.trips),
        share: Math.round((num(row.trips) / routeTotal) * 1000) / 10,
      })),
      counts: {
        delivered,
        pending: num(shipments.pending),
        inTransit: num(shipments.in_transit),
        canceled: num(shipments.canceled),
      },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return res.status(500).json({ message: "Could not load dashboard." });
  }
}

async function finance(req, res) {
  try {
    await ensureReceiptInvoices();
    const { from, to } = readRange(req);
    const receiptDateR = "COALESCE(r.receipt_date, r.created_at::date)";

    const receiptFilters = [];
    const receiptParams = [];
    pushDateFilter(receiptFilters, receiptParams, receiptDateR, from, to);
    const receiptWhere = whereSql(receiptFilters);

    const invoiceFilters = [];
    const invoiceParams = [];
    pushDateFilter(invoiceFilters, invoiceParams, receiptDateR, from, to);
    const invoiceWhere = whereSql(invoiceFilters);

    const expenseFilters = [];
    const expenseParams = [];
    pushDateFilter(expenseFilters, expenseParams, "expense_date", from, to);
    const expenseWhere = whereSql(expenseFilters);

    const [totals, transports, invoices, expenses, paymentSplit, expenseByCategory] = await Promise.all([
      query(
        `
        SELECT
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.delivery_status = 'Delivered' OR r.payment_status = 'Paid'
          ), 0)::float AS transport_revenue,
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.payment_status = 'Paid'
          ), 0)::float AS paid_transport,
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.payment_status IN ('Pending', 'Unpaid')
          ), 0)::float AS unpaid_transport,
          COUNT(*) FILTER (
            WHERE r.delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id)
          )::int AS missing_invoice,
          COALESCE(SUM(COALESCE(r.amount, 0)) FILTER (
            WHERE r.delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id)
          ), 0)::float AS missing_invoice_amount,
          COUNT(*) FILTER (
            WHERE r.delivery_status = 'Delivered' OR r.payment_status = 'Paid'
          )::int AS transport_count
        FROM receipts r
        ${receiptWhere}
        `,
        receiptParams
      ),
      query(
        `
        SELECT
          r.id,
          COALESCE(NULLIF(TRIM(r.customer_name), ''), NULLIF(TRIM(r.customer), ''), '—') AS customer,
          COALESCE(NULLIF(TRIM(r.company_name), ''), '') AS company,
          COALESCE(NULLIF(TRIM(r.driver_name), ''), '—') AS driver,
          COALESCE(NULLIF(TRIM(r.delivery_location), ''), NULLIF(TRIM(r.destination), ''), '—') AS route,
          r.delivery_status,
          r.payment_status,
          COALESCE(r.amount, 0)::float AS receipt_amount,
          i.total_amount::float AS invoice_amount,
          COALESCE(r.amount, 0)::float AS amount,
          CASE WHEN i.id IS NULL THEN false ELSE true END AS has_invoice,
          ${receiptDateR} AS date
        FROM receipts r
        LEFT JOIN receipt_invoices i ON i.receipt_id = r.id
        ${receiptWhere}
        ORDER BY ${receiptDateR} DESC, r.id DESC
        LIMIT 200
        `,
        receiptParams
      ),
      query(
        `
        SELECT
          i.id,
          i.receipt_id,
          i.total_amount::float AS total_amount,
          i.created_at,
          i.updated_at,
          COALESCE(NULLIF(TRIM(r.customer_name), ''), NULLIF(TRIM(r.customer), ''), '—') AS customer,
          COALESCE(NULLIF(TRIM(r.company_name), ''), '') AS company,
          COALESCE(NULLIF(TRIM(r.driver_name), ''), '—') AS driver,
          COALESCE(r.amount, 0)::float AS receipt_amount,
          r.delivery_status,
          r.payment_status,
          ${receiptDateR} AS date
        FROM receipt_invoices i
        JOIN receipts r ON r.id = i.receipt_id
        ${invoiceWhere}
        ORDER BY i.updated_at DESC, i.id DESC
        LIMIT 200
        `,
        invoiceParams
      ),
      query(
        `
        SELECT
          id,
          COALESCE(NULLIF(TRIM(user_name), ''), '—') AS staff,
          COALESCE(NULLIF(TRIM(category), ''), '—') AS category,
          COALESCE(NULLIF(TRIM(description), ''), '—') AS description,
          COALESCE(NULLIF(TRIM(driver_label), ''), '') AS driver_label,
          COALESCE(amount, 0)::float AS amount,
          expense_date AS date,
          attachment_file
        FROM expenses
        ${expenseWhere}
        ORDER BY expense_date DESC, id DESC
        LIMIT 200
        `,
        expenseParams
      ),
      query(
        `
        SELECT
          COALESCE(payment_status, 'Pending') AS status,
          COUNT(*)::int AS count,
          COALESCE(SUM(COALESCE(r.amount, 0)), 0)::float AS amount
        FROM receipts r
        ${receiptWhere}
        GROUP BY 1
        ORDER BY amount DESC
        `,
        receiptParams
      ),
      query(
        `
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Other') AS category,
          COUNT(*)::int AS count,
          COALESCE(SUM(amount), 0)::float AS amount
        FROM expenses
        ${expenseWhere}
        GROUP BY 1
        ORDER BY amount DESC
        `,
        expenseParams
      ),
    ]);

    const invoiceSum = await query(
      `
      SELECT
        COALESCE(SUM(COALESCE(i.total_amount, 0)), 0)::float AS invoice_total,
        COUNT(*)::int AS invoice_count
      FROM receipt_invoices i
      JOIN receipts r ON r.id = i.receipt_id
      ${invoiceWhere}
      `,
      invoiceParams
    );
    const expenseSum = await query(
      `SELECT COALESCE(SUM(amount), 0)::float AS expense_total, COUNT(*)::int AS expense_count FROM expenses ${expenseWhere}`,
      expenseParams
    );

    const row = totals.rows[0] || {};
    const transportRevenue = num(row.transport_revenue);
    const expenseTotal = num(expenseSum.rows[0]?.expense_total);
    const paidTransport = num(row.paid_transport);
    const unpaidTransport = num(row.unpaid_transport);
    const invoiceTotal = num(invoiceSum.rows[0]?.invoice_total);
    const netAfterInvoice = transportRevenue - invoiceTotal;
    const net = netAfterInvoice - expenseTotal;

    return res.json({
      from,
      to,
      summary: {
        transportRevenue,
        paidTransport,
        unpaidTransport,
        invoiceTotal,
        invoiceCount: num(invoiceSum.rows[0]?.invoice_count),
        missingInvoice: num(row.missing_invoice),
        missingInvoiceAmount: num(row.missing_invoice_amount),
        expenseTotal,
        netAfterInvoice,
        net,
        transportCount: num(row.transport_count),
        expenseCount: num(expenseSum.rows[0]?.expense_count),
      },
      transports: transports.rows.map((item) => ({
        id: item.id,
        customer: item.customer,
        company: item.company,
        driver: item.driver,
        route: item.route,
        deliveryStatus: item.delivery_status,
        paymentStatus: item.payment_status,
        receiptAmount: num(item.receipt_amount),
        invoiceAmount: item.invoice_amount == null ? null : num(item.invoice_amount),
        amount: num(item.amount),
        net: num(item.receipt_amount) - num(item.invoice_amount || 0),
        hasInvoice: Boolean(item.has_invoice),
        date: item.date,
      })),
      invoices: invoices.rows.map((item) => ({
        id: item.id,
        receiptId: item.receipt_id,
        customer: item.customer,
        company: item.company,
        driver: item.driver,
        receiptAmount: num(item.receipt_amount),
        invoiceAmount: num(item.total_amount),
        net: num(item.receipt_amount) - num(item.total_amount),
        deliveryStatus: item.delivery_status,
        paymentStatus: item.payment_status,
        date: item.date || item.updated_at || item.created_at,
      })),
      expenses: expenses.rows.map((item) => ({
        id: item.id,
        staff: item.staff,
        category: item.category,
        description: item.description,
        driverLabel: item.driver_label,
        amount: num(item.amount),
        date: item.date,
        hasAttachment: Boolean(item.attachment_file),
      })),
      paymentSplit: paymentSplit.rows.map((item) => ({
        status: item.status,
        count: num(item.count),
        amount: num(item.amount),
      })),
      expenseByCategory: expenseByCategory.rows.map((item) => ({
        category: item.category,
        count: num(item.count),
        amount: num(item.amount),
      })),
    });
  } catch (error) {
    console.error("Dashboard finance error:", error);
    return res.status(500).json({ message: "Could not load finance details." });
  }
}

module.exports = { summary, finance };
