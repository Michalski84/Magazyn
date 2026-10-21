// Trasy modułu magazynu: magazyny, towary, stany, WZ, MM, korekty i przyjęcia (/api/warehouse).
const express = require("express");
const warehouse = require("../warehouse");
const { asyncRoute, requireValidId } = require("../http/middleware");

const router = express.Router();

router.get("/companies", asyncRoute(async (_req, res) => {
  res.json(await warehouse.getCompanies());
}));

router.get("/warehouses", asyncRoute(async (_req, res) => {
  res.json(await warehouse.getWarehouses());
}));

router.post("/warehouses", asyncRoute(async (req, res) => {
  res.status(201).json(await warehouse.createWarehouse(req.body || {}));
}));

router.put("/warehouses/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator magazynu.");
  res.json(await warehouse.updateWarehouse(req.params.id, req.body || {}));
}));

router.delete("/warehouses/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator magazynu.");
  res.json(await warehouse.deleteWarehouse(req.params.id, req.session.user.id));
}));

router.get("/items", asyncRoute(async (req, res) => {
  const companyId = req.query.companyId || null;
  if (companyId) requireValidId(companyId, "Nieprawidłowy identyfikator spółki.");
  res.json(await warehouse.getItems(companyId));
}));

router.post("/items", asyncRoute(async (req, res) => {
  res.status(201).json(await warehouse.createItem(req.body || {}, req.session?.user?.id));
}));

router.get("/stock", asyncRoute(async (req, res) => {
  const { companyId = null, warehouseId = null, search = "" } = req.query;
  if (companyId) requireValidId(companyId, "Nieprawidłowy identyfikator spółki.");
  if (warehouseId) requireValidId(warehouseId, "Nieprawidłowy identyfikator magazynu.");
  if (typeof search !== "string" || search.length > 200) {
    const error = new Error("Nieprawidłowe kryterium wyszukiwania.");
    error.status = 400;
    throw error;
  }
  res.json(await warehouse.getStock({ companyId, warehouseId, search }));
}));

router.get("/movements", asyncRoute(async (req, res) => {
  const { warehouseId = null, itemId = null, stockEntryId = null, from = null, to = null } = req.query;
  if (warehouseId) requireValidId(warehouseId, "Nieprawidłowy identyfikator magazynu.");
  if (itemId) requireValidId(itemId, "Nieprawidłowy identyfikator towaru.");
  if (stockEntryId) requireValidId(stockEntryId, "Nieprawidłowy identyfikator partii.");
  res.json(await warehouse.getMovements({ warehouseId, itemId, stockEntryId, from, to }));
}));

router.get("/issues", asyncRoute(async (_req, res) => {
  res.json(await warehouse.getIssues());
}));

router.post("/issues", asyncRoute(async (req, res) => {
  res.status(201).json(await warehouse.createIssue(req.body || {}, req.session.user.id));
}));

router.post("/transfers", asyncRoute(async (req, res) => {
  res.status(201).json(await warehouse.createTransfer(req.body || {}, req.session.user.id));
}));

router.get("/issues/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator WZ.");
  const issue = await warehouse.getIssue(req.params.id);
  if (!issue) return res.status(404).json({ error: "Nie znaleziono dokumentu WZ." });
  res.json(issue);
}));

router.put("/issues/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator WZ.");
  res.json(await warehouse.updateIssue(req.params.id, req.body || {}));
}));

router.post("/issues/:id/cancel", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator WZ.");
  res.json(await warehouse.cancelIssue(req.params.id, req.session.user.id));
}));

router.put("/stock/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator pozycji.");
  res.json(await warehouse.updateStockEntry(req.params.id, req.body || {}, req.session.user.id));
}));

router.delete("/stock/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator pozycji.");
  res.json(await warehouse.deleteStockEntry(req.params.id, req.session.user.id));
}));

router.post("/adjustments", asyncRoute(async (req, res) => {
  res.status(201).json(await warehouse.createAdjustment(req.body || {}, req.session.user.id));
}));

router.post("/receive-shipment/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator przesyłki.");
  res.status(201).json(await warehouse.receiveExistingShipment(
    req.params.id,
    req.session.user.id
  ));
}));

module.exports = router;
