const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { list, create, one, update, remove, listOptions, addOption } = require("../controllers/receipt.controller");

const router = express.Router();

router.get("/", requireAuth, list);
router.get("/options", requireAuth, listOptions);
router.post("/options", requireAuth, addOption);
router.post("/", requireAuth, create);
router.put("/:id", requireAuth, update);
router.get("/:id", requireAuth, one);
router.delete("/:id", requireAuth, remove);

module.exports = router;
