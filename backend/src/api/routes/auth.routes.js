const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { login, me, updateProfile, changePassword } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/login", login);
router.get("/me", requireAuth, me);
router.put("/profile", requireAuth, updateProfile);
router.put("/password", requireAuth, changePassword);

module.exports = router;
