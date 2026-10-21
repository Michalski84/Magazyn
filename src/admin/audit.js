// Dziennik zmian (tylko administrator): lista zdarzeń zapisanych na serwerze.

// Formatuje datę zdarzenia w czasie lokalnym.
function formatAuditDate(value) {
  return new Date(value).toLocaleString("pl-PL");
}

// Pobiera wpisy dziennika z filtrami i wypełnia tabelę.
async function loadAudit() {
  const tbody = document.getElementById("auditTable").tBodies[0];
  try {
    const entries = await window.shipmentApi.audit({
      username: document.getElementById("auditFilterUser").value.trim(),
      search: document.getElementById("auditFilterSearch").value.trim(),
      limit: 300
    });
    tbody.replaceChildren();
    entries.forEach(entry => {
      const row = tbody.insertRow();
      [formatAuditDate(entry.occurredAt), entry.username, entry.action, entry.entity, entry.entityId]
        .forEach(value => { row.insertCell().textContent = value ?? ""; });
    });
    if (!entries.length) tbody.insertRow().insertCell().textContent = "Brak wpisów.";
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Podpina odświeżanie dziennika po wejściu w zakładkę oraz po zmianie filtrów.
function initAudit() {
  window.addEventListener("module-selected", event => {
    if (event.detail === "auditModule") loadAudit();
  });
  document.getElementById("auditRefreshButton").addEventListener("click", loadAudit);
  ["auditFilterUser", "auditFilterSearch"].forEach(id => {
    document.getElementById(id).addEventListener("change", loadAudit);
  });
}

initAudit();
