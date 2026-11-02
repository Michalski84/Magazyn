// Moduł zamówień: formularz, wyszukiwanie, tabela ze statusem, notatkami, edycją i flagą.
document.addEventListener("DOMContentLoaded", () => {
  const api = window.shipmentApi.orders;
  const statusLabels = {
    zlozone: "Złożone",
    potwierdzone: "Potwierdzone",
    zrealizowane: "Zrealizowane",
    anulowane: "Anulowane"
  };
  const form = document.getElementById("orderForm");
  const formTitle = document.getElementById("orderFormTitle");
  const submitButton = document.getElementById("orderSubmitButton");
  const cancelButton = document.getElementById("orderCancelButton");
  const searchInput = document.getElementById("orderSearchInput");
  const statusFilter = document.getElementById("orderStatusFilter");
  const flaggedFilter = document.getElementById("orderFlaggedFilter");
  const fieldFilters = {
    orderNumber: document.getElementById("orderNumberFilter"),
    supplier: document.getElementById("orderSupplierFilter"),
    project: document.getElementById("orderProjectFilter"),
    item: document.getElementById("orderItemFilter"),
    eod: document.getElementById("orderEodFilter")
  };
  const dateFromFilter = document.getElementById("orderDateFromFilter");
  const dateToFilter = document.getElementById("orderDateToFilter");
  const tbody = document.querySelector("#ordersTable tbody");
  const scopeInfo = document.getElementById("ordersScopeInfo");
  const currencySelect = form.elements.currency;
  const exchangeRateField = document.getElementById("orderExchangeRateField");
  const orderCompanyNames = new Set([
    "Maxto Technology",
    "Maxto ITS",
    "Maxto Technology Energy",
    "SES",
    "Maxto Consulting"
  ]);
  const notesModal = document.getElementById("orderNotesModal");
  const notesTextarea = document.getElementById("orderNotesTextarea");
  let orders = [];
  let projects = [];
  let notesOrderId = null;
  let activeCompany = "";
  const companyTabs = document.getElementById("orderCompanyTabs");

  [["", "Wszystkie"], ...[...orderCompanyNames].map(name => [name, name])].forEach(([value, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "order-company-tab";
    tab.dataset.company = value;
    tab.textContent = label;
    tab.addEventListener("click", () => {
      activeCompany = value;
      render();
    });
    companyTabs.appendChild(tab);
  });

  const today = () => new Date().toLocaleDateString("sv-SE");
  const itemsFields = document.getElementById("orderItemsFields");

  function orderItemsOf(order) {
    return Array.isArray(order.items) && order.items.length
      ? order.items
      : [{ name: order.itemName, quantity: order.quantity ?? 0, unit: "szt." }];
  }

  function addItemRow(name = "", quantity = "", unit = "szt.") {
    const tr = document.createElement("tr");
    const cell = () => tr.appendChild(document.createElement("td"));
    const nameInput = document.createElement("input");
    nameInput.name = "itemName";
    nameInput.placeholder = "Nazwa";
    nameInput.maxLength = 500;
    nameInput.required = true;
    nameInput.value = name;
    cell().appendChild(nameInput);

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.name = "itemQuantity";
    quantityInput.placeholder = "Ilość";
    quantityInput.min = "0";
    quantityInput.step = "1";
    quantityInput.required = true;
    quantityInput.value = quantity;
    cell().appendChild(quantityInput);

    const unitSelect = document.createElement("select");
    unitSelect.name = "itemUnit";
    ["szt.", "opk.", "mb", "km", "kpl."].forEach(value => unitSelect.add(new Option(value, value, false, value === unit)));
    cell().appendChild(unitSelect);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-item-button";
    removeButton.textContent = "X";
    removeButton.title = "Usuń towar";
    removeButton.setAttribute("aria-label", "Usuń towar");
    removeButton.addEventListener("click", () => {
      if (itemsFields.rows.length > 1) tr.remove();
    });
    cell().appendChild(removeButton);
    itemsFields.appendChild(tr);
  }

  function collectItems() {
    return [...itemsFields.rows].map(row => ({
      name: row.querySelector('[name="itemName"]').value,
      quantity: row.querySelector('[name="itemQuantity"]').value,
      unit: row.querySelector('[name="itemUnit"]').value
    }));
  }

  function setItems(items) {
    itemsFields.replaceChildren();
    (items.length ? items : [{}]).forEach(item => addItemRow(item.name ?? "", item.quantity ?? "", item.unit || "szt."));
  }

  function updateExchangeRateField() {
    const required = currencySelect.value !== "PLN";
    exchangeRateField.hidden = !required;
    form.elements.exchangeRate.required = required;
  }

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    form.elements.orderDate.value = today();
    setItems([]);
    currencySelect.value = "PLN";
    updateExchangeRateField();
    formTitle.textContent = "Nowe zamówienie";
    submitButton.textContent = "Dodaj zamówienie";
    cancelButton.hidden = true;
  }

  function startEdit(order) {
    form.reset();
    form.elements.id.value = order.id;
    ["orderNumber", "eodSalesforceNumber", "orderDate", "supplier",
      "projectNumber",
      "orderValue", "currency", "exchangeRate", "deliveryAddress"].forEach(field => {
      form.elements[field].value = order[field] ?? "";
    });
    setItems(orderItemsOf(order));
    updateExchangeRateField();
    form.elements.companyId.value = order.companyId ?? "";
    formTitle.textContent = `Edycja zamówienia ${order.orderNumber}`;
    submitButton.textContent = "Zapisz zmiany";
    cancelButton.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.orderNumber.focus();
  }

  function matchesFilters(order) {
    if (activeCompany && order.companyName !== activeCompany) return false;
    if (statusFilter.value && order.status !== statusFilter.value) return false;
    if (flaggedFilter.checked && !order.flagged) return false;
    if (dateFromFilter.value && order.orderDate < dateFromFilter.value) return false;
    if (dateToFilter.value && order.orderDate > dateToFilter.value) return false;
    const includes = (value, filter) =>
      String(value ?? "").toLowerCase().includes(filter.value.trim().toLowerCase());
    const itemsText = orderItemsOf(order).map(item => item.name).join(" ");
    if (!includes(order.orderNumber, fieldFilters.orderNumber) ||
        !includes(order.supplier, fieldFilters.supplier) ||
        !includes(order.projectNumber, fieldFilters.project) ||
        !includes(itemsText, fieldFilters.item) ||
        !includes(order.eodSalesforceNumber, fieldFilters.eod)) return false;
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return true;
    return [order.orderNumber, order.eodSalesforceNumber, order.orderDate, order.supplier,
      order.companyName, order.itemName, itemsText, order.projectNumber, order.currency, order.orderValue,
      order.deliveryAddress, statusLabels[order.status], order.notes, order.createdBy]
      .some(value => String(value ?? "").toLowerCase().includes(query));
  }

  function formatAmount(value) {
    if (value === undefined || value === null || value === "") return "—";
    const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(amount)) return "—";
    return amount.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatExchangeRate(order) {
    if (order.exchangeRate === undefined || order.exchangeRate === null || order.exchangeRate === "") return "—";
    const value = typeof order.exchangeRate === "number"
      ? order.exchangeRate
      : Number(String(order.exchangeRate ?? "").replace(",", "."));
    if (!Number.isFinite(value)) return "—";
    const rate = value.toLocaleString("pl-PL", { maximumFractionDigits: 6 });
    return `${rate} PLN/${order.currency}`;
  }

  function formatOrderValue(order) {
    const currency = order.currency || "PLN";
    const amount = order.orderValue ?? order.order_value;
    if (currency === "PLN") return `${formatAmount(amount)} zł`;
    const rate = typeof order.exchangeRate === "number"
      ? order.exchangeRate
      : Number(String(order.exchangeRate ?? "").replace(",", "."));
    const convertedAmount = order.orderValuePln ?? (Number.isFinite(rate) ? Math.round(Number(amount) * rate * 100) / 100 : null);
    return `${formatAmount(amount)} ${currency} / ${formatAmount(convertedAmount)} zł (kurs ${formatExchangeRate({ ...order, currency })})`;
  }

  function projectShortNames(projectNumber) {
    return [...new Set(String(projectNumber ?? "").split(/[,;]/)
      .map(number => number.trim().toLocaleLowerCase("pl-PL"))
      .filter(Boolean)
      .map(number => projects.find(project =>
        String(project.projectNumber).trim().toLocaleLowerCase("pl-PL") === number)?.shortName)
      .filter(Boolean))].join("; ");
  }

  function actionButton(icon, title, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = icon;
    button.title = title;
    button.setAttribute("aria-label", title);
    if (className) button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  function render() {
    tbody.replaceChildren();
    companyTabs.querySelectorAll(".order-company-tab").forEach(tab => {
      const active = tab.dataset.company === activeCompany;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const visible = orders.filter(matchesFilters);
    visible.forEach((order, index) => {
      const row = tbody.insertRow();
      row.classList.toggle("order-flagged", order.flagged);
      row.classList.toggle("order-cancelled", order.status === "anulowane");
      [index + 1, order.orderNumber, order.supplier, null, formatOrderValue(order), order.deliveryAddress,
        order.projectNumber || "—", order.eodSalesforceNumber || "—", order.orderDate]
        .forEach((value, cellIndex) => {
          const cell = row.insertCell();
          if (cellIndex === 3) {
            cell.className = "order-items-cell";
            orderItemsOf(order).forEach(item => {
              const line = document.createElement("div");
              line.textContent = `${item.name} (${Number(item.quantity).toLocaleString("pl-PL")} ${item.unit || "szt."})`;
              cell.appendChild(line);
            });
            return;
          }
          cell.textContent = value;
          if (cellIndex === 6) {
            const projectName = projectShortNames(order.projectNumber);
            if (projectName) {
              cell.title = projectName;
              cell.setAttribute("aria-label", `${order.projectNumber} — ${projectName}`);
            }
          }
        });

      const creator = row.insertCell();
      creator.className = "admin-only";
      creator.textContent = order.createdBy || "—";

      const statusSelect = document.createElement("select");
      statusSelect.setAttribute("aria-label", `Status zamówienia ${order.orderNumber}`);
      Object.entries(statusLabels).forEach(([value, label]) => {
        statusSelect.add(new Option(label, value, false, value === order.status));
      });
      statusSelect.addEventListener("change", () => patch(order, { status: statusSelect.value }, "Status został zmieniony."));
      row.insertCell().appendChild(statusSelect);

      const actions = row.insertCell();
      actions.className = "order-actions";
      actions.appendChild(actionButton("🗒️", order.notes ? "Pokaż notatki (zapisano notatkę)" : "Notatki",
        () => openNotes(order), order.notes ? "has-note" : ""));
      actions.appendChild(actionButton("✏️", "Edytuj", () => startEdit(order)));
      actions.appendChild(actionButton(order.flagged ? "🏳️" : "🚩", order.flagged ? "Zdejmij flagę" : "Oflaguj",
        () => patch(order, { flagged: !order.flagged }, order.flagged ? "Flaga została zdjęta." : "Zamówienie oflagowano."),
        "order-flag-button"));
    });
    if (!visible.length) {
      const cell = tbody.insertRow().insertCell();
      cell.colSpan = 12;
      cell.textContent = orders.length ? "Brak zamówień spełniających kryteria." : "Brak zamówień.";
    }
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function replaceOrder(updated) {
    orders = orders.map(order => order.id === updated.id ? updated : order);
    render();
  }

  function patch(order, change, message) {
    return run(async () => {
      replaceOrder(await api.patch(order.id, change));
      showToast(message);
    });
  }

  async function loadCompanies() {
    const select = form.elements.companyId;
    const selected = select.value;
    const companies = await window.shipmentApi.catalogs.companies();
    select.replaceChildren(new Option("Wybierz spółkę", ""));
    companies.filter(company => orderCompanyNames.has(company.name))
      .forEach(company => select.add(new Option(company.name, company.id)));
    select.value = selected;
  }

  async function refresh() {
    await run(async () => {
      const isAdmin = document.body.dataset.role === "admin";
      scopeInfo.textContent = isAdmin
        ? "Jako administrator widzisz zamówienia wszystkich użytkowników."
        : "Widzisz tylko zamówienia utworzone przez siebie.";
      const [list, , projectList] = await Promise.all([
        api.list(),
        loadCompanies(),
        window.shipmentApi.catalogs.projects()
      ]);
      projects = projectList;
      orders = list;
      render();
    });
  }

  function openNotes(order) {
    notesOrderId = order.id;
    notesTextarea.value = order.notes || "";
    notesModal.style.display = "flex";
    notesModal.setAttribute("aria-hidden", "false");
    notesTextarea.focus();
  }

  function closeNotes() {
    notesModal.style.display = "none";
    notesModal.setAttribute("aria-hidden", "true");
    notesOrderId = null;
  }

  function saveNotes(notes) {
    const order = orders.find(item => item.id === notesOrderId);
    if (!order) return;
    run(async () => {
      replaceOrder(await api.patch(order.id, { notes }));
      closeNotes();
      showToast("Notatka została zapisana.");
    });
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const quantityInputs = [...itemsFields.querySelectorAll('[name="itemQuantity"]')];
    quantityInputs.forEach(input => {
      input.step = "any";
      input.setCustomValidity(input.value !== "" && Number(input.value) <= 0
        ? "Ilość musi być większa od zera."
        : "");
    });
    const isValid = form.reportValidity();
    quantityInputs.forEach(input => {
      input.step = "1";
      input.setCustomValidity("");
    });
    if (!isValid) return;
    run(async () => {
      const id = form.elements.id.value;
      const values = Object.fromEntries(["orderNumber", "eodSalesforceNumber", "orderDate", "supplier",
        "companyId", "projectNumber", "orderValue", "currency",
        "exchangeRate", "deliveryAddress"]
        .map(field => [field, form.elements[field].value]));
      values.items = collectItems();
      values.currency = values.currency || "PLN";
      if (id) {
        replaceOrder(await api.update(id, values));
      } else {
        orders = [await api.create(values), ...orders];
        render();
      }
      resetForm();
      showToast(id ? "Zamówienie zostało zaktualizowane." : "Zamówienie zostało dodane.");
    });
    form.noValidate = true;
  });

  cancelButton.addEventListener("click", resetForm);
  document.getElementById("addOrderItemButton").addEventListener("click", () => addItemRow());
  currencySelect.addEventListener("change", updateExchangeRateField);
  [searchInput, statusFilter, flaggedFilter, dateFromFilter, dateToFilter, ...Object.values(fieldFilters)].forEach(control => {
    control.addEventListener("input", render);
    control.addEventListener("change", render);
  });
  document.getElementById("orderResetFiltersButton").addEventListener("click", () => {
    [searchInput, dateFromFilter, dateToFilter, ...Object.values(fieldFilters)].forEach(control => { control.value = ""; });
    statusFilter.value = "";
    flaggedFilter.checked = false;
    render();
  });
  document.getElementById("orderNotesSaveButton").addEventListener("click", () => saveNotes(notesTextarea.value.trim()));
  document.getElementById("orderNotesDeleteButton").addEventListener("click", () => {
    if (confirm("Czy na pewno usunąć tę notatkę?")) saveNotes("");
  });
  document.getElementById("orderNotesCloseButton").addEventListener("click", closeNotes);
  notesModal.addEventListener("click", event => {
    if (event.target === notesModal) closeNotes();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && notesModal.style.display === "flex") closeNotes();
  });

  window.addEventListener("user-signed-in", () => {
    orders = [];
    resetForm();
    refresh();
  });
  window.addEventListener("session-expired", () => {
    orders = [];
    tbody.replaceChildren();
  });
  window.addEventListener("module-selected", event => {
    if (event.detail === "ordersModule") refresh();
  });
  window.addEventListener("catalogs-updated", refresh);

  resetForm();
});
