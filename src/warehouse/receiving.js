// Przyjęcie na magazyn pozycji ze starszych przesyłek.

// Podpina formularz przyjęcia przesyłki i udostępnia window.openShipmentReceiving.
function initShipmentReceiving() {
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
}
