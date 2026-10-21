// Trasy rejestru przesyłek (/api/shipments).
const express = require("express");
const shipments = require("../shipments");
const { asyncRoute, validId, requireVersion } = require("../http/middleware");

const router = express.Router();

router.get("/", asyncRoute(async (_req, res) => {
  res.json(await shipments.getShipments());
}));

router.post("/", asyncRoute(async (req, res) => {
  const shipment = await shipments.createShipment(req.body, req.session.user.id);
  res.status(201).json(shipment);
}));

router.post("/import", asyncRoute(async (req, res) => {
  res.json(await shipments.importShipments(req.body?.shipments));
}));

router.put("/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  res.json(await shipments.replaceShipment(req.params.id, req.body, req.session.user.id));
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  res.json(await shipments.patchShipment(req.params.id, req.body));
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  await shipments.deleteShipment(req.params.id, req.body?.version);
  res.status(204).end();
}));

module.exports = router;
