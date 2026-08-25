const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware");
const { list, create, update, one, remove, csv, file, listTypes, addType, uploadsDir } = require("../controllers/driver.controller");

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename(req, file, done) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    done(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

const router = express.Router();

router.get("/", requireAuth, list);
router.get("/export.csv", requireAuth, csv);
router.get("/vehicle-types", requireAuth, listTypes);
router.post("/vehicle-types", requireAuth, addType);
router.get("/:id/file/:kind", requireAuth, file);
router.post(
  "/",
  requireAuth,
  upload.fields([
    { name: "license", maxCount: 1 },
    { name: "national_id", maxCount: 1 },
    { name: "renewal", maxCount: 1 },
  ]),
  create
);
router.put(
  "/:id",
  requireAuth,
  upload.fields([
    { name: "license", maxCount: 1 },
    { name: "national_id", maxCount: 1 },
    { name: "renewal", maxCount: 1 },
  ]),
  update
);
router.get("/:id", requireAuth, one);
router.delete("/:id", requireAuth, remove);

module.exports = router;
