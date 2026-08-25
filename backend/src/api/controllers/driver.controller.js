const path = require("path");
const fs = require("fs");
const { query } = require("../../config/db");

const uploadsDir = path.join(__dirname, "../../../uploads");

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toAge(value) {
  const number = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(number) || number < 1 || number > 120) {
    return null;
  }
  return number;
}

function fileName(file) {
  return file ? file.filename : null;
}

function publicFile(name) {
  return name ? `/api/files/${encodeURIComponent(name)}` : null;
}

function withFiles(row) {
  if (!row) {
    return row;
  }
  return {
    ...row,
    license_url: publicFile(row.license_file),
    national_id_url: publicFile(row.national_id_file),
    renewal_url: publicFile(row.renewal_file),
  };
}

async function list(req, res) {
  try {
    const search = String(req.query.search || "").trim();
    const vehicleType = String(req.query.vehicle_type || "").trim();
    const status = String(req.query.status || "").trim();
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 10);
    const offset = (page - 1) * limit;
    const filters = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      filters.push(`(
        LOWER(first_name) LIKE $${params.length}
        OR LOWER(vehicle_name) LIKE $${params.length}
        OR LOWER(plate_number) LIKE $${params.length}
        OR LOWER(phone1) LIKE $${params.length}
      )`);
    }
    if (vehicleType) {
      params.push(vehicleType);
      filters.push(`vehicle_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const totalResult = await query(`SELECT COUNT(*)::int AS count FROM drivers ${where}`, params);
    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM drivers ${where} ORDER BY id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      items: result.rows.map(withFiles),
      total: totalResult.rows[0].count,
      page,
      limit,
    });
  } catch (error) {
    console.error("List drivers error:", error);
    return res.status(500).json({ message: "Could not load drivers." });
  }
}

async function create(req, res) {
  try {
    const body = req.body;
    if (!body.first_name || !body.phone1 || !body.vehicle_name || !body.vehicle_type || !body.plate_number) {
      return res.status(400).json({ message: "Please fill the required driver and vehicle fields." });
    }

    const age = toAge(body.age);
    if (body.age && age == null) {
      return res.status(400).json({ message: "Age must be a number between 1 and 120." });
    }

    const files = req.files || {};
    const result = await query(
      `INSERT INTO drivers (
        first_name, age, date_of_birth, phone1, phone2,
        license_file, national_id_file, vehicle_name, vehicle_type,
        plate_number, annual_card_number, model_year, color, renewal_file, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        body.first_name,
        age,
        body.date_of_birth || null,
        body.phone1,
        body.phone2 || null,
        fileName(files.license && files.license[0]),
        fileName(files.national_id && files.national_id[0]),
        body.vehicle_name,
        body.vehicle_type,
        body.plate_number,
        body.annual_card_number || null,
        body.model_year || null,
        body.color || null,
        fileName(files.renewal && files.renewal[0]),
        body.status || "Active",
      ]
    );

    await saveVehicleType(body.vehicle_type);
    return res.status(201).json({ item: withFiles(result.rows[0]) });
  } catch (error) {
    console.error("Create driver error:", error);
    return res.status(500).json({ message: "Could not add driver." });
  }
}

async function update(req, res) {
  try {
    const existing = await query("SELECT * FROM drivers WHERE id = $1", [req.params.id]);
    if (!existing.rowCount) {
      return res.status(404).json({ message: "Driver not found." });
    }
    const row = existing.rows[0];
    const body = req.body;
    if (!body.first_name || !body.phone1 || !body.vehicle_name || !body.vehicle_type || !body.plate_number) {
      return res.status(400).json({ message: "Please fill the required driver and vehicle fields." });
    }

    const age = toAge(body.age);
    if (body.age && age == null) {
      return res.status(400).json({ message: "Age must be a number between 1 and 120." });
    }

    const files = req.files || {};
    const result = await query(
      `UPDATE drivers SET
        first_name = $2, age = $3, date_of_birth = $4, phone1 = $5, phone2 = $6,
        license_file = $7, national_id_file = $8, vehicle_name = $9, vehicle_type = $10,
        plate_number = $11, annual_card_number = $12, model_year = $13, color = $14,
        renewal_file = $15, status = $16, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        body.first_name,
        age,
        body.date_of_birth || null,
        body.phone1,
        body.phone2 || null,
        fileName(files.license && files.license[0]) || row.license_file,
        fileName(files.national_id && files.national_id[0]) || row.national_id_file,
        body.vehicle_name,
        body.vehicle_type,
        body.plate_number,
        body.annual_card_number || null,
        body.model_year || null,
        body.color || null,
        fileName(files.renewal && files.renewal[0]) || row.renewal_file,
        body.status || row.status || "Active",
      ]
    );

    await saveVehicleType(body.vehicle_type);
    return res.json({ item: withFiles(result.rows[0]) });
  } catch (error) {
    console.error("Update driver error:", error);
    return res.status(500).json({ message: "Could not update driver." });
  }
}

async function one(req, res) {
  try {
    const result = await query("SELECT * FROM drivers WHERE id = $1", [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "Driver not found." });
    }
    return res.json({ item: withFiles(result.rows[0]) });
  } catch (error) {
    console.error("Get driver error:", error);
    return res.status(500).json({ message: "Could not load driver." });
  }
}

async function remove(req, res) {
  try {
    const result = await query("DELETE FROM drivers WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "Driver not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete driver error:", error);
    return res.status(500).json({ message: "Could not delete driver." });
  }
}

async function csv(req, res) {
  try {
    const result = await query("SELECT * FROM drivers ORDER BY id ASC");
    const header = [
      "ID",
      "Driver Name",
      "Phone",
      "Vehicle",
      "Type",
      "Plate",
      "Status",
      "Date Added",
    ];
    const lines = [header.join(",")].concat(
      result.rows.map((row) =>
        [
          row.id,
          `"${row.first_name}"`,
          `"${row.phone1 || ""}"`,
          `"${row.vehicle_name || ""}"`,
          `"${row.vehicle_type || ""}"`,
          `"${row.plate_number || ""}"`,
          row.status,
          row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "",
        ].join(",")
      )
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=drivers.csv");
    return res.send(lines.join("\n"));
  } catch (error) {
    console.error("CSV drivers error:", error);
    return res.status(500).json({ message: "Could not export drivers." });
  }
}

async function file(req, res) {
  try {
    const kinds = {
      license: "license_file",
      national_id: "national_id_file",
      renewal: "renewal_file",
    };
    const column = kinds[req.params.kind];
    if (!column) {
      return res.status(400).json({ message: "Invalid file type." });
    }

    const result = await query("SELECT * FROM drivers WHERE id = $1", [req.params.id]);
    const row = result.rows[0];
    if (!row || !row[column]) {
      return res.status(404).json({ message: "File not found." });
    }

    const fullPath = path.join(uploadsDir, path.basename(row[column]));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "File not found on disk." });
    }

    return res.sendFile(fullPath);
  } catch (error) {
    console.error("Driver file error:", error);
    return res.status(500).json({ message: "Could not open file." });
  }
}

async function ensureVehicleTypes() {
  await query(`
    CREATE TABLE IF NOT EXISTS vehicle_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE
    )
  `);
}

async function saveVehicleType(name) {
  const value = String(name || "").trim();
  if (!value) {
    return;
  }
  await ensureVehicleTypes();
  const existing = await query("SELECT id FROM vehicle_types WHERE LOWER(name) = LOWER($1)", [value]);
  if (!existing.rowCount) {
    await query("INSERT INTO vehicle_types (name) VALUES ($1)", [value]);
  }
}

async function listTypes(req, res) {
  try {
    await ensureVehicleTypes();
    const result = await query("SELECT name FROM vehicle_types ORDER BY name ASC");
    return res.json({ items: result.rows.map((row) => row.name) });
  } catch (error) {
    console.error("List vehicle types error:", error);
    return res.status(500).json({ message: "Could not load vehicle types." });
  }
}

async function addType(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Type is required." });
    }
    await saveVehicleType(name);
    const result = await query("SELECT name FROM vehicle_types ORDER BY name ASC");
    return res.json({ items: result.rows.map((row) => row.name) });
  } catch (error) {
    console.error("Add vehicle type error:", error);
    return res.status(500).json({ message: "Could not save vehicle type." });
  }
}

module.exports = { list, create, update, one, remove, csv, file, listTypes, addType, ensureVehicleTypes, saveVehicleType, uploadsDir };
