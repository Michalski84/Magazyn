// Moduł magazynu: publiczne API złożone z mniejszych modułów tematycznych.
const warehouses = require("./warehouses");
const items = require("./items");
const stock = require("./stock");
const issues = require("./issues");
const transfers = require("./transfers");
const adjustments = require("./adjustments");
const receiving = require("./receiving");

module.exports = {
  // Magazyny i spółki
  getCompanies: warehouses.getCompanies,
  getWarehouses: warehouses.getWarehouses,
  createWarehouse: warehouses.createWarehouse,
  updateWarehouse: warehouses.updateWarehouse,
  deleteWarehouse: warehouses.deleteWarehouse,
  // Towary i stany
  getItems: items.getItems,
  createItem: items.createItem,
  getStock: stock.getStock,
  getMovements: stock.getMovements,
  updateStockEntry: stock.updateStockEntry,
  deleteStockEntry: stock.deleteStockEntry,
  // Dokumenty wydania, MM i korekty
  createIssue: issues.createIssue,
  getIssue: issues.getIssue,
  getIssues: issues.getIssues,
  updateIssue: issues.updateIssue,
  cancelIssue: issues.cancelIssue,
  createTransfer: transfers.createTransfer,
  createAdjustment: adjustments.createAdjustment,
  // Przyjęcia przesyłek
  receiveShipment: receiving.receiveShipment,
  receiveExistingShipment: receiving.receiveExistingShipment
};
