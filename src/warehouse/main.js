// Punkt wejścia modułu magazynu: po załadowaniu DOM podpina wszystkie obsługi zdarzeń.

// Uruchamia inicjalizację wszystkich części modułu w kolejności zgodnej z pierwotnym kodem.
document.addEventListener("DOMContentLoaded", () => {
  initWarehouseTabs();
  initWarehouseData();
  initStockFilters();
  initStockSelection();
  initWarehouses();
  initWarehouseItems();
  initWarehouseIssues();
  initIssueFilters();
  initWarehouseTransfers();
  initWarehouseFormClosing();
  initStockActions();
  initShipmentReceiving();
});
