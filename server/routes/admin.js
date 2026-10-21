// Trasy administracyjne (/api/admin): dziennik zmian, dostępny tylko dla administratora.
const express = require("express");
const { asyncRoute, requireRole } = require("../http/middleware");
const { listAudit } = require("../audit");

const router = express.Router();

router.get("/audit", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json(await listAudit({
    username: typeof req.query.username === "string" ? req.query.username : "",
    search: typeof req.query.search === "string" ? req.query.search : "",
    limit: req.query.limit
  }));
}));

module.exports = router;
