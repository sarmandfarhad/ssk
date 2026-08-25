const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../../config/db");

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "ssk-dev-secret",
    { expiresIn: "7d" }
  );
}

async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "E-mail and password are required." });
    }

    const result = await query(
      "SELECT id, name, email, role, password_hash FROM users WHERE LOWER(email) = $1",
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid e-mail or password." });
    }

    return res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role || "Admin" },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong. Try again." });
  }
}

async function me(req, res) {
  try {
    const result = await query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json({ user });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ message: "Something went wrong. Try again." });
  }
}

async function updateProfile(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "Name is required." });
    }
    const result = await query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role",
      [name, req.user.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Could not save profile." });
  }
}

async function changePassword(req, res) {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const nextPassword = String(req.body.nextPassword || "");
    if (!currentPassword || !nextPassword) {
      return res.status(400).json({ message: "Current and new password are required." });
    }
    if (nextPassword.length < 4) {
      return res.status(400).json({ message: "New password must be at least 4 characters." });
    }
    const result = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ message: "Current password is wrong." });
    }
    const passwordHash = await bcrypt.hash(nextPassword, 10);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.user.id]);
    return res.json({ ok: true, message: "Password updated." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Could not change password." });
  }
}

module.exports = { login, me, updateProfile, changePassword };
