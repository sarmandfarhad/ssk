const path = require("path");
const fs = require("fs");
const { query } = require("../../config/db");

const uploadsDir = path.join(__dirname, "../../../uploads");

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function withFile(row) {
  if (!row) {
    return row;
  }
  return {
    ...row,
    staff_name: row.user_name || row.driver_label,
    has_attachment: Boolean(row.attachment_file),
  };
}

async function currentUser(req) {
  const result = await query("SELECT id, name, email FROM users WHERE id = $1", [req.user.id]);
  return result.rows[0] || null;
}

async function list(req, res) {
  try {
    const user = await currentUser(req);
    if (!user) {
      return res.status(401).json({ message: "Please sign in again." });
    }

    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const description = String(req.query.description || "").trim();
    const createdBy = String(req.query.created_by || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 7);
    const offset = (page - 1) * limit;
    const filters = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      filters.push(`(
        LOWER(COALESCE(user_name, driver_label)) LIKE $${params.length}
        OR LOWER(category) LIKE $${params.length}
        OR LOWER(description) LIKE $${params.length}
      )`);
    }
    if (createdBy) {
      params.push(createdBy);
      filters.push(`user_name = $${params.length}`);
    }
    if (category) {
      params.push(category);
      filters.push(`category = $${params.length}`);
    }
    if (description) {
      params.push(description);
      filters.push(`description = $${params.length}`);
    }
    if (from) {
      params.push(from);
      filters.push(`expense_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      filters.push(`expense_date <= $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const totalResult = await query(`SELECT COUNT(*)::int AS count FROM expenses ${where}`, params);
    const descResult = await query("SELECT DISTINCT description FROM expenses ORDER BY description ASC");
    const staffResult = await query(
      "SELECT DISTINCT user_name FROM expenses WHERE user_name IS NOT NULL AND user_name <> '' ORDER BY user_name ASC"
    );
    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM expenses ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      items: result.rows.map(withFile),
      total: totalResult.rows[0].count,
      descriptions: descResult.rows.map((row) => row.description),
      staff: staffResult.rows.map((row) => row.user_name),
      page,
      limit,
    });
  } catch (error) {
    console.error("List expenses error:", error);
    return res.status(500).json({ message: "Could not load expenses." });
  }
}

async function create(req, res) {
  try {
    const user = await currentUser(req);
    if (!user) {
      return res.status(401).json({ message: "Please sign in again." });
    }

    const body = req.body;
    if (!body.category || !body.expense_date || !body.amount || !body.description) {
      return res.status(400).json({ message: "Please fill the required expense fields." });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: "Amount must be a valid number." });
    }

    const attachment = req.file ? req.file.filename : null;
    const result = await query(
      `INSERT INTO expenses
        (user_id, user_name, driver_label, category, expense_date, amount, description, attachment_file)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.id, user.name, body.category, body.expense_date, amount, body.description, attachment]
    );

    return res.status(201).json({ item: withFile(result.rows[0]) });
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "Could not add expense." });
  }
}

async function file(req, res) {
  try {
    const result = await query("SELECT attachment_file FROM expenses WHERE id = $1", [req.params.id]);
    const row = result.rows[0];
    if (!row || !row.attachment_file) {
      return res.status(404).json({ message: "File not found." });
    }
    const fullPath = path.join(uploadsDir, path.basename(row.attachment_file));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "File not found on disk." });
    }
    return res.sendFile(fullPath);
  } catch (error) {
    console.error("Expense file error:", error);
    return res.status(500).json({ message: "Could not open file." });
  }
}

async function remove(req, res) {
  try {
    const result = await query("DELETE FROM expenses WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "Expense not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    return res.status(500).json({ message: "Could not delete expense." });
  }
}

module.exports = { list, create, file, remove, uploadsDir };
