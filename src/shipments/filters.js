// Filtry tabeli przesyłek: wyszukiwarki, status, sortowanie i okres dat.
// Przywraca domyślne wartości wszystkich filtrów i sortowania.
function resetShipmentFilters() {
  globalSearchInput.value = "";
  searchFilters.forEach(input => {
    input.value = "";
  });
  statusFilter.value = "all";
  shipmentSort.value = "default";
  datePeriodFilter.value = "all";
  dateFrom.value = "";
  dateTo.value = "";
  shipmentMonth.value = "";
  dateRangeControls.hidden = true;
  monthControls.hidden = true;
  renderShipments();
  applyShipmentFilters();
}

// Podłącza zdarzenia filtrów tabeli.
function initFilters() {
  globalSearchInput.addEventListener("input", applyShipmentFilters);
  searchFilters.forEach(input => {
    const eventName = input instanceof HTMLSelectElement ? "change" : "input";
    input.addEventListener(eventName, applyShipmentFilters);
  });
  statusFilter.addEventListener("change", applyShipmentFilters);
  tableColumnToggles.forEach(toggle => toggle.addEventListener("change", applyTableViewSettings));
  shipmentNumberColorsToggle.addEventListener("change", renderShipments);
  shipmentSort.addEventListener("change", renderShipments);
  resetFiltersButton.addEventListener("click", resetShipmentFilters);
  datePeriodFilter.addEventListener("change", function () {
    dateRangeControls.hidden = this.value !== "range";
    monthControls.hidden = this.value !== "month";
    applyShipmentFilters();
  });
  [dateFrom, dateTo, shipmentMonth].forEach(input => input.addEventListener("change", applyShipmentFilters));
}
