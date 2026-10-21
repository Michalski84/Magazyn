// Przesunięcia międzymagazynowe (MM): formularz i zapis dokumentu.

// Otwiera formularz MM z pozycjami zaznaczonymi w tabeli stanów (magazyn źródłowy = magazyn pozycji).
function openTransferFormWithEntries(entries) {
  showForm("transferCreateForm");
  const source = byId("transferSource");
  const target = byId("transferTarget");
  source.value = String(entries[0].warehouseId);
  if (source.value === target.value) {
    const other = state.warehouses.find(w => String(w.id) !== source.value);
    if (other) target.value = String(other.id);
  }
  updateTransferItemOptions();
  byId("transferLines").replaceChildren();
  entries.forEach(stock => addTransferLine({ stockEntryId: stock.stockEntryId, quantity: stock.quantityOnHand }));
  byId("transferCreateForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Podpina formularz przesunięcia MM.
function initWarehouseTransfers() {
  byId("showTransferFormButton").addEventListener("click", () => {
    showForm("transferCreateForm");
    const source = byId("transferSource");
    const target = byId("transferTarget");
    if (source.value === target.value) {
      const other = state.warehouses.find(w => String(w.id) !== source.value);
      if (other) target.value = String(other.id);
    }
    byId("transferLines").replaceChildren();
    addTransferLine();
  });
  byId("transferSource").addEventListener("change", () => {
    byId("transferLines").replaceChildren();
    addTransferLine();
  });
  byId("addTransferLineButton").addEventListener("click", () => addTransferLine());
  byId("transferCreateForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      const lines = Array.from(byId("transferLines").querySelectorAll(".issue-line")).map(row => ({
        stockEntryId: row.querySelector("select").value,
        quantity: row.querySelector("input").value
      }));
      const result = await api.createTransfer({
        sourceWarehouseId: byId("transferSource").value,
        targetWarehouseId: byId("transferTarget").value,
        notes: byId("transferNotes").value,
        lines
      });
      form.reset();
      byId("transferLines").replaceChildren();
      form.hidden = true;
      selectedStockIds.clear();
      await refreshWarehouseData();
      showToast(`Dokument ${result.documentNo} został zapisany.`);
    });
  });
}
