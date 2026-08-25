const { Pool, Client } = require("pg");

const config = {
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "2244",
};

const pool = new Pool({
  ...config,
  database: process.env.PG_DATABASE || "ssk_erp",
});

async function ensureDatabase() {
  const admin = new Client({ ...config, database: "postgres" });
  await admin.connect();
  const result = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [process.env.PG_DATABASE || "ssk_erp"]
  );
  if (result.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${process.env.PG_DATABASE || "ssk_erp"}`);
  }
  await admin.end();
}

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, ensureDatabase };
