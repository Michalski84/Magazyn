// Wiersze pozycji w formularzach WZ i MM (wybór wpisu magazynowego i ilości).

// Wypełnia listę wpisów magazynowych wybranego magazynu.
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

// Odświeża listy pozycji w wierszach formularza WZ.
function updateIssueItemOptions() {
  byId("issueLines").querySelectorAll(".issue-line select")
    .forEach(select => setStockEntryOptions(select));
}

// Odświeża listy pozycji w wierszach formularza MM.
function updateTransferItemOptions() {
  byId("transferLines").querySelectorAll(".issue-line select")
    .forEach(select => setStockEntryOptions(select, "transferSource"));
}

// Dodaje wiersz do formularza WZ (opcjonalnie z gotową pozycją i ilością).
function addIssueLine(preset = null) {
  addQuantityLine("issueLines", "issue-line", "Ilość do wydania", undefined, true, preset);
}

// Dodaje wiersz do formularza MM (opcjonalnie z gotową pozycją i ilością).
function addTransferLine(preset = null) {
  addQuantityLine("transferLines", "issue-line", "Ilość do przesunięcia", "transferSource", false, preset);
}

// Tworzy wiersz z listą pozycji i ilością (wspólny dla WZ i MM); preset wypełnia wiersz gotową pozycją.
function addQuantityLine(containerId, className, quantityLabel, warehouseSelectId, withSerial = false, preset = null) {
  const row = document.createElement("div");
  row.className = withSerial ? `${className} issue-line--serial` : className;
  const select = document.createElement("select");
  select.required = true;
  setStockEntryOptions(select, warehouseSelectId);
  if (preset) select.value = String(preset.stockEntryId);
  const quantity = document.createElement("input");
  quantity.type = "number";
  quantity.min = "1";
  quantity.step = "1";
  quantity.value = preset ? preset.quantity : "1";
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
