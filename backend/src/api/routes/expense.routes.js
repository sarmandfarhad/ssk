const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware");
const { list, create, file, remove, uploadsDir } = require("../controllers/expense.controller");

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename(req, file, done) {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      done(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = express.Router();

router.get("/", requireAuth, list);
router.post("/", requireAuth, upload.single("attachment"), create);
router.get("/:id/file", requireAuth, file);
router.delete("/:id", requireAuth, remove);

module.exports = router;
