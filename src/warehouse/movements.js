// Historia ruchów magazynowych.

// Renderuje tabelę ruchów magazynowych.
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

// Zwraca etykietę typu ruchu.
function movementTypeLabel(type) {
  return {
    IN: "Przyjęcie",
    OUT: "Wydanie",
    ADJUSTMENT: "Korekta",
    TRANSFER: "Przesunięcie",
    RETURN: "Zwrot"
  }[type] || type;
}

// Zwraca etykietę typu dokumentu.
function documentTypeLabel(type) {
  return {
    receipt: "przyjęcie",
    wz: "WZ",
    adjustment: "korekta",
    transfer: "MM",
    opening: "stan początkowy"
  }[type] || type;
}

// Wczytuje historię ruchów wybranej pozycji.
async function loadItemMovements(stock) {
  byId("movementsTable").dataset.stockEntryId = String(stock.stockEntryId);
  state.movements = await api.movements({ stockEntryId: stock.stockEntryId });
  renderMovements();
  byId("movementsDetails").open = true;
  byId("movementsTable").scrollIntoView({ behavior: "smooth", block: "center" });
}
