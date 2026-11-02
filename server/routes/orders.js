// Trasy zamówień (/api/orders): dostępne dla każdej roli, ale ograniczone do własnych rekordów.
const express = require("express");
const orders = require("../orders");
const { asyncRoute, requireValidId } = require("../http/middleware");

const router = express.Router();
const INVALID_ID = "Nieprawidłowy identyfikator zamówienia.";

router.get("/", asyncRoute(async (req, res) => {
  res.json(await orders.listOrders(req.session.user));
}));

router.get("/suggestions", asyncRoute(async (req, res) => {
  res.json(await orders.suggestOrders(req.query.prefix || "", req.session.user));
}));

router.post("/", asyncRoute(async (req, res) => {
  res.status(201).json(await orders.createOrder(req.body, req.session.user));
}));

router.put("/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, INVALID_ID);
  res.json(await orders.updateOrder(req.params.id, req.body, req.session.user));
}));

router.patch("/:id", asyncRoute(async (req, res) => {
  requireValidId(req.params.id, INVALID_ID);
  res.json(await orders.patchOrder(req.params.id, req.body, req.session.user));
}));

module.exports = router;
