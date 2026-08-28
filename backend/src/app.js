require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { query, ensureDatabase } = require("./config/db");
const { ensureVehicleTypes, saveVehicleType } = require("./api/controllers/driver.controller");
const { seedReceiptOptions, ensureReceiptInvoices } = require("./api/controllers/receipt.controller");
const path = require("path");
const authRoutes = require("./api/routes/auth.routes");
const receiptRoutes = require("./api/routes/receipt.routes");
const driverRoutes = require("./api/routes/driver.routes");
const expenseRoutes = require("./api/routes/expense.routes");
const dashboardRoutes = require("./api/routes/dashboard.routes");

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/dashboard", dashboardRoutes);

const accounts = [
  { name: "Shahram", email: "shahram@ssk.com", role: "Admin" },
  { name: "Kamaran", email: "kamaran@ssk.com", role: "Admin" },
];

async function seedUsers() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'Admin',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'Admin'");

  const passwordHash = await bcrypt.hash("2244", 10);
  for (const account of accounts) {
    await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [account.name, account.email, passwordHash, account.role]
    );
  }
}

async function seedReceipts() {
  await query(`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      customer VARCHAR(150) NOT NULL,
      driver_name VARCHAR(150) NOT NULL,
      vehicle VARCHAR(150) NOT NULL,
      destination VARCHAR(150) NOT NULL,
      amount NUMERIC(14, 0) NOT NULL,
      delivery_status VARCHAR(40) NOT NULL,
      payment_status VARCHAR(40) NOT NULL,
      receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS company_name VARCHAR(150)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS phone VARCHAR(40)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receiving_location VARCHAR(150)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(150)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS goods_type VARCHAR(80)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pieces INTEGER");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS weight NUMERIC(12, 2)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS car_type VARCHAR(80)");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS driver_id INTEGER");
  await query("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS notes TEXT");

  // Never auto-insert demo receipts. New installs stay empty.
  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);
  await query(`
    INSERT INTO app_flags (key, value) VALUES ('demo_data_cleared', '1')
    ON CONFLICT (key) DO NOTHING
  `);
}

async function seedDrivers() {
  await query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      age INTEGER,
      date_of_birth DATE,
      phone1 VARCHAR(40) NOT NULL,
      phone2 VARCHAR(40),
      license_file VARCHAR(255),
      national_id_file VARCHAR(255),
      vehicle_name VARCHAR(150) NOT NULL,
      vehicle_type VARCHAR(80) NOT NULL,
      plate_number VARCHAR(80) NOT NULL,
      annual_card_number VARCHAR(80),
      model_year VARCHAR(10),
      color VARCHAR(40),
      renewal_file VARCHAR(255),
      status VARCHAR(40) DEFAULT 'Active',
      total_revenue NUMERIC(14, 0) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Never auto-insert demo drivers. New installs stay empty.
}

async function seedExpenses() {
  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER,
      driver_label VARCHAR(180) NOT NULL,
      category VARCHAR(80) NOT NULL,
      expense_date DATE NOT NULL,
      amount NUMERIC(14, 0) NOT NULL,
      description TEXT NOT NULL,
      attachment_file VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id INTEGER");
  await query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_name VARCHAR(120)");
  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);
  const cleared = await query("SELECT key FROM app_flags WHERE key = 'expenses_cleared'");
  if (!cleared.rowCount) {
    await query("TRUNCATE TABLE expenses RESTART IDENTITY");
    await query("INSERT INTO app_flags (key, value) VALUES ('expenses_cleared', '1')");
  }
}

async function seedVehicleTypes() {
  await ensureVehicleTypes();
  // Only generic type labels for the form — not company records.
  const defaults = ["Truck", "Van", "Pickup"];
  for (const name of defaults) {
    await saveVehicleType(name);
  }
}

async function start() {
  await ensureDatabase();
  await seedUsers();
  await seedReceipts();
  await ensureReceiptInvoices();
  await seedReceiptOptions();
  await seedDrivers();
  await seedVehicleTypes();
  await seedExpenses();

  app.listen(port, () => {
    console.log(`SSK API running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Could not start server:", error.message);
  process.exit(1);
});
