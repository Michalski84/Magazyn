// Okno podpisu odbiorcy: wpisanie imienia i nazwiska oraz zmiana statusu na „odebrane”.
// Otwiera okno podpisu odbiorcy dla wybranej przesyłki.
function openSignatureModal(id) {
  const shipment = shipments.find(item => String(item.id) === String(id));
  if (!shipment) return;

  currentSignatureId = shipment.id;
  recipientNameInput.value = shipment.odbiorcaPodpis || "";
  document.getElementById("signatureModal").style.display = "block";
  recipientNameInput.focus();
  recipientNameInput.select();
}

// Zamyka okno podpisu odbiorcy.
function closeSignatureModal() {
  document.getElementById("signatureModal").style.display = "none";
  currentSignatureId = null;
}

// Zapisuje imię i nazwisko odbiorcy przesyłki i oznacza ją jako odebraną.
async function saveSignature() {
  const recipientName = document.getElementById("recipientNameInput").value.trim();
  if (!recipientName) {
    alert("Wpisz imię i nazwisko odbiorcy.");
    document.getElementById("recipientNameInput").focus();
    return;
  }

  const shipment = shipments.find(item => String(item.id) === String(currentSignatureId));
  if (!shipment) return;
  try {
    const updated = await window.shipmentApi.patch(shipment.id, {
      version: shipment.version,
      odbiorcaPodpis: recipientName
    });
    shipments = shipments.map(item => item.id === updated.id ? updated : item);
    closeSignatureModal();
    renderShipmentList();
    showToast("Podpis odbiorcy został zapisany.");
  } catch (error) {
    const appError = document.getElementById("appError");
    appError.textContent = error.message;
    appError.hidden = false;
    if (error.status === 409) await reloadShipmentList();
    alert(`Nie udało się zapisać danych odbiorcy: ${error.message}`);
  }
}

// Podłącza przyciski i pole okna podpisu.
function initSignature() {
  recipientNameInput.addEventListener("click", () => recipientNameInput.focus());
  recipientNameInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveSignature();
  });

  document.getElementById("saveSignatureButton").addEventListener("click", () => saveSignature());
  document.getElementById("closeSignatureModalButton").addEventListener("click", closeSignatureModal);
}
