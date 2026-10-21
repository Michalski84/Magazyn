// Przyjęcie nowej pozycji do magazynu (formularz pozycji).

// Podpina otwarcie, zmianę spółki i zapis formularza pozycji.
function initWarehouseItems() {
  byId("showItemFormButton").addEventListener("click", () => {
    byId("itemCreateForm").reset();
    const filterCompany = byId("warehouseCompanyFilter").value;
    if (filterCompany && state.companies.some(c => String(c.id) === filterCompany)) {
      byId("newItemCompany").value = filterCompany;
    }
    byId("newItemUnit").value = "szt.";
    byId("newItemQuantity").value = "1";
    showForm("itemCreateForm");
    updateNewItemWarehouseOptions();
  });
  byId("newItemCompany").addEventListener("change", updateNewItemWarehouseOptions);
  byId("itemCreateForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      const companyId = byId("newItemCompany").value;
      if (!companyId) {
        showToast("Pole spółka jest wymagane.", "error");
        byId("newItemCompany").focus();
        return;
      }
      const company = state.companies.find(c => String(c.id) === String(companyId));
      await api.createItem({
        companyId,
        companyName: company ? company.name : "",
        warehouseId: byId("newItemWarehouse").value,
        name: byId("newItemName").value,
        quantity: byId("newItemQuantity").value,
        unit: byId("newItemUnit").value,
        serialNumber: byId("newItemSerial").value,
        orderNumber: byId("newItemOrderNumber").value,
        projectNumber: byId("newItemProjectNumber").value,
        supplier: byId("newItemSupplier").value
      });
      form.reset();
      byId("newItemUnit").value = "szt.";
      byId("newItemQuantity").value = "1";
      form.hidden = true;
      await refreshWarehouseData();
      showToast("Pozycja została przyjęta do magazynu.");
    });
  });
}
