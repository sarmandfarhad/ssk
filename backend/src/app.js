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

const sampleReceipts = [
  ["Karwan Trading", "name", "Truck - 22 345678", "Erbil - Duhok", 1250000, "Pending", "Pending"],
  ["Nashat Co", "name", "Van - 22 345678", "Erbil - Sulaymani", 890000, "Delivered", "Paid"],
  ["Zagros Oil", "name", "Truck - 22 345678", "Erbil - Duhok", 2100000, "In Transmit", "Unpaid"],
  ["Hawler Market", "name", "Van - 22 345678", "Erbil - Sulaymani", 450000, "Canceled", "Unpaid"],
  ["Duhok Logistics", "name", "Truck - 22 345678", "Erbil - Duhok", 1750000, "Delivered", "Paid"],
  ["Soran Foods", "name", "Van - 22 345678", "Erbil - Sulaymani", 620000, "Pending", "Pending"],
  ["Koya Transport", "name", "Truck - 22 345678", "Erbil - Duhok", 980000, "In Transmit", "Pending"],
  ["Akre Supplies", "name", "Van - 22 345678", "Erbil - Sulaymani", 310000, "Delivered", "Paid"],
  ["Shaqlawa Co", "name", "Truck - 22 345678", "Erbil - Duhok", 1420000, "Pending", "Unpaid"],
  ["Ranya Store", "name", "Van - 22 345678", "Erbil - Sulaymani", 770000, "Delivered", "Paid"],
  ["Halabja Trade", "name", "Truck - 22 345678", "Erbil - Duhok", 1980000, "Canceled", "Unpaid"],
  ["Dukan Cargo", "name", "Van - 22 345678", "Erbil - Sulaymani", 540000, "In Transmit", "Pending"],
  ["Chamchamal Co", "name", "Truck - 22 345678", "Erbil - Duhok", 1330000, "Delivered", "Paid"],
  ["Kalar Market", "name", "Van - 22 345678", "Erbil - Sulaymani", 410000, "Pending", "Pending"],
  ["Zakho Line", "name", "Truck - 22 345678", "Erbil - Duhok", 2210000, "In Transmit", "Unpaid"],
  ["Amedi Goods", "name", "Van - 22 345678", "Erbil - Sulaymani", 680000, "Delivered", "Paid"],
  ["Bardarash Co", "name", "Truck - 22 345678", "Erbil - Duhok", 1150000, "Pending", "Pending"],
  ["Shekhan Trade", "name", "Van - 22 345678", "Erbil - Sulaymani", 390000, "Canceled", "Unpaid"],
  ["Qasrok Cargo", "name", "Truck - 22 345678", "Erbil - Duhok", 1640000, "Delivered", "Paid"],
  ["Sarsing Co", "name", "Van - 22 345678", "Erbil - Sulaymani", 505000, "In Transmit", "Pending"],
  ["Barzan Store", "name", "Truck - 22 345678", "Erbil - Duhok", 1870000, "Pending", "Unpaid"],
  ["Mergasor Co", "name", "Van - 22 345678", "Erbil - Sulaymani", 730000, "Delivered", "Paid"],
  ["Choman Line", "name", "Truck - 22 345678", "Erbil - Duhok", 920000, "In Transmit", "Pending"],
  ["Sidakan Co", "name", "Van - 22 345678", "Erbil - Sulaymani", 355000, "Canceled", "Unpaid"],
  ["Khabat Trade", "name", "Truck - 22 345678", "Erbil - Duhok", 1480000, "Delivered", "Paid"],
  ["Makhmur Co", "name", "Van - 22 345678", "Erbil - Sulaymani", 610000, "Pending", "Pending"],
  ["Taq Taq Cargo", "name", "Truck - 22 345678", "Erbil - Duhok", 2010000, "In Transmit", "Unpaid"],
  ["Koya Market", "name", "Van - 22 345678", "Erbil - Sulaymani", 470000, "Delivered", "Paid"],
  ["Rawanduz Co", "name", "Truck - 22 345678", "Erbil - Duhok", 1290000, "Pending", "Pending"],
  ["Pirmam Line", "name", "Van - 22 345678", "Erbil - Sulaymani", 860000, "Delivered", "Paid"],
];

const sampleDrivers = [
  ["Ahmad Ali", 32, "1994-03-12", "0750 321 4321", "Hyundai Mighty", "Truck", "AA-123456", "1234567", "2023", "White", "Active", 2450000],
  ["Rebin Osman", 29, "1997-08-04", "0750 111 2233", "Kia Bongo", "Van", "22 345678", "8877665", "2022", "Silver", "Active", 1890000],
  ["Soran Hadi", 41, "1985-01-19", "0751 444 7788", "Isuzu NPR", "Truck", "ERB 2211", "5544332", "2021", "Blue", "Off Duty", 980000],
  ["Dara Namiq", 36, "1990-11-02", "0750 909 1010", "Toyota Hilux", "Pickup", "DHK 9087", "1122334", "2024", "Black", "Active", 1320000],
  ["Karwan Omer", 27, "1999-06-15", "0752 333 1212", "Hyundai County", "Van", "SUL 4401", "6677889", "2020", "White", "Active", 760000],
  ["Barzan Aziz", 38, "1988-02-28", "0750 555 9090", "Hino 300", "Truck", "22 778899", "3344556", "2023", "Red", "Off Duty", 2100000],
  ["Halo Mustafa", 33, "1993-09-09", "0751 212 3434", "Mitsubishi Canter", "Truck", "ZAK 1020", "7788990", "2022", "White", "Active", 1540000],
  ["Shvan Karim", 30, "1996-04-21", "0750 600 7000", "Kia K2700", "Pickup", "ERB 5566", "2211009", "2021", "Grey", "Active", 640000],
  ["Aram Salih", 45, "1981-12-08", "0753 888 1919", "Volvo FL", "Truck", "22 111222", "9988776", "2019", "Blue", "Off Duty", 3200000],
  ["Nihad Qadir", 26, "2000-07-30", "0750 404 5050", "Hyundai H100", "Van", "DOH 3344", "4455667", "2024", "White", "Active", 510000],
  ["Raman Fatah", 34, "1992-05-17", "0751 777 8080", "Isuzu D-Max", "Pickup", "AA-778899", "5566778", "2023", "Green", "Active", 870000],
  ["Bahoz Jamal", 39, "1987-10-11", "0752 121 3434", "Fuso Canter", "Truck", "22 909088", "6677001", "2020", "White", "Active", 1760000],
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

  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);
  const cleared = await query("SELECT key FROM app_flags WHERE key = 'demo_data_cleared'");
  if (cleared.rowCount) {
    return;
  }

  const existing = await query("SELECT COUNT(*)::int AS count FROM receipts");
  if (existing.rows[0].count > 0) {
    return;
  }

  for (let i = 0; i < sampleReceipts.length; i += 1) {
    const [customer, driverName, vehicle, destination, amount, deliveryStatus, paymentStatus] =
      sampleReceipts[i];
    const day = String((i % 28) + 1).padStart(2, "0");
    await query(
      `INSERT INTO receipts
        (customer, driver_name, vehicle, destination, amount, delivery_status, payment_status, receipt_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [customer, driverName, vehicle, destination, amount, deliveryStatus, paymentStatus, `2026-05-${day}`]
    );
  }
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

  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);
  const cleared = await query("SELECT key FROM app_flags WHERE key = 'demo_data_cleared'");
  if (cleared.rowCount) {
    return;
  }

  const existing = await query("SELECT COUNT(*)::int AS count FROM drivers");
  if (existing.rows[0].count > 0) {
    return;
  }

  for (const driver of sampleDrivers) {
    const [firstName, age, dob, phone, vehicle, type, plate, card, year, color, status, revenue] = driver;
    await query(
      `INSERT INTO drivers (
        first_name, age, date_of_birth, phone1, vehicle_name, vehicle_type,
        plate_number, annual_card_number, model_year, color, status, total_revenue
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [firstName, age, dob, phone, vehicle, type, plate, card, year, color, status, revenue]
    );
  }
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
  await query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key VARCHAR(60) PRIMARY KEY,
      value TEXT
    )
  `);
  const cleared = await query("SELECT key FROM app_flags WHERE key = 'demo_data_cleared'");
  if (cleared.rowCount) {
    return;
  }
  const defaults = ["Truck", "Van", "Pickup"];
  for (const name of defaults) {
    await saveVehicleType(name);
  }
  const used = await query("SELECT DISTINCT vehicle_type FROM drivers WHERE vehicle_type IS NOT NULL AND vehicle_type <> ''");
  for (const row of used.rows) {
    await saveVehicleType(row.vehicle_type);
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
