-- Run as the postgres user (pgAdmin or psql).
-- Database ssk_erp should already exist.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT NOW()
);

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
);

-- Login accounts: shahram@ssk.com / 2244 and kamaran@ssk.com / 2244
-- The backend creates users, receipts, and drivers on startup.

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
);

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
);

CREATE TABLE IF NOT EXISTS receipt_invoices (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(14, 0) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
