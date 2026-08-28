const { query } = require("../../config/db");
const { ensureReceiptInvoices } = require("./receipt.controller");

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function summary(req, res) {
  try {
    await ensureReceiptInvoices();
    const range = String(req.query.range || "monthly").toLowerCase();

    const [
      shipmentStats,
      driverStats,
      revenueRow,
      expenseRow,
      recent,
      topDrivers,
      topRoutes,
      pending,
      onTrip,
      chartShipments,
      chartMoney,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE delivery_status = 'Delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE delivery_status = 'Pending')::int AS pending,
          COUNT(*) FILTER (WHERE delivery_status = 'In Transmit')::int AS in_transit,
          COUNT(*) FILTER (WHERE delivery_status = 'Canceled')::int AS canceled
        FROM receipts
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Active')::int AS active
        FROM drivers
      `),
      query(`
        SELECT COALESCE(SUM(
          COALESCE(
            (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
            r.amount,
            0
          )
        ), 0)::float AS revenue
        FROM receipts r
        WHERE r.delivery_status = 'Delivered'
           OR r.payment_status = 'Paid'
      `),
      query(`SELECT COALESCE(SUM(amount), 0)::float AS total FROM expenses`),
      query(`
        SELECT id, customer_name, customer, company_name, driver_name, vehicle,
               delivery_location, destination, amount, delivery_status, payment_status,
               receipt_date, created_at
        FROM receipts
        ORDER BY id DESC
        LIMIT 6
      `),
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(driver_name), ''), '—') AS name,
          COUNT(*)::int AS trips,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE delivery_status = 'Delivered')
            / NULLIF(COUNT(*), 0),
            1
          )::float AS on_time_rate
        FROM receipts
        WHERE COALESCE(NULLIF(TRIM(driver_name), ''), '') <> ''
        GROUP BY 1
        ORDER BY trips DESC, on_time_rate DESC
        LIMIT 5
      `),
      query(`
        SELECT
          CONCAT(
            COALESCE(NULLIF(TRIM(receiving_location), ''), '-'),
            ' -> ',
            COALESCE(NULLIF(TRIM(delivery_location), ''), NULLIF(TRIM(destination), ''), '-')
          ) AS route,
          COUNT(*)::int AS trips
        FROM receipts
        GROUP BY 1
        ORDER BY trips DESC
        LIMIT 5
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE delivery_status IN ('Pending', 'In Transmit'))::int AS open_deliveries,
          COUNT(*) FILTER (WHERE payment_status IN ('Pending', 'Unpaid'))::int AS unpaid,
          COUNT(*) FILTER (
            WHERE delivery_status = 'Delivered'
              AND NOT EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = receipts.id)
          )::int AS missing_invoice
        FROM receipts
      `),
      query(`
        SELECT COUNT(DISTINCT driver_name)::int AS count
        FROM receipts
        WHERE delivery_status = 'In Transmit'
          AND COALESCE(NULLIF(TRIM(driver_name), ''), '') <> ''
      `),
      range === "weekly"
        ? query(`
            SELECT TO_CHAR(DATE_TRUNC('week', COALESCE(receipt_date, created_at::date)), 'Mon DD') AS label,
                   COUNT(*)::int AS count
            FROM receipts
            WHERE COALESCE(receipt_date, created_at::date) >= CURRENT_DATE - INTERVAL '49 days'
            GROUP BY 1, DATE_TRUNC('week', COALESCE(receipt_date, created_at::date))
            ORDER BY DATE_TRUNC('week', COALESCE(receipt_date, created_at::date))
          `)
        : query(`
            SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(receipt_date, created_at::date)), 'Mon') AS label,
                   COUNT(*)::int AS count
            FROM receipts
            WHERE COALESCE(receipt_date, created_at::date) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
            GROUP BY 1, DATE_TRUNC('month', COALESCE(receipt_date, created_at::date))
            ORDER BY DATE_TRUNC('month', COALESCE(receipt_date, created_at::date))
          `),
      range === "weekly"
        ? query(`
            SELECT TO_CHAR(DATE_TRUNC('week', day), 'Mon DD') AS label,
                   COALESCE(SUM(rev), 0)::float AS revenue,
                   COALESCE(SUM(exp), 0)::float AS expenses
            FROM (
              SELECT DATE_TRUNC('week', COALESCE(receipt_date, created_at::date)) AS day,
                     COALESCE(SUM(COALESCE(
                       (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
                       r.amount, 0
                     )), 0) AS rev,
                     0::float AS exp
              FROM receipts r
              WHERE COALESCE(receipt_date, created_at::date) >= CURRENT_DATE - INTERVAL '49 days'
              GROUP BY 1
              UNION ALL
              SELECT DATE_TRUNC('week', expense_date) AS day,
                     0::float AS rev,
                     COALESCE(SUM(amount), 0) AS exp
              FROM expenses
              WHERE expense_date >= CURRENT_DATE - INTERVAL '49 days'
              GROUP BY 1
            ) x
            GROUP BY 1, day
            ORDER BY day
          `)
        : query(`
            SELECT TO_CHAR(DATE_TRUNC('month', day), 'Mon') AS label,
                   COALESCE(SUM(rev), 0)::float AS revenue,
                   COALESCE(SUM(exp), 0)::float AS expenses
            FROM (
              SELECT DATE_TRUNC('month', COALESCE(receipt_date, created_at::date)) AS day,
                     COALESCE(SUM(COALESCE(
                       (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
                       r.amount, 0
                     )), 0) AS rev,
                     0::float AS exp
              FROM receipts r
              WHERE COALESCE(receipt_date, created_at::date) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
              GROUP BY 1
              UNION ALL
              SELECT DATE_TRUNC('month', expense_date) AS day,
                     0::float AS rev,
                     COALESCE(SUM(amount), 0) AS exp
              FROM expenses
              WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
              GROUP BY 1
            ) x
            GROUP BY 1, day
            ORDER BY day
          `),
    ]);

    const shipments = shipmentStats.rows[0] || {};
    const drivers = driverStats.rows[0] || {};
    const revenue = num(revenueRow.rows[0]?.revenue);
    const expenses = num(expenseRow.rows[0]?.total);
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
      kpis: {
        totalShipments,
        activeVehicles: activeDrivers,
        totalVehicles: totalDrivers,
        deliveryRate,
        revenue,
        expenses,
      },
      shipmentAnalytics: chartShipments.rows.map((row) => ({
        label: row.label,
        count: num(row.count),
      })),
      revenueExpenses: chartMoney.rows.map((row) => ({
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
        date: row.receipt_date || row.created_at,
      })),
      fleetStatus: {
        active: Math.max(activeDrivers - onTripCount, 0),
        onTrip: onTripCount,
        idle: idleDrivers,
        total: totalDrivers,
      },
      pendingActions: [
        {
          id: "open_deliveries",
          count: num(pendingRow.open_deliveries),
          page: "receipts",
        },
        {
          id: "unpaid",
          count: num(pendingRow.unpaid),
          page: "receipts",
        },
        {
          id: "missing_invoice",
          count: num(pendingRow.missing_invoice),
          page: "receipts",
        },
        {
          id: "expenses",
          count: null,
          page: "expenses",
        },
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
      range,
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return res.status(500).json({ message: "Could not load dashboard." });
  }
}

async function finance(req, res) {
  try {
    await ensureReceiptInvoices();

    const [totals, transports, expenses, paymentSplit, expenseByCategory] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN r.delivery_status = 'Delivered' OR r.payment_status = 'Paid'
              THEN COALESCE(
                (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
                r.amount, 0
              )
              ELSE 0
            END
          ), 0)::float AS transport_revenue,
          COALESCE(SUM(
            CASE
              WHEN r.payment_status = 'Paid'
              THEN COALESCE(
                (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
                r.amount, 0
              )
              ELSE 0
            END
          ), 0)::float AS paid_transport,
          COALESCE(SUM(
            CASE
              WHEN r.payment_status IN ('Pending', 'Unpaid')
              THEN COALESCE(
                (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
                r.amount, 0
              )
              ELSE 0
            END
          ), 0)::float AS unpaid_transport,
          COALESCE(SUM(
            CASE
              WHEN EXISTS (SELECT 1 FROM receipt_invoices i WHERE i.receipt_id = r.id)
              THEN (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id)
              ELSE 0
            END
          ), 0)::float AS invoice_total,
          (SELECT COALESCE(SUM(amount), 0)::float FROM expenses) AS expense_total,
          (SELECT COUNT(*)::int FROM expenses) AS expense_count,
          (
            SELECT COUNT(*)::int FROM receipts r2
            WHERE r2.delivery_status = 'Delivered' OR r2.payment_status = 'Paid'
          ) AS transport_count
        FROM receipts r
      `),
      query(`
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
          COALESCE(i.total_amount, r.amount, 0)::float AS amount,
          CASE WHEN i.id IS NULL THEN false ELSE true END AS has_invoice,
          COALESCE(r.receipt_date, r.created_at::date) AS date
        FROM receipts r
        LEFT JOIN receipt_invoices i ON i.receipt_id = r.id
        WHERE r.delivery_status = 'Delivered'
           OR r.payment_status = 'Paid'
           OR r.payment_status IN ('Pending', 'Unpaid')
           OR i.id IS NOT NULL
        ORDER BY COALESCE(r.receipt_date, r.created_at::date) DESC, r.id DESC
        LIMIT 200
      `),
      query(`
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
        ORDER BY expense_date DESC, id DESC
        LIMIT 200
      `),
      query(`
        SELECT
          COALESCE(payment_status, 'Pending') AS status,
          COUNT(*)::int AS count,
          COALESCE(SUM(COALESCE(
            (SELECT i.total_amount FROM receipt_invoices i WHERE i.receipt_id = r.id),
            r.amount, 0
          )), 0)::float AS amount
        FROM receipts r
        GROUP BY 1
        ORDER BY amount DESC
      `),
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Other') AS category,
          COUNT(*)::int AS count,
          COALESCE(SUM(amount), 0)::float AS amount
        FROM expenses
        GROUP BY 1
        ORDER BY amount DESC
      `),
    ]);

    const row = totals.rows[0] || {};
    const transportRevenue = num(row.transport_revenue);
    const expenseTotal = num(row.expense_total);
    const paidTransport = num(row.paid_transport);
    const unpaidTransport = num(row.unpaid_transport);
    const invoiceTotal = num(row.invoice_total);

    return res.json({
      summary: {
        transportRevenue,
        paidTransport,
        unpaidTransport,
        invoiceTotal,
        expenseTotal,
        net: transportRevenue - expenseTotal,
        transportCount: num(row.transport_count),
        expenseCount: num(row.expense_count),
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
        hasInvoice: Boolean(item.has_invoice),
        date: item.date,
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
