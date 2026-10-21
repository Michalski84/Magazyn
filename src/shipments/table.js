// Tabela przesyłek: renderowanie wierszy, widoczność kolumn, wyszukiwanie i filtr dat.
// Składa opis „rodzaj, ilość przesyłek” używany w kopiowaniu i wydruku.
function formatShipmentTypeAndQuantity(shipment) {
  const type = String(shipment.rodzaj ?? "").toLocaleLowerCase("pl-PL");
  const capitalizedType = type.charAt(0).toLocaleUpperCase("pl-PL") + type.slice(1);
  return `${capitalizedType}, ${shipment.iloscPrzesylek ?? 1} szt.`;
}

// Zwraca klasę CSS koloru numeru według liczby dni oczekiwania przesyłki.
function getShipmentNumberClass(shipment) {
  if (shipment.status === "odebrane") return "shipment-number--received";

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shipment.data || "");
  if (!dateMatch) return "";

  const shipmentDate = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
  const parsedDate = new Date(shipmentDate);
  if (
    parsedDate.getUTCFullYear() !== Number(dateMatch[1]) ||
    parsedDate.getUTCMonth() !== Number(dateMatch[2]) - 1 ||
    parsedDate.getUTCDate() !== Number(dateMatch[3])
  ) return "";

  const today = new Date();
  const todayDate = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysWaiting = Math.floor((todayDate - shipmentDate) / 86400000);
  if (daysWaiting > 14) return "shipment-number--critical";
  if (daysWaiting >= 7) return "shipment-number--overdue";
  return "";
}

// Buduje od nowa tabelę przesyłek (sortowanie, filtr spółek, przyciski akcji, status).
function renderShipments() {
  tableBody.innerHTML = "";
  const selectedCompany = companySearchFilter.value;
  const companies = Array.from(new Set(
    shipments.map(shipment => shipment.nazwaSpolki?.trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
  companySearchFilter.innerHTML = "";
  const allCompaniesOption = document.createElement("option");
  allCompaniesOption.value = "";
  allCompaniesOption.textContent = "Wszystkie spółki";
  companySearchFilter.appendChild(allCompaniesOption);
  companies.forEach(company => {
    const option = document.createElement("option");
    option.value = company;
    option.textContent = company;
    companySearchFilter.appendChild(option);
  });
  companySearchFilter.value = companies.includes(selectedCompany) ? selectedCompany : "";

  const fragment = document.createDocumentFragment();
  const orderedShipments = shipments.map((shipment, index) => ({ shipment, index }));
  if (shipmentSort.value !== "default") {
    orderedShipments.sort((a, b) => {
      const dateA = Date.parse(`${a.shipment.data}T00:00:00Z`);
      const dateB = Date.parse(`${b.shipment.data}T00:00:00Z`);
      const difference = shipmentSort.value === "oldest" ? dateA - dateB : dateB - dateA;
      return difference || a.index - b.index;
    });
  }

  orderedShipments.forEach(({ shipment, index }) => {
    const tr = document.createElement("tr");
    tr.dataset.shipmentId = String(shipment.id);
    tr.dataset.status = shipment.status || "na magazynie";
    tr.dataset.shipmentDate = shipment.data || "";

    const numberCell = document.createElement("td");
    numberCell.dataset.columnKey = "lp";
    numberCell.className = shipmentNumberColorsToggle.checked ? getShipmentNumberClass(shipment) : "";
    numberCell.textContent = String(index + 1);
    tr.appendChild(numberCell);

    const registerNumberCell = document.createElement("td");
    registerNumberCell.dataset.columnKey = "numerId";
    registerNumberCell.textContent = shipment.numerId ?? "";
    tr.appendChild(registerNumberCell);

    [
      ["firma", shipment.firma],
      ["numerListu", shipment.numerListu],
      ["data", shipment.data],
      ["odbiorca", shipment.odbiorca],
      ["nadawca", shipment.nadawca],
      ["rodzaj", formatShipmentTypeAndQuantity(shipment)]
    ].forEach(([columnKey, value]) => {
      const cell = document.createElement("td");
      cell.dataset.columnKey = columnKey;
      cell.textContent = value ?? "";
      tr.appendChild(cell);
    });

    const contentsCell = document.createElement("td");
    contentsCell.dataset.columnKey = "zawartosc";
    const contentsList = document.createElement("ul");
    (Array.isArray(shipment.zawartosc) ? shipment.zawartosc : []).forEach(item => {
      const listItem = document.createElement("li");
      listItem.textContent = `${item.nazwa ?? ""} (${item.ilosc ?? ""} ${item.jednostka ?? ""}${item.serial ? `, SN: ${item.serial}` : ""})`;
      contentsList.appendChild(listItem);
    });
    contentsCell.appendChild(contentsList);
    tr.appendChild(contentsCell);

    const orderCell = document.createElement("td");
    orderCell.dataset.columnKey = "zamowienie";
    orderCell.textContent = shipment.zamowienie ?? "";
    tr.appendChild(orderCell);

    const projectCell = document.createElement("td");
    projectCell.dataset.columnKey = "projekt";
    projectCell.textContent = shipment.projekt ?? "";
    tr.appendChild(projectCell);

    const companyCell = document.createElement("td");
    companyCell.dataset.columnKey = "nazwaSpolki";
    companyCell.textContent = shipment.nazwaSpolki ?? "";
    tr.appendChild(companyCell);

    const actionsCell = document.createElement("td");
    actionsCell.dataset.columnKey = "akcje";
    const actionButtons = document.createElement("div");
    actionButtons.className = "action-buttons";
    const actions = [
      ["Edytuj", "✏️", () => window.editEntry(shipment.id)],
      ["Usuń", "🗑️", () => window.deleteEntry(shipment.id)],
      ["Kopiuj do schowka", "📋", () => copyToClipboard(shipment.id)],
      ["Drukuj potwierdzenie odbioru", "🖨️", () => printReceipt(shipment.id)],
      ["Podpisz", "✍️", () => openSignatureModal(shipment.id)],
      ["Notatki", "📝", () => openNotesModalById(shipment.id)]
    ];
    actions.forEach(([title, icon, handler]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.title = title;
      button.textContent = icon;
      if (title === "Notatki" && shipment.notatki?.trim()) {
        button.classList.add("has-note");
      }
      if (title === "Podpisz" && shipment.odbiorcaPodpis?.trim()) {
        button.classList.add("has-signature");
      }
      button.addEventListener("click", handler);
      actionButtons.appendChild(button);
    });
    actionsCell.appendChild(actionButtons);
    tr.appendChild(actionsCell);

    const statusCell = document.createElement("td");
    statusCell.dataset.columnKey = "status";
    const statusSelect = document.createElement("select");
    [
      { value: "na magazynie", label: "Na magazynie" },
      { value: "odebrane", label: "Odebrane" },
      { value: "częściowo odebrane", label: "Częściowo odebrane" }
    ].forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = tr.dataset.status === value;
      statusSelect.appendChild(option);
    });
    statusSelect.addEventListener("change", () => window.updateStatus(shipment.id, statusSelect.value));
    statusCell.appendChild(statusSelect);
    tr.appendChild(statusCell);
    fragment.appendChild(tr);
  });
  tableBody.appendChild(fragment);
  applyTableViewSettings();
  applyShipmentFilters();
}

// Pokazuje lub ukrywa kolumny tabeli zgodnie z przełącznikami widoku.
function applyTableViewSettings() {
  tableColumnToggles.forEach(toggle => {
    document.querySelectorAll(`#shipmentsTable [data-column-key="${toggle.dataset.columnKey}"]`)
      .forEach(cell => {
        cell.hidden = !toggle.checked;
      });
  });
}

// Otwiera okno notatek dla przesyłki o podanym identyfikatorze.
function openNotesModalById(id) {
  const index = shipments.findIndex(shipment => String(shipment.id) === String(id));
  if (index >= 0) openNotesModal(index);
}

// Ukrywa wiersze tabeli niepasujące do wyszukiwarek, statusu i okresu.
function applyShipmentFilters() {
  const columnIndexes = {
    numerId: 1,
    firma: 2,
    numerListu: 3,
    odbiorca: 5,
    nadawca: 6,
    zawartosc: 8,
    zamowienie: 9,
    projekt: 10,
    nazwaSpolki: 11
  };
  const activeSearchFilters = Array.from(searchFilters)
    .map(input => ({
      columnIndex: columnIndexes[input.dataset.column],
      query: input.value.trim().toLowerCase(),
      exact: input instanceof HTMLSelectElement
    }))
    .filter(filter => filter.query);
  const globalQuery = globalSearchInput.value.trim().toLowerCase();

  Array.from(tableBody.rows).forEach(row => {
    const statusMatches = statusFilter.value === "all" || row.dataset.status === statusFilter.value;
    const dateMatches = matchesDatePeriod(row.dataset.shipmentDate);
    const globalSearchMatches = !globalQuery || Object.values(columnIndexes).some(columnIndex => {
      const cell = row.cells[columnIndex];
      return cell && cell.textContent.toLowerCase().includes(globalQuery);
    });
    const specificSearchMatches = activeSearchFilters.every(filter => {
      const cell = row.cells[filter.columnIndex];
      if (!cell) return false;
      const value = cell.textContent.trim().toLowerCase();
      return filter.exact ? value === filter.query : value.includes(filter.query);
    });
    const searchMatches = globalSearchMatches && specificSearchMatches;
    row.style.display = statusMatches && dateMatches && searchMatches ? "" : "none";
  });
}

// Sprawdza, czy data przesyłki mieści się w wybranym okresie.
function matchesDatePeriod(dateValue) {
  const mode = datePeriodFilter.value;
  if (mode === "all") return true;
  if (!dateValue) return false;

  if (mode === "range") {
    return (!dateFrom.value || dateValue >= dateFrom.value) &&
      (!dateTo.value || dateValue <= dateTo.value);
  }
  if (mode === "month") {
    return !shipmentMonth.value || dateValue.startsWith(shipmentMonth.value);
  }

  const shipmentDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(shipmentDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (mode === "last-week" ? 6 : 29));
  return shipmentDate >= startDate && shipmentDate <= today;
}

// Rejestruje funkcję renderującą tabelę dla pozostałych modułów.
function initTable() {
  renderShipmentList = renderShipments;
}
