// Wspólne funkcje pomocnicze modułu magazynu: data, pokazywanie formularzy, obsługa błędów akcji.

// Zwraca dzisiejszą datę w formacie RRRR-MM-DD.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Pokazuje wskazany formularz magazynu i ukrywa pozostałe.
function showForm(id) {
  document.querySelectorAll(".warehouse-form").forEach(form => {
    form.hidden = form.id !== id;
  });
  byId(id).scrollIntoView({ behavior: "smooth", block: "start" });
}

// Wykonuje akcję asynchroniczną i pokazuje komunikat o błędzie.
async function run(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Obsługa przycisków zamykających formularze magazynu.
function initWarehouseFormClosing() {
  document.querySelectorAll("[data-close-warehouse-form]").forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      form.hidden = true;
      if (form.id === "issueCreateForm") setIssueFormMode(null);
      if (form.id === "warehouseCreateForm") byId("newWarehouseCompany").disabled = false;
    });
  });
}
