// Tabela stanów magazynowych: renderowanie, widoczność kolumn i filtrowanie.

// Renderuje tabelę stanów z uwzględnieniem filtrów.
function renderStock() {
  updateStockTitle();
  const search = byId("stockSearch").value.trim().toLocaleLowerCase("pl-PL");
  const companyId = byId("warehouseCompanyFilter").value;
  byId("stockCompanyColumnFilter").value = companyId;
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
  const direction = byId("stockSortOrder").value === "oldest-first" ? 1 : -1;
  rows.sort((a, b) => {
    const aDate = Date.parse(a.createdAt);
    const bDate = Date.parse(b.createdAt);
    if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
      return (aDate - bDate) * direction;
    }
    return String(a.stockEntryId).localeCompare(String(b.stockEntryId), undefined, { numeric: true }) * direction;
  });
  visibleStock = rows;
  const tbody = byId("stockTable").tBodies[0];
  tbody.replaceChildren();
  rows.forEach(stock => {
    const row = document.createElement("tr");
    if (stock.lowStock && stock.minimumStock > 0) row.classList.add("low-stock-row");
    row.classList.toggle("is-selected", selectedStockIds.has(String(stock.stockEntryId)));
    row.appendChild(createSelectionCell(stock));
    [
      ["lp", tbody.rows.length + 1], ["companyName", stock.companyName], ["warehouseName", stock.warehouseName], ["name", stock.name],
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
  updateSelectionBar();
}

// Stosuje wybór widocznych kolumn tabeli stanów.
function applyStockColumnVisibility() {
  document.querySelectorAll(".stock-column-toggle").forEach(toggle => {
    document.querySelectorAll(`#stockTable [data-column-key="${toggle.dataset.columnKey}"]`)
      .forEach(cell => {
        cell.hidden = !toggle.checked;
      });
  });
}

// Skraca numery projektów do krótkich nazw.
function projectShortNames(projectNumber) {
  const names = String(projectNumber ?? "").split(/[,;]/)
    .map(part => part.trim().toLocaleLowerCase("pl-PL"))
    .filter(Boolean)
    .map(number => state.projects.find(project =>
      String(project.projectNumber).trim().toLocaleLowerCase("pl-PL") === number)?.shortName)
    .filter(Boolean);
  return [...new Set(names)].join("; ");
}

// Aktualizuje tytuł tabeli stanów.
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

// Podpina filtry tabeli stanów oraz filtry poszczególnych kolumn.
function initStockFilters() {
  byId("warehouseFilter").addEventListener("change", renderStock);
  byId("stockCompanyColumnFilter").addEventListener("change", event => {
    const filter = byId("warehouseCompanyFilter");
    filter.value = event.target.value;
    filter.dispatchEvent(new Event("change"));
  });
  byId("stockSearch").addEventListener("input", renderStock);
  byId("stockOnlyAvailable").addEventListener("change", renderStock);
  byId("stockSortOrder").addEventListener("change", renderStock);
  document.querySelectorAll(".stock-column-toggle")
    .forEach(toggle => toggle.addEventListener("change", applyStockColumnVisibility));
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
}
