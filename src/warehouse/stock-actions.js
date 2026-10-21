// Akcje na stanach magazynowych: edycja wpisu i eksport do Excela.

// Wypełnia formularz edycji wpisu magazynowego.
function editStockEntry(stock) {
  byId("editStockEntryId").value = stock.stockEntryId;
  byId("editStockName").value = stock.name;
  byId("editStockQuantity").value = stock.quantityOnHand;
  byId("editStockUnit").value = stock.unit;
  byId("editStockSerial").value = stock.serialNumber || "";
  byId("editStockOrderNumber").value = stock.orderNumber || "";
  byId("editStockProjectNumber").value = stock.projectNumber || "";
  byId("editStockSupplier").value = stock.supplier || "";
  showForm("stockEditForm");
}

// Eksportuje stany magazynowe do pliku Excel.
function exportStock(source = state.stock, fileName = "stany-magazynowe.xlsx") {
  if (!window.XLSX) {
    showToast("Nie udało się załadować obsługi plików Excel.", "error");
    return;
  }
  const rows = source.map(item => [
    item.companyName, item.warehouseName, item.name, item.serialNumber || "", item.orderNumber,
    item.projectNumber, item.supplier, item.unit,
    item.quantityIn, item.quantityOut, item.quantityOnHand
  ]);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["LP", "Spółka", "Magazyn", "Nazwa towaru", "SN", "Nr zamówienia", "Nr projektu",
      "Dostawca", "Jednostka", "Przyjęte", "Wydane", "Na stanie"],
    ...rows.map((row, index) => [index + 1, ...row])
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Magazyn");
  XLSX.writeFile(workbook, fileName);
}

// Podpina zapis edycji wpisu i przyciski eksportu.
function initStockActions() {
  byId("stockEditForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      await api.updateStockEntry(byId("editStockEntryId").value, {
        name: byId("editStockName").value,
        quantity: byId("editStockQuantity").value,
        unit: byId("editStockUnit").value,
        serialNumber: byId("editStockSerial").value,
        orderNumber: byId("editStockOrderNumber").value,
        projectNumber: byId("editStockProjectNumber").value,
        supplier: byId("editStockSupplier").value
      });
      form.hidden = true;
      await refreshWarehouseData();
      showToast("Pozycja została zaktualizowana.");
    });
  });
  byId("exportStockButton").addEventListener("click", () => exportStock(state.stock, "stany-magazynowe.xlsx"));
  byId("exportStockViewButton").addEventListener("click", () => {
    exportStock(visibleStock, "widok-tabeli-magazynu.xlsx");
  });
}
