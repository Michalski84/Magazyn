// Przełączanie zakładek modułów aplikacji.

// Przełącza widoczny moduł i odświeża dane magazynu po wejściu do niego.
function switchModule(moduleId) {
  const tab = Array.from(tabs).find(item => item.dataset.module === moduleId);
  tabs.forEach(item => {
    const selected = item === tab;
    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".app-module").forEach(module => {
    module.hidden = module.id !== moduleId;
  });
  if (moduleId === "warehouseModule") refreshWarehouseData();
  window.dispatchEvent(new CustomEvent("module-selected", { detail: moduleId }));
}

// Podpina kliknięcia zakładek modułów.
function initWarehouseTabs() {
  tabs.forEach(tab => tab.addEventListener("click", () => switchModule(tab.dataset.module)));
}
