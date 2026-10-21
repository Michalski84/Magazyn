// Magazyny: tabela magazynów, edycja nazwy oraz formularz tworzenia/zmiany magazynu.

// Renderuje tabelę magazynów.
function renderWarehouses() {
  const tbody = byId("warehousesTable").tBodies[0];
  tbody.replaceChildren();
  state.warehouses.forEach(warehouse => {
    const row = document.createElement("tr");
    [warehouse.companyName || "Wszystkie spółki", warehouse.name,
      warehouse.type === "main" ? "Magazyn główny" : "Magazyn"]
      .forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
    const actionCell = document.createElement("td");
    if (warehouse.type === "main") {
      actionCell.textContent = "Nieusuwalny";
    } else {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Zmień nazwę";
      editButton.addEventListener("click", () => editWarehouse(warehouse));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Usuń";
      deleteButton.addEventListener("click", () => run(async () => {
        if (!confirm(`Usunąć magazyn „${warehouse.name}”? Pozostały towar zostanie przeniesiony do magazynu głównego.`)) {
          return;
        }
        const result = await api.deleteWarehouse(warehouse.id);
        await refreshWarehouseData();
        showToast(`Magazyn usunięty. Przeniesiono ${result.movedEntries} partii do magazynu głównego.`);
      }));
      actionCell.append(editButton, deleteButton);
    }
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
}

// Wypełnia formularz magazynu do zmiany nazwy.
function editWarehouse(warehouse) {
  byId("warehouseEditId").value = String(warehouse.id);
  byId("newWarehouseCompany").value = String(warehouse.companyId);
  byId("newWarehouseCompany").disabled = true;
  byId("newWarehouseName").value = warehouse.name;
  byId("warehouseFormTitle").textContent = "Zmień nazwę magazynu";
  byId("saveWarehouseButton").textContent = "Zapisz nazwę";
  showForm("warehouseCreateForm");
}

// Podpina przycisk nowego magazynu i zapis formularza magazynu.
function initWarehouses() {
  byId("showWarehouseFormButton").addEventListener("click", () => {
    byId("warehouseCreateForm").reset();
    byId("warehouseEditId").value = "";
    byId("warehouseFormTitle").textContent = "Nowy magazyn";
    byId("saveWarehouseButton").textContent = "Utwórz magazyn";
    byId("newWarehouseCompany").disabled = false;
    showForm("warehouseCreateForm");
  });
  byId("warehouseCreateForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      const warehouseId = byId("warehouseEditId").value;
      const data = {
        companyId: byId("newWarehouseCompany").value,
        name: byId("newWarehouseName").value
      };
      if (warehouseId) {
        await api.updateWarehouse(warehouseId, data);
      } else {
        await api.createWarehouse(data);
      }
      form.reset();
      byId("warehouseEditId").value = "";
      byId("newWarehouseCompany").disabled = false;
      form.hidden = true;
      await refreshWarehouseData();
      showToast(warehouseId ? "Nazwa magazynu została zmieniona." : "Magazyn został utworzony.");
    });
  });
}
