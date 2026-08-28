/**
 * Wipe business data for a clean client handoff.
 * Keeps staff logins (users). Prevents demo seed from coming back.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { query, ensureDatabase } = require("../src/config/db");
const { ensureReceiptInvoices } = require("../src/api/controllers/receipt.controller");
const { ensureVehicleTypes } = require("../src/api/controllers/driver.controller");

async function truncate(table) {
  const found = await query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  if (!found.rows[0].name) {
    return;
  }
  await query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
}

async function main() {
  await ensureDatabase();
  await ensureReceiptInvoices();
  await query(`
    CREATE TABLE IF NOT EXISTS receipt_options (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      name VARCHAR(180) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (kind, name)
    )
  `);
  await ensureVehicleTypes();

  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);

  await truncate("receipt_invoices");
  await truncate("receipts");
  await truncate("receipt_options");
  await truncate("drivers");
  await truncate("expenses");
  await truncate("vehicle_types");

  await query(`
    INSERT INTO app_flags (key, value) VALUES ('demo_data_cleared', '1')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
  await query(`
    INSERT INTO app_flags (key, value) VALUES ('expenses_cleared', '1')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);

  const counts = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM receipts) AS receipts,
      (SELECT COUNT(*)::int FROM receipt_invoices) AS invoices,
      (SELECT COUNT(*)::int FROM receipt_options) AS labels,
      (SELECT COUNT(*)::int FROM drivers) AS drivers,
      (SELECT COUNT(*)::int FROM expenses) AS expenses,
      (SELECT COUNT(*)::int FROM vehicle_types) AS vehicle_types
  `);

  console.log("Client data cleared. Logins kept.");
  console.log(counts.rows[0]);
  process.exit(0);
}

main().catch((error) => {
  console.error("Clear failed:", error.message);
  process.exit(1);
});
