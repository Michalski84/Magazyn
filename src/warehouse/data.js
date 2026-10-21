// Pobieranie danych magazynu z serwera i odświeżanie widoku.

// Pobiera wszystkie dane magazynu i odświeża kontrolki oraz tabele.
async function refreshWarehouseData() {
  if (byId("appContent").hidden) return;
  try {
    const [companies, recipients, projects, warehouses, items, stock, issues, movements] = await Promise.all([
      api.companies(),
      window.shipmentApi.catalogs.recipients(),
      window.shipmentApi.catalogs.projects(),
      api.warehouses(),
      api.items(),
      api.stock({}),
      api.issues(),
      api.movements({
        stockEntryId: byId("movementsTable").dataset.stockEntryId || ""
      })
    ]);
    Object.assign(state, { companies, recipients, projects, warehouses, items, stock, issues, movements });
    populateCompanyControls();
    populateWarehouseControls();
    populateIssueRecipients();
    populateIssueFilterRecipients();
    populateShipmentCompanyChoices();
    updateIssueItemOptions();
    renderIssueParties();
    updateTransferItemOptions();
    renderWarehouses();
    pruneStockSelection();
    renderStock();
    renderIssues();
    renderMovements();
  } catch (error) {
    showToast(`Nie udało się pobrać danych magazynu: ${error.message}`, "error");
  }
}

// Podpina odświeżanie danych (zdarzenia, przycisk, filtr spółki).
function initWarehouseData() {
  window.addEventListener("user-signed-in", refreshWarehouseData);
  window.addEventListener("catalogs-updated", refreshWarehouseData);
  byId("refreshWarehouseButton").addEventListener("click", refreshWarehouseData);
  byId("warehouseCompanyFilter").addEventListener("change", () => {
    byId("movementsTable").dataset.stockEntryId = "";
    refreshWarehouseData();
  });
}
