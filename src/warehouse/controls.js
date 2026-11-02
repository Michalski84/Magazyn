// Wypełnianie list wyboru (spółki, magazyny, odbiorcy) na podstawie stanu.

// Zwraca id pierwszego magazynu z listy (domyślny wybór w formularzach).
function defaultWarehouseId() {
  return String(state.warehouses[0]?.id || "");
}

// Wypełnia listy spółek w filtrze, pozycji i magazynie.
// Filtr tabeli stanów jest posortowany malejąco wg liczby pozycji dostępnych na magazynie.
function populateCompanyControls() {
  const selectedFilterCompany = byId("warehouseCompanyFilter").value;
  const selectedItemCompany = byId("newItemCompany").value;
  const selectedWarehouseCompany = byId("newWarehouseCompany").value;
  const filter = byId("warehouseCompanyFilter");
  const stockCounts = new Map();
  state.stock.forEach(row => {
    if (Number(row.quantityOnHand) > 0) {
      stockCounts.set(String(row.companyId), (stockCounts.get(String(row.companyId)) || 0) + 1);
    }
  });
  const countOf = company => stockCounts.get(String(company.id)) || 0;
  filter.replaceChildren(new Option("Wszystkie spółki", ""));
  state.companies.filter(company => company.active)
    .sort((a, b) => countOf(b) - countOf(a) || a.name.localeCompare(b.name, "pl"))
    .forEach(company => {
      filter.add(new Option(`${company.name} (${countOf(company)})`, String(company.id)));
    });
  filter.value = state.companies.some(company => String(company.id) === selectedFilterCompany)
    ? selectedFilterCompany
    : "";
  const columnFilter = byId("stockCompanyColumnFilter");
  columnFilter.replaceChildren(...Array.from(filter.options, option => new Option(option.text, option.value)));
  columnFilter.value = filter.value;

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

// Ustawia dostępne magazyny dla wybranej spółki w formularzu pozycji.
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
    warehouse.active && String(warehouse.companyId) === String(companyId)
  );
  if (!available.length) {
    select.add(new Option("Brak dostępnych magazynów", ""));
    select.disabled = true;
    return;
  }
  available.forEach(warehouse => select.add(new Option(warehouse.name, String(warehouse.id))));
  const hasPrevious = available.some(w => String(w.id) === previous);
  select.value = hasPrevious
    ? previous
    : String((available.find(w => w.name === w.companyName) ?? available[0]).id);
}

// Wypełnia listy magazynów w filtrach i formularzach WZ/MM.
function populateWarehouseControls() {
  const mainId = defaultWarehouseId();
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
    const companyFilter = selectId === "warehouseFilter" ? byId("warehouseCompanyFilter").value : "";
    const visible = state.warehouses.filter(warehouse =>
      !companyFilter || String(warehouse.companyId) === companyFilter
    );
    visible.forEach(warehouse => select.add(new Option(warehouse.name, String(warehouse.id))));
    const selectionExists = visible.some(warehouse => String(warehouse.id) === previous);
    select.value = selectionExists ? previous : includeAll ? "" : mainId;
  }
  updateNewItemWarehouseOptions();
}

// Wypełnia listę odbiorców w formularzu WZ.
function populateIssueRecipients() {
  byId("issueRecipientList").replaceChildren(
    ...state.recipients.map(recipient => new Option(recipientLabel(recipient)))
  );
}

// Etykieta odbiorcy w polu wyszukiwania (nazwa + miejscowość, by rozróżnić duplikaty).
function recipientLabel(recipient) {
  const place = [recipient.postalCode, recipient.city].filter(Boolean).join(" ");
  return place ? `${recipient.name} — ${place}` : recipient.name;
}

// Zwraca zapisanego odbiorcę dopasowanego do wartości pola wyszukiwania.
function selectedIssueRecipient() {
  const value = byId("issueRecipient").value.trim();
  return value ? state.recipients.find(recipient => recipientLabel(recipient) === value) : undefined;
}

// Uzupełnia listę spółek formularza przesyłek o spółki z magazynu.
function populateShipmentCompanyChoices() {
  const known = new Set(Array.from(warehouseCompanySelect.options).map(option => option.value));
  const fallback = Array.from(warehouseCompanySelect.options).find(option => option.value === "inna");
  state.companies.filter(company => company.active).forEach(company => {
    if (known.has(company.name)) return;
    const option = new Option(company.name, company.name);
    warehouseCompanySelect.insertBefore(option, fallback || null);
    known.add(company.name);
  });
}

// Zwraca nazwę spółki o podanym id.
function selectedCompanyName(companyId) {
  return state.companies.find(company => String(company.id) === String(companyId))?.name || "";
}
