document.addEventListener("DOMContentLoaded", () => {
  const api = window.shipmentApi.warehouse;
  const byId = id => document.getElementById(id);
  const state = {
    companies: [],
    recipients: [],
    projects: [],
    warehouses: [],
    items: [],
    stock: [],
    issues: [],
    movements: [],
    editingIssueId: null
  };
  let visibleStock = [];

  const tabs = document.querySelectorAll(".module-tab");
  const companySelect = byId("nazwaSpolkiSelect");

  tabs.forEach(tab => tab.addEventListener("click", () => switchModule(tab.dataset.module)));

  function mainWarehouseId() {
    return String(state.warehouses.find(warehouse => warehouse.type === "main")?.id || "");
  }

  function switchModule(moduleId) {
    const tab = Array.from(tabs).find(item => item.dataset.module === moduleId);
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll(".app-module").forEach(module => {
      module.hidden = module.id !== moduleId;
    });
    if (moduleId === "warehouseModule") refreshWarehouseData();
    window.dispatchEvent(new CustomEvent("module-selected", { detail: moduleId }));
  }

  window.addEventListener("user-signed-in", refreshWarehouseData);
  window.addEventListener("catalogs-updated", refreshWarehouseData);
  byId("refreshWarehouseButton").addEventListener("click", refreshWarehouseData);
  byId("warehouseCompanyFilter").addEventListener("change", () => {
    byId("movementsTable").dataset.stockEntryId = "";
    refreshWarehouseData();
  });
  byId("warehouseFilter").addEventListener("change", renderStock);
  byId("stockSearch").addEventListener("input", renderStock);
  byId("stockOnlyAvailable").addEventListener("change", renderStock);
  document.querySelectorAll(".stock-column-toggle")
    .forEach(toggle => toggle.addEventListener("change", applyStockColumnVisibility));

  const columnFilters = {};
  document.querySelectorAll("#stockTable th[data-filter-key]").forEach(th => {
    const key = th.dataset.filterKey;
    const label = th.textContent.trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "column-filter-toggle";
    button.textContent = label;
    button.title = `Szukaj w kolumnie: ${label}`;
    const input = document.createElement("input");
    input.type = "search";
    input.className = "column-filter-input";
    input.placeholder = `Szukaj: ${label}`;
    input.setAttribute("aria-label", `Szukaj w kolumnie ${label}`);
    input.hidden = true;
    th.replaceChildren(button, input);
    button.addEventListener("click", () => {
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
    });
    input.addEventListener("input", () => {
      columnFilters[key] = input.value.trim().toLocaleLowerCase("pl-PL");
      button.classList.toggle("is-filtered", Boolean(columnFilters[key]));
      renderStock();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        input.value = "";
        input.dispatchEvent(new Event("input"));
        input.hidden = true;
      }
    });
  });

  byId("showWarehouseFormButton").addEventListener("click", () => {
    byId("warehouseCreateForm").reset();
    byId("warehouseEditId").value = "";
    byId("warehouseFormTitle").textContent = "Nowy magazyn";
    byId("saveWarehouseButton").textContent = "Utwórz magazyn";
    byId("newWarehouseCompany").disabled = false;
    showForm("warehouseCreateForm");
  });
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
  byId("showIssueFormButton").addEventListener("click", () => {
    setIssueFormMode(null);
    showForm("issueCreateForm");
    byId("issueDate").value ||= today();
    updateIssueItemOptions();
    if (!byId("issueLines").children.length) addIssueLine();
  });
  byId("newItemCompany").addEventListener("change", updateNewItemWarehouseOptions);
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
  byId("addTransferLineButton").addEventListener("click", addTransferLine);
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
      await refreshWarehouseData();
      showToast(`Dokument ${result.documentNo} został zapisany.`);
    });
  });
  byId("issueWarehouse").addEventListener("change", updateIssueItemOptions);
  byId("issueWarehouse").addEventListener("change", renderIssueParties);
  byId("issueRecipient").addEventListener("change", renderIssueParties);
  byId("issueLines").addEventListener("change", renderIssueParties);
  byId("issueDeliveryMethod").addEventListener("change", updateIssueDeliveryFields);
  byId("issueLines").addEventListener("change", updateIssueProject);
  byId("issueWarehouse").addEventListener("change", updateIssueProject);
  byId("issueProjectNumber").addEventListener("input", event => {
    event.target.dataset.manual = event.target.value ? "1" : "";
  });
  document.querySelectorAll("[data-close-warehouse-form]").forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      form.hidden = true;
      if (form.id === "issueCreateForm") setIssueFormMode(null);
      if (form.id === "warehouseCreateForm") byId("newWarehouseCompany").disabled = false;
    });
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

  byId("addIssueLineButton").addEventListener("click", addIssueLine);
  byId("issueCreateForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      if (state.editingIssueId) {
        const issue = await api.updateIssue(state.editingIssueId, {
          issueDate: byId("issueDate").value,
          recipientId: byId("issueRecipient").value,
          projectNumber: byId("issueProjectNumber").value,
          deliveryMethod: byId("issueDeliveryMethod").value,
          deliveryTrackingNumber: byId("issueTrackingNumber").value,
          receivingPerson: byId("issueReceivingPerson").value
        });
        setIssueFormMode(null);
        form.hidden = true;
        await refreshWarehouseData();
        showToast(`Zapisano zmiany w dokumencie ${issue.documentNo}.`);
        return;
      }
      const lines = Array.from(byId("issueLines").querySelectorAll(".issue-line")).map(row => ({
        stockEntryId: row.querySelector("select").value,
        quantity: row.querySelector("input[type=number]").value,
        serialNumber: row.querySelector(".issue-line-serial").value
      }));
      const issue = await api.createIssue({
        warehouseId: byId("issueWarehouse").value,
        issueDate: byId("issueDate").value,
        recipientId: byId("issueRecipient").value,
        projectNumber: byId("issueProjectNumber").value,
        deliveryMethod: byId("issueDeliveryMethod").value,
        deliveryTrackingNumber: byId("issueTrackingNumber").value,
        receivingPerson: byId("issueReceivingPerson").value,
        issuedTo: byId("issueRecipient").selectedOptions[0]?.textContent || "",
        lines
      });
      form.reset();
      byId("issueLines").innerHTML = "";
      byId("issueProjectNumber").dataset.manual = "";
      updateIssueDeliveryFields();
      form.hidden = true;
      await refreshWarehouseData();
      showToast(`Wydano towar dokumentem ${issue.documentNo}.`);
      printIssue(issue);
    });
  });

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

  byId("exportStockButton").addEventListener("click", () => exportStock(state.stock, "stany-magazynowe.xlsx"));
  byId("exportStockViewButton").addEventListener("click", () => {
    exportStock(visibleStock, "widok-tabeli-magazynu.xlsx");
  });
  byId("shipmentReceiveForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    run(async () => {
      await api.receiveShipment(byId("receivingShipmentId").value);
      form.reset();
      form.hidden = true;
      await refreshWarehouseData();
      window.dispatchEvent(new Event("shipment-inventory-received"));
      showToast("Pozycje ze starszej przesyłki przyjęto na magazyn główny.");
    });
  });

  window.openShipmentReceiving = shipment => {
    const form = byId("shipmentReceiveForm");
    document.querySelectorAll(".warehouse-form").forEach(item => item.hidden = item !== form);
    byId("receivingShipmentId").value = shipment.id;
    byId("receivingShipmentNumber").value = shipment.numerId || shipment.numerListu;
    switchModule("warehouseModule");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function showForm(id) {
    document.querySelectorAll(".warehouse-form").forEach(form => {
      form.hidden = form.id !== id;
    });
    byId(id).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

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
      populateShipmentCompanyChoices();
      updateIssueItemOptions();
      renderIssueParties();
      updateTransferItemOptions();
      renderWarehouses();
      renderStock();
      renderIssues();
      renderMovements();
    } catch (error) {
      showToast(`Nie udało się pobrać danych magazynu: ${error.message}`, "error");
    }
  }

  function populateCompanyControls() {
    const selectedFilterCompany = byId("warehouseCompanyFilter").value;
    const selectedItemCompany = byId("newItemCompany").value;
    const selectedWarehouseCompany = byId("newWarehouseCompany").value;
    const filter = byId("warehouseCompanyFilter");
    filter.replaceChildren(new Option("Wszystkie spółki", ""));
    state.companies.filter(company => company.active).forEach(company => {
      filter.add(new Option(company.name, String(company.id)));
    });
    filter.value = state.companies.some(company => String(company.id) === selectedFilterCompany)
      ? selectedFilterCompany
      : "";

    const itemCompany = byId("newItemCompany");
    itemCompany.replaceChildren(new Option("Wybierz spółkę", ""));
    state.companies.filter(company => company.active).forEach(company => {
      itemCompany.add(new Option(company.name, String(company.id)));
    });
    itemCompany.value = state.companies.some(company => String(company.id) === selectedItemCompany)
      ? selectedItemCompany
      : "";

    const warehouseCompany = byId("newWarehouseCompany");
    warehouseCompany.replaceChildren(new Option("Wybierz spółkę", ""));
    state.companies.filter(company => company.active).forEach(company => {
      warehouseCompany.add(new Option(company.name, String(company.id)));
    });
    warehouseCompany.value = state.companies.some(company =>
      String(company.id) === selectedWarehouseCompany
    ) ? selectedWarehouseCompany : "";

    updateNewItemWarehouseOptions();
  }

  function updateNewItemWarehouseOptions() {
    const companyId = byId("newItemCompany").value;
    const select = byId("newItemWarehouse");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    if (!companyId) {
      select.add(new Option("Najpierw wybierz spółkę", ""));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    const available = state.warehouses.filter(warehouse =>
      warehouse.active && (warehouse.type === "main" || String(warehouse.companyId) === String(companyId))
    );
    if (!available.length) {
      select.add(new Option("Brak dostępnych magazynów", ""));
      select.disabled = true;
      return;
    }
    available.forEach(warehouse => {
      const label = warehouse.type === "main"
        ? `${warehouse.name} (główny)`
        : warehouse.name;
      select.add(new Option(label, String(warehouse.id)));
    });
    const hasPrevious = available.some(w => String(w.id) === previous);
    select.value = hasPrevious
      ? previous
      : String(available.find(w => w.type === "main")?.id ?? available[0].id);
  }

  function populateWarehouseControls() {
    const mainId = mainWarehouseId();
    for (const [selectId, includeAll] of [
      ["warehouseFilter", true],
      ["issueWarehouse", false],
      ["transferSource", false],
      ["transferTarget", false]
    ]) {
      const select = byId(selectId);
      const previous = select.value;
      select.replaceChildren();
      if (includeAll) select.add(new Option("Wszystkie magazyny", ""));
      state.warehouses.forEach(warehouse => {
        const label = `${warehouse.name}${warehouse.companyName ? ` — ${warehouse.companyName}` : ""}`;
        select.add(new Option(label, String(warehouse.id)));
      });
      const selectionExists = state.warehouses.some(warehouse => String(warehouse.id) === previous);
      select.value = selectionExists ? previous : includeAll ? "" : mainId;
    }
    updateNewItemWarehouseOptions();
  }

  function populateIssueRecipients() {
    const select = byId("issueRecipient");
    const previous = select.value;
    select.replaceChildren(new Option("Wybierz odbiorcę", ""));
    state.recipients.forEach(recipient => select.add(new Option(recipient.name, String(recipient.id))));
    select.value = state.recipients.some(recipient => String(recipient.id) === previous) ? previous : "";
  }

  function renderIssueParties() {
    const warehouse = state.warehouses.find(item => String(item.id) === byId("issueWarehouse").value);
    const selectedEntry = Array.from(byId("issueLines").querySelectorAll("select"))
      .map(select => state.stock.find(item => String(item.stockEntryId) === select.value))
      .find(Boolean);
    const companyId = selectedEntry?.companyId || warehouse?.companyId;
    const company = state.companies.find(item => String(item.id) === String(companyId));
    const recipient = state.recipients.find(item => String(item.id) === byId("issueRecipient").value);
    const address = party => [
      [party.street, party.buildingNumber].filter(Boolean).join(" "),
      [party.postalCode, party.city].filter(Boolean).join(" ")
    ].filter(Boolean).join("\n");
    const sellerDetails = byId("issueSellerDetails");
    const recipientDetails = byId("issueRecipientDetails");
    sellerDetails.textContent = company
      ? `Sprzedawca: ${company.name}${address(company) ? `\n${address(company)}` : ""}${company.nip ? `\nNIP: ${company.nip}` : ""}`
      : "Sprzedawca: uzupełnij dane spółki w kartotece Spółki.";
    recipientDetails.textContent = recipient
      ? [
        "Odbiorca:",
        recipient.name,
        address(recipient),
        recipient.address2,
        recipient.contactPerson ? `Kontakt: ${recipient.contactPerson}` : "",
        recipient.phone ? `Tel. ${recipient.phone}` : ""
      ].filter(Boolean).join("\n")
      : "Wybierz odbiorcę z kartoteki Odbiorcy.";
  }

  function updateIssueProject() {
    const field = byId("issueProjectNumber");
    if (state.editingIssueId || field.dataset.manual) return;
    const projects = Array.from(byId("issueLines").querySelectorAll(".issue-line select"))
      .map(select => state.stock.find(item => String(item.stockEntryId) === select.value)?.projectNumber)
      .filter(Boolean);
    field.value = [...new Set(projects)].join(", ");
  }

  function setIssueFormMode(issue) {
    const wasEditing = Boolean(state.editingIssueId);
    const editing = Boolean(issue);
    state.editingIssueId = issue ? issue.id : null;
    byId("issueFormTitle").textContent = editing
      ? `Edycja dokumentu ${issue.documentNo}`
      : "Dokument WZ — wydanie towaru";
    byId("issueSubmitButton").textContent = editing ? "Zapisz zmiany" : "Zatwierdź WZ i wydaj towar";
    byId("issueLines").hidden = editing;
    byId("addIssueLineButton").hidden = editing;
    byId("issueCreateNote").hidden = editing;
    byId("issueEditNote").hidden = !editing;
    byId("issueWarehouse").disabled = editing;
    if (wasEditing || editing) {
      byId("issueCreateForm").reset();
      byId("issueLines").replaceChildren();
      byId("issueProjectNumber").dataset.manual = "";
    }
    if (!editing) updateIssueDeliveryFields();
  }

  function editIssue(issue) {
    setIssueFormMode(issue);
    showForm("issueCreateForm");
    byId("issueWarehouse").value = String(issue.warehouseId);
    byId("issueDate").value = issue.issueDate;
    byId("issueRecipient").value = issue.recipientId ? String(issue.recipientId) : "";
    byId("issueProjectNumber").value = issue.projectNumber || "";
    byId("issueDeliveryMethod").value = issue.deliveryMethod || "";
    updateIssueDeliveryFields();
    byId("issueTrackingNumber").value = issue.deliveryTrackingNumber || "";
    byId("issueReceivingPerson").value = issue.receivingPerson || "";
    renderIssueParties();
    byId("issueCreateForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateIssueDeliveryFields() {
    const method = byId("issueDeliveryMethod").value;
    const trackingField = byId("issueTrackingNumberField");
    const receivingField = byId("issueReceivingPersonField");
    const trackingInput = byId("issueTrackingNumber");
    const receivingInput = byId("issueReceivingPerson");
    trackingField.hidden = method !== "courier";
    receivingField.hidden = method !== "personal_pickup";
    trackingInput.required = method === "courier";
    receivingInput.required = method === "personal_pickup";
    if (method !== "courier") trackingInput.value = "";
    if (method !== "personal_pickup") receivingInput.value = "";
  }

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

  function editWarehouse(warehouse) {
    byId("warehouseEditId").value = String(warehouse.id);
    byId("newWarehouseCompany").value = String(warehouse.companyId);
    byId("newWarehouseCompany").disabled = true;
    byId("newWarehouseName").value = warehouse.name;
    byId("warehouseFormTitle").textContent = "Zmień nazwę magazynu";
    byId("saveWarehouseButton").textContent = "Zapisz nazwę";
    showForm("warehouseCreateForm");
  }

  function populateShipmentCompanyChoices() {
    const known = new Set(Array.from(companySelect.options).map(option => option.value));
    const fallback = Array.from(companySelect.options).find(option => option.value === "inna");
    state.companies.filter(company => company.active).forEach(company => {
      if (known.has(company.name)) return;
      const option = new Option(company.name, company.name);
      companySelect.insertBefore(option, fallback || null);
      known.add(company.name);
    });
  }

  function selectedCompanyName(companyId) {
    return state.companies.find(company => String(company.id) === String(companyId))?.name || "";
  }

  function setStockEntryOptions(select, warehouseSelectId = "issueWarehouse") {
    const previous = select.value;
    const entries = state.stock.filter(stock =>
      Number(stock.quantityOnHand) > 0 &&
      String(stock.warehouseId) === byId(warehouseSelectId).value
    );
    select.replaceChildren(new Option("Wybierz partię towaru", ""));
    entries.forEach(stock => {
      const order = stock.orderNumber ? `zamówienie ${stock.orderNumber}` : "bez numeru zamówienia";
      const supplier = stock.supplier ? `, dostawca ${stock.supplier}` : "";
      const sn = stock.serialNumber ? `, SN: ${stock.serialNumber}` : "";
      select.add(new Option(
        `${stock.companyName} — ${stock.name}${sn} — ${order}${supplier} — stan: ${stock.quantityOnHand} ${stock.unit}`,
        String(stock.stockEntryId)
      ));
    });
    select.value = entries.some(stock => String(stock.stockEntryId) === previous) ? previous : "";
  }

  function updateIssueItemOptions() {
    byId("issueLines").querySelectorAll(".issue-line select")
      .forEach(select => setStockEntryOptions(select));
  }

  function updateTransferItemOptions() {
    byId("transferLines").querySelectorAll(".issue-line select")
      .forEach(select => setStockEntryOptions(select, "transferSource"));
  }

  function addIssueLine() {
    addQuantityLine("issueLines", "issue-line", "Ilość do wydania", undefined, true);
  }

  function addTransferLine() {
    addQuantityLine("transferLines", "issue-line", "Ilość do przesunięcia", "transferSource");
  }

  function addQuantityLine(containerId, className, quantityLabel, warehouseSelectId, withSerial = false) {
    const row = document.createElement("div");
    row.className = withSerial ? `${className} issue-line--serial` : className;
    const select = document.createElement("select");
    select.required = true;
    setStockEntryOptions(select, warehouseSelectId);
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "1";
    quantity.step = "1";
    quantity.value = "1";
    quantity.required = true;
    quantity.setAttribute("aria-label", quantityLabel);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Usuń";
    remove.addEventListener("click", () => {
      row.remove();
      updateIssueProject();
    });
    row.append(select, quantity);
    if (withSerial) {
      const serial = document.createElement("input");
      serial.type = "text";
      serial.maxLength = 2000;
      serial.className = "issue-line-serial";
      serial.placeholder = "SN";
      serial.setAttribute("aria-label", "Numer seryjny (SN)");
      const fillSerial = () => {
        serial.value = state.stock.find(item => String(item.stockEntryId) === select.value)?.serialNumber || "";
      };
      select.addEventListener("change", fillSerial);
      fillSerial();
      row.appendChild(serial);
    }
    row.appendChild(remove);
    byId(containerId).appendChild(row);
  }

  function renderStock() {
    updateStockTitle();
    const search = byId("stockSearch").value.trim().toLocaleLowerCase("pl-PL");
    const companyId = byId("warehouseCompanyFilter").value;
    const warehouseId = byId("warehouseFilter").value;
    const rows = state.stock.filter(row =>
      (!companyId || String(row.companyId) === companyId) &&
      (!warehouseId || String(row.warehouseId) === warehouseId) &&
      (!byId("stockOnlyAvailable").checked || row.quantityOnHand > 0) &&
      (!search || `${row.name} ${row.code || ""} ${row.serialNumber || ""} ${row.orderNumber || ""} ${row.projectNumber || ""} ${row.supplier || ""}`
        .toLocaleLowerCase("pl-PL").includes(search)) &&
      Object.entries(columnFilters).every(([key, value]) =>
        !value || String(row[key] ?? "").toLocaleLowerCase("pl-PL").includes(value))
    );
    visibleStock = rows;
    const tbody = byId("stockTable").tBodies[0];
    tbody.replaceChildren();
    rows.forEach(stock => {
      const row = document.createElement("tr");
      if (stock.lowStock && stock.minimumStock > 0) row.classList.add("low-stock-row");
      [
        ["lp", tbody.rows.length + 1], ["warehouseName", stock.warehouseName], ["name", stock.name],
        ["serialNumber", stock.serialNumber || ""], ["orderNumber", stock.orderNumber],
        ["projectNumber", stock.projectNumber], ["supplier", stock.supplier], ["unit", stock.unit],
        ["quantityIn", stock.quantityIn], ["quantityOut", stock.quantityOut],
        ["quantityOnHand", stock.quantityOnHand]
      ].forEach(([columnKey, value]) => {
        const cell = document.createElement("td");
        cell.dataset.columnKey = columnKey;
        cell.textContent = value ?? "";
        if (columnKey === "quantityOut") {
          cell.textContent = "";
          if (!stock.issues?.length) cell.textContent = value ?? "";
          stock.issues?.forEach((issue, index) => {
            if (index) cell.append(document.createElement("br"));
            cell.append(`${issue.quantity} `);
            const link = document.createElement("button");
            link.type = "button";
            link.className = "issue-link-button";
            link.textContent = issue.documentNo;
            link.title = "Drukuj WZ";
            link.addEventListener("click", () =>
              run(async () => printIssue(await api.issue(issue.issueId))));
            cell.append(link);
          });
        }
        if (columnKey === "projectNumber") {
          const projectName = projectShortNames(value);
          if (projectName) cell.title = projectName;
        }
        row.appendChild(cell);
      });
      const actionCell = document.createElement("td");
      actionCell.dataset.columnKey = "actions";
      const historyButton = document.createElement("button");
      historyButton.type = "button";
      historyButton.textContent = "🕘";
      historyButton.title = "Historia";
      historyButton.setAttribute("aria-label", "Historia");
      historyButton.className = "row-action-button";
      historyButton.addEventListener("click", () => run(() => loadItemMovements(stock)));
      actionCell.appendChild(historyButton);
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "✏️";
      editButton.title = "Edytuj";
      editButton.setAttribute("aria-label", "Edytuj");
      editButton.className = "row-action-button";
      editButton.addEventListener("click", () => editStockEntry(stock));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "🗑️";
      deleteButton.title = "Usuń";
      deleteButton.setAttribute("aria-label", "Usuń");
      deleteButton.className = "row-action-button";
      deleteButton.addEventListener("click", () => {
        if (!confirm(`Usunąć pozycję "${stock.name}" z magazynu?`)) return;
        run(async () => {
          await api.deleteStockEntry(stock.stockEntryId);
          await refreshWarehouseData();
          showToast("Pozycja została usunięta.");
        });
      });
      actionCell.append(editButton, deleteButton);
      actionCell.classList.add("row-actions");
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });
    applyStockColumnVisibility();
  }

  function applyStockColumnVisibility() {
    document.querySelectorAll(".stock-column-toggle").forEach(toggle => {
      document.querySelectorAll(`#stockTable [data-column-key="${toggle.dataset.columnKey}"]`)
        .forEach(cell => {
          cell.hidden = !toggle.checked;
        });
    });
  }

  function projectShortNames(projectNumber) {
    const names = String(projectNumber ?? "").split(/[,;]/)
      .map(part => part.trim().toLocaleLowerCase("pl-PL"))
      .filter(Boolean)
      .map(number => state.projects.find(project =>
        String(project.projectNumber).trim().toLocaleLowerCase("pl-PL") === number)?.shortName)
      .filter(Boolean);
    return [...new Set(names)].join("; ");
  }

  function updateStockTitle() {
    const company = state.companies.find(item =>
      String(item.id) === byId("warehouseCompanyFilter").value
    );
    const warehouse = state.warehouses.find(item =>
      String(item.id) === byId("warehouseFilter").value
    );
    byId("stockTableTitle").textContent =
      `Stan magazynowy: ${company?.name || "Wszystkie spółki"} - ${warehouse?.name || "Wszystkie magazyny"}`;
  }

  function renderIssues() {
    const tbody = byId("issuesTable").tBodies[0];
    tbody.replaceChildren();
    state.issues.forEach(issue => {
      const row = document.createElement("tr");
      [issue.documentNo, displayIssueDate(issue.issueDate), issue.companyName, issue.warehouseName, issue.issuedTo, issue.lineCount,
        issue.status === "issued" ? "Wydano" : "Anulowano"]
        .forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value ?? "";
          row.appendChild(cell);
        });
      const actions = document.createElement("td");
      const print = document.createElement("button");
      print.type = "button";
      print.textContent = "Drukuj";
      print.addEventListener("click", () => run(async () => printIssue(await api.issue(issue.id))));
      actions.appendChild(print);
      if (issue.status === "issued") {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edytuj";
        edit.addEventListener("click", () => run(async () => editIssue(await api.issue(issue.id))));
        actions.appendChild(edit);
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Anuluj";
        cancel.addEventListener("click", () => run(async () => {
          if (!confirm(`Anulować ${issue.documentNo}? Stan zostanie przywrócony ruchem korygującym.`)) return;
          await api.cancelIssue(issue.id);
          await refreshWarehouseData();
          showToast(`Dokument ${issue.documentNo} anulowano.`);
        }));
        actions.appendChild(cancel);
      }
      row.appendChild(actions);
      tbody.appendChild(row);
    });
  }

  function displayIssueDate(value) {
    const date = String(value ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value ?? "";
    const [year, month, day] = date.split("-");
    return `${day}.${month}.${year}`;
  }

  function renderMovements() {
    const tbody = byId("movementsTable").tBodies[0];
    tbody.replaceChildren();
    state.movements.forEach(movement => {
      const row = document.createElement("tr");
      [
        new Date(movement.createdAt).toLocaleString("pl-PL"),
        movement.companyName, movement.warehouseName, movement.itemName, movementTypeLabel(movement.type),
        movement.orderNumber, movement.quantity,
        [movement.reference, documentTypeLabel(movement.documentType)].filter(Boolean).join(" — "),
        movement.createdBy || "", movement.notes
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value ?? "";
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
  }

  function movementTypeLabel(type) {
    return {
      IN: "Przyjęcie",
      OUT: "Wydanie",
      ADJUSTMENT: "Korekta",
      TRANSFER: "Przesunięcie",
      RETURN: "Zwrot"
    }[type] || type;
  }

  function documentTypeLabel(type) {
    return {
      receipt: "przyjęcie",
      wz: "WZ",
      adjustment: "korekta",
      transfer: "MM",
      opening: "stan początkowy"
    }[type] || type;
  }

  async function loadItemMovements(stock) {
    byId("movementsTable").dataset.stockEntryId = String(stock.stockEntryId);
    state.movements = await api.movements({ stockEntryId: stock.stockEntryId });
    renderMovements();
    byId("movementsDetails").open = true;
    byId("movementsTable").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function printIssue(issue) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Przeglądarka zablokowała okno wydruku dokumentu WZ.", "error");
      return;
    }
    const lines = issue.lines.map((line, index) => `
      <tr><td>${index + 1}</td><td>${escapeHTML(line.name)}</td>
      <td>${escapeHTML(line.quantity)}</td><td>${escapeHTML(line.unit)}</td>
      <td>${escapeHTML(line.serialNumber || "—")}</td></tr>
    `).join("");
    const formatAddress = address => escapeHTML(address)
      .replace(/\r?\n/g, "<br>")
      .replace(/,\s*/g, "<br>");
    const sellerLines = [
      escapeHTML(issue.sellerName || issue.companyName),
      formatAddress(issue.sellerAddress),
      issue.sellerNip ? `NIP: ${escapeHTML(issue.sellerNip)}` : ""
    ].filter(Boolean).join("<br>");
    const recipientLines = [
      escapeHTML(issue.issuedTo),
      formatAddress(issue.recipientAddress),
      escapeHTML(issue.recipientAddress2),
      issue.recipientContact ? `Osoba kontaktowa: ${escapeHTML(issue.recipientContact)}` : "",
      issue.recipientPhone ? `Tel.: ${escapeHTML(issue.recipientPhone)}` : ""
    ].filter(Boolean).join("<br>");
    const deliveryLabels = {
      courier: "Kurier",
      personal_pickup: "Odbiór osobisty",
      own_transport: "Transport własny",
      dedicated_transport: "Transport dedykowany"
    };
    const deliveryDetails = [
      `<strong>Sposób dostawy:</strong> ${escapeHTML(deliveryLabels[issue.deliveryMethod] || issue.deliveryMethod || "—")}`,
      issue.deliveryMethod === "courier" && issue.deliveryTrackingNumber
        ? `Numer listu przewozowego: ${escapeHTML(issue.deliveryTrackingNumber)}` : "",
      issue.deliveryMethod === "personal_pickup" && issue.receivingPerson
        ? `Nazwisko osoby odbierającej: ${escapeHTML(issue.receivingPerson)}` : ""
    ].filter(Boolean).join("<br>");
    const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(issue.issueDate)
      ? new Date(`${issue.issueDate}T00:00:00`).toLocaleDateString("pl-PL")
      : issue.issueDate;
    printWindow.document.write(`<!doctype html><html lang="pl"><meta charset="utf-8">
      <title>${escapeHTML(issue.documentNo)}</title>
      <style>
        body{font:14px Arial,sans-serif;margin:32px}
        .parties{display:flex;gap:32px;margin:24px 0}
        .party{flex:1;border:1px solid #888;padding:12px;line-height:1.5}
        .party h2{margin:0 0 8px;font-size:13px;text-transform:uppercase;color:#555}
        .document-details{display:flex;gap:32px;margin:18px 0}
        .document-details>div{flex:1}
        table.lines{border-collapse:collapse;width:100%}
        table.lines th,table.lines td{border:1px solid #888;padding:7px;text-align:left}
        .signatures{margin-top:90px;width:100%;table-layout:fixed;text-align:center}
        .signatures td{width:50%;vertical-align:top}
        .signature-line{display:block;width:80%;height:1em;margin:0 auto 4px;border-bottom:1px dotted #000}
      </style>
      <body>
      <h1 style="text-align:center">Wydanie zewnętrzne ${escapeHTML(issue.documentNo)}</h1>
      <p style="text-align:center">Data: <strong>${escapeHTML(issueDate)}</strong> &nbsp;|&nbsp;
      Magazyn: <strong>${escapeHTML(issue.warehouseName)}</strong>
      ${issue.status === "cancelled" ? "&nbsp;|&nbsp; <strong>ANULOWANO</strong>" : ""}</p>
      <div class="parties">
        <div class="party"><h2>Sprzedawca</h2>${sellerLines}</div>
        <div class="party"><h2>Odbiorca</h2>${recipientLines}</div>
      </div>
      <div class="document-details">
        <div><strong>Projekt:</strong> ${escapeHTML(issue.projectNumber || "—")}</div>
        <div>${deliveryDetails}</div>
      </div>
      <table class="lines">
      <thead><tr><th>Lp.</th><th>Nazwa towaru</th><th>Ilość</th><th>Jednostka</th><th>SN</th></tr></thead>
      <tbody>${lines}</tbody></table>
      <table class="signatures"><tr>
      <td><span class="signature-line"></span>Wydał</td>
      <td><span class="signature-line"></span>Odebrał<br><br>
      <span class="signature-line"></span>Data odbioru</td>
      </tr></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  function escapeHTML(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, character => entities[character]);
  }

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
});
