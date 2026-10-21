// Trasy katalogów: spółki, odbiorcy i projekty (/api/catalogs).
const express = require("express");
const catalogs = require("../catalogs");
const { asyncRoute, requireValidId } = require("../http/middleware");

const router = express.Router();

router.get("/companies", asyncRoute(async (_req, res) => {
  res.json(await catalogs.listCompanies());
}));

router.post("/companies", asyncRoute(async (req, res) => {
  res.status(201).json(await catalogs.createCompany(req.body || {}));
}));

router.put("/companies/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator spółki.");
  res.json(await catalogs.updateCompany(req.params.id, req.body || {}));
}));

router.delete("/companies/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator spółki.");
  await catalogs.deleteCompany(req.params.id);
  res.status(204).end();
}));

router.delete("/recipients/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator odbiorcy.");
  await catalogs.deleteRecipient(req.params.id);
  res.status(204).end();
}));

router.delete("/projects/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator projektu.");
  await catalogs.deleteProject(req.params.id);
  res.status(204).end();
}));

router.get("/recipients", asyncRoute(async (_req, res) => {
  res.json(await catalogs.listRecipients());
}));

router.post("/recipients", asyncRoute(async (req, res) => {
  res.status(201).json(await catalogs.createRecipient(req.body || {}));
}));

router.put("/recipients/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator odbiorcy.");
  res.json(await catalogs.updateRecipient(req.params.id, req.body || {}));
}));

router.get("/projects", asyncRoute(async (_req, res) => {
  res.json(await catalogs.listProjects());
}));

router.post("/projects", asyncRoute(async (req, res) => {
  res.status(201).json(await catalogs.createProject(req.body || {}));
}));

router.put("/projects/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator projektu.");
  res.json(await catalogs.updateProject(req.params.id, req.body || {}));
}));

module.exports = router;
