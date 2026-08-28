const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { summary, finance } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/", requireAuth, summary);
router.get("/finance", requireAuth, finance);

module.exports = router;
