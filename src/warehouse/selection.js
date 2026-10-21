// Zaznaczanie pozycji ptaszkiem w tabeli stanów i tworzenie z nich dokumentu WZ.

// Tworzy komórkę z ptaszkiem zaznaczenia; pozycje bez stanu nie mogą być wydane, więc są nieaktywne.
function createSelectionCell(stock) {
  const cell = document.createElement("td");
  cell.dataset.columnKey = "select";
  const checkbox = document.createElement("input");
  const id = String(stock.stockEntryId);
  checkbox.type = "checkbox";
  checkbox.className = "stock-select-checkbox";
  checkbox.checked = selectedStockIds.has(id);
  checkbox.disabled = !(Number(stock.quantityOnHand) > 0);
  checkbox.setAttribute("aria-label", `Zaznacz pozycję ${stock.name}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedStockIds.add(id);
    else selectedStockIds.delete(id);
    checkbox.closest("tr").classList.toggle("is-selected", checkbox.checked);
    updateSelectionBar();
  });
  cell.appendChild(checkbox);
  return cell;
}

// Zwraca widoczne w tabeli pozycje, które można zaznaczyć (ze stanem większym od zera).
function selectableVisibleStock() {
  return visibleStock.filter(stock => Number(stock.quantityOnHand) > 0);
}

// Odświeża pasek zaznaczenia oraz ptaszek „zaznacz wszystko” w nagłówku tabeli.
function updateSelectionBar() {
  const count = selectedStockIds.size;
  byId("stockSelectionBar").hidden = count === 0;
  const lastDigit = count % 10;
  const noun = count === 1 ? "pozycja"
    : lastDigit >= 2 && lastDigit <= 4 && (count < 10 || count > 20) ? "pozycje" : "pozycji";
  byId("stockSelectionCount").textContent = `Zaznaczono: ${count} ${noun}`;
  const selectable = selectableVisibleStock();
  const selectedVisible = selectable.filter(stock => selectedStockIds.has(String(stock.stockEntryId))).length;
  const selectAll = byId("stockSelectAll");
  selectAll.checked = selectable.length > 0 && selectedVisible === selectable.length;
  selectAll.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;
  selectAll.disabled = selectable.length === 0;
}

// Usuwa z zaznaczenia pozycje, które zniknęły z danych lub nie mają już stanu.
function pruneStockSelection() {
  const available = new Set(state.stock
    .filter(stock => Number(stock.quantityOnHand) > 0)
    .map(stock => String(stock.stockEntryId)));
  selectedStockIds.forEach(id => {
    if (!available.has(id)) selectedStockIds.delete(id);
  });
}

// Czyści zaznaczenie i odświeża tabelę.
function clearStockSelection() {
  selectedStockIds.clear();
  renderStock();
}

// Zwraca zaznaczone pozycje ze stanem większym od zera.
function selectedStockEntries() {
  return state.stock.filter(stock =>
    selectedStockIds.has(String(stock.stockEntryId)) && Number(stock.quantityOnHand) > 0);
}

// Sprawdza zaznaczenie (jedna spółka i jeden magazyn) i otwiera formularz WZ z gotowymi pozycjami.
function startIssueFromSelection() {
  const entries = selectedStockEntries();
  if (!entries.length) {
    showToast("Zaznacz w tabeli pozycje do wydania.", "error");
    return;
  }
  const companyNames = [...new Set(entries.map(stock => stock.companyName))];
  if (companyNames.length > 1) {
    showToast(`Dokument WZ może obejmować towar tylko jednej spółki. Zaznaczono: ${companyNames.join(", ")}.`, "error");
    return;
  }
  const warehouseNames = [...new Set(entries.map(stock => stock.warehouseName))];
  if (warehouseNames.length > 1) {
    showToast(`Dokument WZ dotyczy jednego magazynu. Zaznaczono pozycje z magazynów: ${warehouseNames.join(", ")}.`, "error");
    return;
  }
  openIssueFormWithEntries(entries);
}

// Otwiera formularz MM z zaznaczonych pozycji (wszystkie muszą być w jednym magazynie źródłowym).
function startTransferFromSelection() {
  const entries = selectedStockEntries();
  if (!entries.length) {
    showToast("Zaznacz w tabeli pozycje do przesunięcia.", "error");
    return;
  }
  const warehouseNames = [...new Set(entries.map(stock => stock.warehouseName))];
  if (warehouseNames.length > 1) {
    showToast(`Przesunięcie MM dotyczy jednego magazynu źródłowego. Zaznaczono: ${warehouseNames.join(", ")}.`, "error");
    return;
  }
  if (state.warehouses.length < 2) {
    showToast("Do przesunięcia potrzebne są co najmniej dwa magazyny.", "error");
    return;
  }
  openTransferFormWithEntries(entries);
}

// Eksportuje do Excela tylko zaznaczone pozycje.
function exportSelectedStock() {
  const entries = selectedStockEntries();
  if (!entries.length) {
    showToast("Zaznacz w tabeli pozycje do eksportu.", "error");
    return;
  }
  exportStock(entries, "zaznaczone-pozycje-magazynu.xlsx");
}

// Podpina ptaszek „zaznacz wszystko” oraz przyciski paska zaznaczenia.
function initStockSelection() {
  byId("createTransferFromSelectionButton").addEventListener("click", startTransferFromSelection);
  byId("exportSelectionButton").addEventListener("click", exportSelectedStock);
  byId("stockSelectAll").addEventListener("change", event => {
    selectableVisibleStock().forEach(stock => {
      const id = String(stock.stockEntryId);
      if (event.target.checked) selectedStockIds.add(id);
      else selectedStockIds.delete(id);
    });
    renderStock();
  });
  byId("clearStockSelectionButton").addEventListener("click", clearStockSelection);
  byId("createIssueFromSelectionButton").addEventListener("click", startIssueFromSelection);
}
