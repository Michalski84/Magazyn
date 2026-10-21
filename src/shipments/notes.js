// Okno notatek przesyłki: otwieranie, zapis, edycja i usuwanie notatki.
// Otwiera okno notatek dla przesyłki o podanym indeksie na liście.
function openNotesModal(index) {
  const shipment = shipments[index];
  if (!shipment) return;

  currentNotesId = shipment.id;
  notesTextarea.value = shipment.notatki || "";
  const hasNote = Boolean(notesTextarea.value.trim());
  notesTextarea.readOnly = false;
  notesSaveButton.disabled = false;
  notesEditButton.disabled = false;
  notesDeleteButton.disabled = !hasNote;
  notesModal.style.display = "flex";
  notesModal.setAttribute("aria-hidden", "false");
  focusNotesTextarea();
}

// Ustawia kursor na końcu pola notatki, jeśli jest edytowalne.
function focusNotesTextarea() {
  if (notesModal.style.display === "none" || notesTextarea.readOnly || notesTextarea.disabled) return;
  notesTextarea.focus();
  const cursorPosition = notesTextarea.value.length;
  notesTextarea.setSelectionRange(cursorPosition, cursorPosition);
}

// Zamyka okno notatek i czyści zaznaczoną przesyłkę.
function closeNotesModal() {
  notesModal.style.display = "none";
  notesModal.setAttribute("aria-hidden", "true");
  currentNotesId = null;
}

// Podłącza przyciski i zdarzenia okna notatek.
function initNotes() {
  window.addEventListener("focus", focusNotesTextarea);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) focusNotesTextarea();
  });

  notesSaveButton.addEventListener("click", () => runServerAction(async () => {
    if (currentNotesId === null) return;
    const note = notesTextarea.value.trim();
    if (!note) {
      alert("Wpisz treść notatki przed zapisaniem.");
      notesTextarea.focus();
      return;
    }

    const shipment = shipments.find(item => String(item.id) === String(currentNotesId));
    if (!shipment) return;
    const updated = await window.shipmentApi.patch(shipment.id, { version: shipment.version, notatki: note });
    shipments = shipments.map(item => item.id === updated.id ? updated : item);
    renderShipments();
    closeNotesModal();
    showToast("Notatka została zapisana.");
  }));

  notesEditButton.addEventListener("click", function () {
    if (currentNotesId === null) return;
    notesTextarea.readOnly = false;
    focusNotesTextarea();
  });

  notesDeleteButton.addEventListener("click", () => runServerAction(async () => {
    if (currentNotesId === null || !confirm("Czy na pewno usunąć tę notatkę?")) return;
    const shipment = shipments.find(item => String(item.id) === String(currentNotesId));
    if (shipment) {
      const updated = await window.shipmentApi.patch(shipment.id, { version: shipment.version, notatki: "" });
      shipments = shipments.map(item => item.id === updated.id ? updated : item);
      renderShipments();
    }
    closeNotesModal();
  }));

  notesCloseButton.addEventListener("click", closeNotesModal);
  notesModal.addEventListener("click", event => {
    if (event.target === notesModal) closeNotesModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && notesModal.style.display !== "none") closeNotesModal();
  });
}
