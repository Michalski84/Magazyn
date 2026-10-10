let shipments = [];
let currentSignatureId = null;
let renderShipmentList = () => {};
let reloadShipmentList = async () => {};
let toastTimeout = null;
const themeStorageKey = "shipment-register-theme";
const savedTheme = localStorage.getItem(themeStorageKey);
if (savedTheme === "light") document.body.dataset.theme = "light";
const recipientNameInput = document.getElementById("recipientNameInput");

function showToast(message, type = "success") {
  const toast = document.getElementById("toastNotification");
  if (!toast) return;

  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("toast-notification--error", type === "error");
  toast.classList.toggle("toast-notification--danger", type === "danger");
  toast.hidden = false;
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

recipientNameInput.addEventListener("click", () => recipientNameInput.focus());
recipientNameInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveSignature();
});

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("shipmentForm");
  const addZawartoscButton = document.getElementById("addZawartoscButton");
  document.getElementById("saveSignatureButton").addEventListener("click", () => saveSignature());
  document.getElementById("closeSignatureModalButton").addEventListener("click", closeSignatureModal);
  const tableBody = document.querySelector("#shipmentsTable tbody");
  const globalSearchInput = document.getElementById("globalSearchInput");
  const resetFiltersButton = document.getElementById("resetFiltersButton");
  const searchFilters = document.querySelectorAll(".search-filter");
  const companySearchFilter = document.getElementById("companySearchFilter");
  const tableColumnToggles = document.querySelectorAll(".table-column-toggle");
  const shipmentNumberColorsToggle = document.getElementById("shipmentNumberColorsToggle");
  const statusFilter = document.getElementById("statusFilter");
  const shipmentSort = document.getElementById("shipmentSort");
  const datePeriodFilter = document.getElementById("datePeriodFilter");
  const dateRangeControls = document.getElementById("dateRangeControls");
  const monthControls = document.getElementById("monthControls");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");
  const shipmentMonth = document.getElementById("shipmentMonth");
  const exportExcelButton = document.getElementById("exportExcelButton");
  const exportVisibleExcelButton = document.getElementById("exportVisibleExcelButton");
  const importExcelButton = document.getElementById("importExcelButton");
  const importExcelFile = document.getElementById("importExcelFile");
  const refreshAppButton = document.getElementById("refreshAppButton");
  const notesModal = document.getElementById("notesModal");
  const notesTextarea = document.getElementById("notesTextarea");
  const notesSaveButton = document.getElementById("notesSaveButton");
  const notesEditButton = document.getElementById("notesEditButton");
  const notesDeleteButton = document.getElementById("notesDeleteButton");
  const notesCloseButton = document.getElementById("notesCloseButton");
  const appContent = document.getElementById("appContent");
  const loginScreen = document.getElementById("loginScreen");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const logoutButton = document.getElementById("logoutButton");
  const currentUserName = document.getElementById("currentUserName");
  const appError = document.getElementById("appError");
  const themeToggleButton = document.getElementById("themeToggleButton");
  const excelHeaders = [
    "Numer ID", "Nazwa Spółki", "Firma przewozowa", "Numer listu", "Data przyjęcia", "Adresat", "Nadawca",
    "Rodzaj przesyłki", "Ilość przesyłek", "Zawartość", "Numer zamówienia", "Numer projektu", "Status",
    "Imię i nazwisko odbiorcy", "Notatki"
  ];
  const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  let editId = null;
  let editVersion = null;
  let currentNotesId = null;
  let scrollAnimationFrame = null;
  const companySelect = document.getElementById("nazwaSpolkiSelect");
  const otherCompanyContainer = document.getElementById("otherCompanyContainer");
  const otherCompanyInput = document.getElementById("otherCompanyInput");

  function updateThemeToggle() {
    const isLightTheme = document.body.dataset.theme === "light";
    themeToggleButton.textContent = isLightTheme ? "Tryb ciemny" : "Tryb jasny";
    themeToggleButton.setAttribute("aria-pressed", String(isLightTheme));
    themeToggleButton.setAttribute(
      "aria-label",
      isLightTheme ? "Przełącz na tryb ciemny" : "Przełącz na tryb jasny"
    );
  }

  updateThemeToggle();
  themeToggleButton.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    document.body.dataset.theme = nextTheme;
    localStorage.setItem(themeStorageKey, nextTheme);
    updateThemeToggle();
  });

  function updateOtherCompanyInput() {
    const isOtherCompany = companySelect.value === "inna";
    otherCompanyContainer.hidden = !isOtherCompany;
    otherCompanyInput.required = isOtherCompany;
    if (!isOtherCompany) otherCompanyInput.value = "";
  }

  companySelect.addEventListener("change", updateOtherCompanyInput);
  companySelect.addEventListener("change", () => {
    companySelect.required = true;
  });

  addZawartoscButton.addEventListener("click", () => addZawartoscField());

  function showAppError(message) {
    appError.textContent = message;
    appError.hidden = false;
  }

  function clearAppError() {
    appError.textContent = "";
    appError.hidden = true;
  }

  async function runServerAction(action) {
    clearAppError();
    try {
      await action();
    } catch (error) {
      showAppError(error.message);
      if (error.status === 409 || error.status === 404) await reloadShipmentList();
      else renderShipments();
      alert(`Nie udało się wykonać operacji: ${error.message}`);
    }
  }

  async function loadShipments() {
    shipments = await window.shipmentApi.list();
    clearAppError();
    renderShipments();
  }

  reloadShipmentList = async () => {
    try {
      await loadShipments();
      return true;
    } catch (error) {
      showAppError(`Nie udało się odświeżyć listy przesyłek: ${error.message}`);
      return false;
    }
  };

  function showSignedIn(user) {
    loginScreen.hidden = true;
    appContent.hidden = false;
    currentUserName.textContent = user.username;
    loginError.hidden = true;
    loginError.textContent = "";
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginError.hidden = true;
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { user } = await window.shipmentApi.login(loginUsername.value.trim(), loginPassword.value);
      loginPassword.value = "";
      showSignedIn(user);
      try {
        await loadShipments();
      } catch (error) {
        showAppError(`Nie udało się pobrać listy przesyłek: ${error.message}`);
      }
    } catch (error) {
      loginError.textContent = error.message;
      loginError.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", () => runServerAction(async () => {
    await window.shipmentApi.logout();
    shipments = [];
    appContent.hidden = true;
    loginScreen.hidden = false;
    loginForm.reset();
    loginUsername.focus();
  }));

  window.addEventListener("session-expired", () => {
    shipments = [];
    appContent.hidden = true;
    loginScreen.hidden = false;
    loginError.textContent = "Sesja wygasła. Zaloguj się ponownie.";
    loginError.hidden = false;
    loginPassword.value = "";
  });

  function scrollPageTo(targetPosition) {
    if (scrollBehavior === "auto") {
      window.scrollTo({ top: targetPosition, behavior: "auto" });
      return;
    }

    if (scrollAnimationFrame !== null) cancelAnimationFrame(scrollAnimationFrame);
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const startTime = performance.now();
    const duration = 250;

    function animateScroll(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      window.scrollTo(0, startPosition + distance * easedProgress);
      scrollAnimationFrame = progress < 1 ? requestAnimationFrame(animateScroll) : null;
    }

    scrollAnimationFrame = requestAnimationFrame(animateScroll);
  }

  refreshAppButton.addEventListener("click", async () => {
    if (await reloadShipmentList()) showToast("Lista przesyłek została odświeżona.");
  });

  document.getElementById("scrollToTop").addEventListener("click", function () {
    scrollPageTo(0);
  });

  document.getElementById("scrollToBottom").addEventListener("click", function () {
    scrollPageTo(document.documentElement.scrollHeight);
  });

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

  function focusNotesTextarea() {
    if (notesModal.style.display === "none" || notesTextarea.readOnly || notesTextarea.disabled) return;
    notesTextarea.focus();
    const cursorPosition = notesTextarea.value.length;
    notesTextarea.setSelectionRange(cursorPosition, cursorPosition);
  }

  function closeNotesModal() {
    notesModal.style.display = "none";
    notesModal.setAttribute("aria-hidden", "true");
    currentNotesId = null;
  }

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

  function formatShipmentContentsForExport(shipment) {
    const items = Array.isArray(shipment.zawartosc) ? shipment.zawartosc : [];
    return items.map(item => {
      const nazwa = item.nazwa ?? "";
      const ilosc = item.ilosc ?? "";
      const jednostka = item.jednostka ?? "";
      const serial = item.serial ? `, SN: ${item.serial}` : "";
      return `${nazwa} (${ilosc} ${jednostka}${serial})`;
    }).join("; ");
  }

  function parseShipmentContents(value) {
    const rawValue = value == null ? "" : String(value).trim();
    if (!rawValue) return [];

    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          nazwa: String(item?.nazwa ?? "").trim(),
          ilosc: Number(item?.ilosc ?? 0),
          jednostka: String(item?.jednostka ?? "").trim(),
          serial: String(item?.serial ?? "").trim()
        })).filter(item => item.nazwa || item.ilosc || item.jednostka || item.serial);
      }
    } catch {
      // Kontynuuj do parsingu tekstowego.
    }

    return rawValue
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const match = /^(.+?)\s*\((.*)\)$/.exec(part);
        if (!match) {
          return {
            nazwa: part,
            ilosc: 1,
            jednostka: "szt.",
            serial: ""
          };
        }

        const nazwa = match[1].trim();
        const inside = match[2].trim();
        const serialMatch = /,\s*SN:\s*(.+)$/i.exec(inside);
        const serial = serialMatch ? serialMatch[1].trim() : "";
        const quantityPart = serialMatch ? inside.slice(0, serialMatch.index).trim() : inside;
        const qtyMatch = /^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/.exec(quantityPart);

        return {
          nazwa,
          ilosc: qtyMatch ? Number(qtyMatch[1].replace(",", ".")) : 1,
          jednostka: qtyMatch ? qtyMatch[2].trim() || "szt." : "szt.",
          serial
        };
      });
  }

  function exportShipmentsToExcel(rows, fileName) {
    if (!window.XLSX) {
      alert("Nie udało się załadować obsługi plików Excel.");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([excelHeaders, ...rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Przesylki");
    XLSX.writeFile(workbook, fileName, { bookType: "xls" });
  }

  exportExcelButton.addEventListener("click", function () {
    const rows = shipments.map(shipment => [
      shipment.numerId,
      shipment.nazwaSpolki,
      shipment.firma,
      shipment.numerListu,
      shipment.data,
      shipment.odbiorca,
      shipment.nadawca,
      shipment.rodzaj,
      shipment.iloscPrzesylek ?? 1,
      formatShipmentContentsForExport(shipment),
      shipment.zamowienie,
      shipment.projekt || "",
      shipment.status || "na magazynie",
      shipment.odbiorcaPodpis || "",
      shipment.notatki || ""
    ]);

    exportShipmentsToExcel(rows, "magazyn.xls");
  });

  exportVisibleExcelButton.addEventListener("click", function () {
    const visibleIds = Array.from(tableBody.rows)
      .filter(row => row.style.display !== "none")
      .map(row => row.dataset.shipmentId);

    const rows = visibleIds
      .map(id => shipments.find(shipment => String(shipment.id) === id))
      .filter(Boolean)
      .map(shipment => [
        shipment.numerId,
        shipment.nazwaSpolki,
        shipment.firma,
        shipment.numerListu,
        shipment.data,
        shipment.odbiorca,
        shipment.nadawca,
        shipment.rodzaj,
        shipment.iloscPrzesylek ?? 1,
        formatShipmentContentsForExport(shipment),
        shipment.zamowienie,
        shipment.projekt || "",
        shipment.status || "na magazynie",
        shipment.odbiorcaPodpis || "",
        shipment.notatki || ""
      ]);

    if (!rows.length) {
      alert("Brak widocznych przesyłek do eksportu po zastosowanych filtrach.");
      return;
    }

    exportShipmentsToExcel(rows, "magazyn_widok.xls");
  });

  importExcelButton.addEventListener("click", function () {
    importExcelFile.click();
  });

  importExcelFile.addEventListener("change", async function () {
    const file = importExcelFile.files[0];
    if (!file) return;

    try {
      if (file.name !== "magazyn.xls") {
        throw new Error('Nazwa pliku musi być dokładnie „magazyn.xls”.');
      }
      if (!window.XLSX) {
        throw new Error("Nie udało się załadować obsługi plików Excel.");
      }

      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("Plik nie zawiera arkusza.");

      const importedRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
      if (!importedRows.length) throw new Error("Arkusz nie zawiera przesyłek.");
      const requiredHeaders = excelHeaders.filter(header => header !== "Numer ID" && header !== "Nazwa Spółki" && header !== "Ilość przesyłek" && header !== "Adresat" && header !== "Numer projektu" && header !== "Data przyjęcia" && header !== "Imię i nazwisko odbiorcy" && header !== "Notatki");
      const hasRecipientHeader = Object.hasOwn(importedRows[0], "Adresat") || Object.hasOwn(importedRows[0], "Odbiorca");
      const hasReceiptDateHeader = Object.hasOwn(importedRows[0], "Data przyjęcia") || Object.hasOwn(importedRows[0], "Data odbioru");
      if (!requiredHeaders.every(header => Object.hasOwn(importedRows[0], header)) || !hasRecipientHeader || !hasReceiptDateHeader) {
        throw new Error("Arkusz ma nieprawidłowe nagłówki. Użyj pliku wyeksportowanego z tej aplikacji.");
      }

      const allowedStatuses = new Set(["na magazynie", "odebrane", "częściowo odebrane"]);
      const importedShipments = importedRows.map((row, index) => {
        const zawartosc = parseShipmentContents(row["Zawartość"]);
        if (!Array.isArray(zawartosc)) {
          throw new Error(`Nieprawidłowa zawartość przesyłki w wierszu ${index + 2}.`);
        }

        const shipment = {
          numerId: String(row["Numer ID"] ?? "").trim(),
          nazwaSpolki: String(row["Nazwa Spółki"] ?? "").trim(),
          firma: String(row["Firma przewozowa"]).trim(),
          numerListu: String(row["Numer listu"]).trim(),
          data: String(row["Data przyjęcia"] ?? row["Data odbioru"]).trim(),
          odbiorca: String(row["Adresat"] ?? row["Odbiorca"]).trim(),
          nadawca: String(row["Nadawca"]).trim(),
          rodzaj: String(row["Rodzaj przesyłki"]).trim(),
          iloscPrzesylek: row["Ilość przesyłek"] === "" || row["Ilość przesyłek"] == null
            ? 1
            : Number(row["Ilość przesyłek"]),
          zamowienie: String(row["Numer zamówienia"]).trim(),
          projekt: String(row["Numer projektu"] ?? "").trim(),
          odbiorcaPodpis: String(row["Imię i nazwisko odbiorcy"] ?? "").trim(),
          notatki: String(row["Notatki"] ?? "").trim(),
          zawartosc,
          status: String(row.Status).trim()
        };

        if (!shipment.firma || !shipment.numerListu || !shipment.data || !shipment.odbiorca || !shipment.nadawca || !shipment.rodzaj) {
          throw new Error(`Brak wymaganych danych w wierszu ${index + 2}.`);
        }
        if (!allowedStatuses.has(shipment.status)) shipment.status = "na magazynie";
        return shipment;
      });

      if (!confirm(`Import zastąpi wspólną listę wszystkich użytkowników (${shipments.length} przesyłek). Czy na pewno kontynuować?`)) return;
      shipments = await window.shipmentApi.import(importedShipments);
      editId = null;
      editVersion = null;
      form.reset();
      document.getElementById("zawartoscFields").innerHTML = "";
      addZawartoscField();
      document.getElementById("submitButton").textContent = "Dodaj przesyłkę";
      renderShipments();
      alert(`Zaimportowano ${importedShipments.length} przesyłek i zastąpiono bieżącą listę.`);
    } catch (error) {
      alert(`Nie udało się zaimportować pliku: ${error.message}`);
    } finally {
      importExcelFile.value = "";
    }
  });

  function getShipmentNumberClass(shipment) {
    if (shipment.status === "odebrane") return "shipment-number--received";

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shipment.data || "");
    if (!dateMatch) return "";

    const shipmentDate = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    const parsedDate = new Date(shipmentDate);
    if (
      parsedDate.getUTCFullYear() !== Number(dateMatch[1]) ||
      parsedDate.getUTCMonth() !== Number(dateMatch[2]) - 1 ||
      parsedDate.getUTCDate() !== Number(dateMatch[3])
    ) return "";

    const today = new Date();
    const todayDate = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const daysWaiting = Math.floor((todayDate - shipmentDate) / 86400000);
    if (daysWaiting > 14) return "shipment-number--critical";
    if (daysWaiting >= 7) return "shipment-number--overdue";
    return "";
  }

  function renderShipments() {
    tableBody.innerHTML = "";
    const selectedCompany = companySearchFilter.value;
    const companies = Array.from(new Set(
      shipments.map(shipment => shipment.nazwaSpolki?.trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
    companySearchFilter.innerHTML = "";
    const allCompaniesOption = document.createElement("option");
    allCompaniesOption.value = "";
    allCompaniesOption.textContent = "Wszystkie spółki";
    companySearchFilter.appendChild(allCompaniesOption);
    companies.forEach(company => {
      const option = document.createElement("option");
      option.value = company;
      option.textContent = company;
      companySearchFilter.appendChild(option);
    });
    companySearchFilter.value = companies.includes(selectedCompany) ? selectedCompany : "";

    const fragment = document.createDocumentFragment();
    const orderedShipments = shipments.map((shipment, index) => ({ shipment, index }));
    if (shipmentSort.value !== "default") {
      orderedShipments.sort((a, b) => {
        const dateA = Date.parse(`${a.shipment.data}T00:00:00Z`);
        const dateB = Date.parse(`${b.shipment.data}T00:00:00Z`);
        const difference = shipmentSort.value === "oldest" ? dateA - dateB : dateB - dateA;
        return difference || a.index - b.index;
      });
    }

    orderedShipments.forEach(({ shipment, index }) => {
      const tr = document.createElement("tr");
      tr.dataset.shipmentId = String(shipment.id);
      tr.dataset.status = shipment.status || "na magazynie";
      tr.dataset.shipmentDate = shipment.data || "";

      const numberCell = document.createElement("td");
      numberCell.dataset.columnKey = "lp";
      numberCell.className = shipmentNumberColorsToggle.checked ? getShipmentNumberClass(shipment) : "";
      numberCell.textContent = String(index + 1);
      tr.appendChild(numberCell);

      const registerNumberCell = document.createElement("td");
      registerNumberCell.dataset.columnKey = "numerId";
      registerNumberCell.textContent = shipment.numerId ?? "";
      tr.appendChild(registerNumberCell);

      [
        ["firma", shipment.firma],
        ["numerListu", shipment.numerListu],
        ["data", shipment.data],
        ["odbiorca", shipment.odbiorca],
        ["nadawca", shipment.nadawca],
        ["rodzaj", formatShipmentTypeAndQuantity(shipment)]
      ].forEach(([columnKey, value]) => {
        const cell = document.createElement("td");
        cell.dataset.columnKey = columnKey;
        cell.textContent = value ?? "";
        tr.appendChild(cell);
      });

      const contentsCell = document.createElement("td");
      contentsCell.dataset.columnKey = "zawartosc";
      const contentsList = document.createElement("ul");
      (Array.isArray(shipment.zawartosc) ? shipment.zawartosc : []).forEach(item => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.nazwa ?? ""} (${item.ilosc ?? ""} ${item.jednostka ?? ""}${item.serial ? `, SN: ${item.serial}` : ""})`;
        contentsList.appendChild(listItem);
      });
      contentsCell.appendChild(contentsList);
      tr.appendChild(contentsCell);

      const orderCell = document.createElement("td");
      orderCell.dataset.columnKey = "zamowienie";
      orderCell.textContent = shipment.zamowienie ?? "";
      tr.appendChild(orderCell);

      const projectCell = document.createElement("td");
      projectCell.dataset.columnKey = "projekt";
      projectCell.textContent = shipment.projekt ?? "";
      tr.appendChild(projectCell);

      const companyCell = document.createElement("td");
      companyCell.dataset.columnKey = "nazwaSpolki";
      companyCell.textContent = shipment.nazwaSpolki ?? "";
      tr.appendChild(companyCell);

      const actionsCell = document.createElement("td");
      actionsCell.dataset.columnKey = "akcje";
      const actionButtons = document.createElement("div");
      actionButtons.className = "action-buttons";
      const actions = [
        ["Edytuj", "✏️", () => window.editEntry(shipment.id)],
        ["Usuń", "🗑️", () => window.deleteEntry(shipment.id)],
        ["Kopiuj do schowka", "📋", () => copyToClipboard(shipment.id)],
        ["Drukuj potwierdzenie odbioru", "🖨️", () => printReceipt(shipment.id)],
        ["Podpisz", "✍️", () => openSignatureModal(shipment.id)],
        ["Notatki", "📝", () => openNotesModalById(shipment.id)]
      ];
      actions.forEach(([title, icon, handler]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.title = title;
        button.textContent = icon;
        if (title === "Notatki" && shipment.notatki?.trim()) {
          button.classList.add("has-note");
        }
        if (title === "Podpisz" && shipment.odbiorcaPodpis?.trim()) {
          button.classList.add("has-signature");
        }
        button.addEventListener("click", handler);
        actionButtons.appendChild(button);
      });
      actionsCell.appendChild(actionButtons);
      tr.appendChild(actionsCell);

      const statusCell = document.createElement("td");
      statusCell.dataset.columnKey = "status";
      const statusSelect = document.createElement("select");
      [
        { value: "na magazynie", label: "Na magazynie" },
        { value: "odebrane", label: "Odebrane" },
        { value: "częściowo odebrane", label: "Częściowo odebrane" }
      ].forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = tr.dataset.status === value;
        statusSelect.appendChild(option);
      });
      statusSelect.addEventListener("change", () => window.updateStatus(shipment.id, statusSelect.value));
      statusCell.appendChild(statusSelect);
      tr.appendChild(statusCell);
      fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
    applyTableViewSettings();
    applyShipmentFilters();
  }
  renderShipmentList = renderShipments;

  function applyTableViewSettings() {
    tableColumnToggles.forEach(toggle => {
      document.querySelectorAll(`#shipmentsTable [data-column-key="${toggle.dataset.columnKey}"]`)
        .forEach(cell => {
          cell.hidden = !toggle.checked;
        });
    });
  }

  function openNotesModalById(id) {
    const index = shipments.findIndex(shipment => String(shipment.id) === String(id));
    if (index >= 0) openNotesModal(index);
  }

  function applyShipmentFilters() {
    const columnIndexes = {
      numerId: 1,
      firma: 2,
      numerListu: 3,
      odbiorca: 5,
      nadawca: 6,
      zawartosc: 8,
      zamowienie: 9,
      projekt: 10,
      nazwaSpolki: 11
    };
    const activeSearchFilters = Array.from(searchFilters)
      .map(input => ({
        columnIndex: columnIndexes[input.dataset.column],
        query: input.value.trim().toLowerCase(),
        exact: input instanceof HTMLSelectElement
      }))
      .filter(filter => filter.query);
    const globalQuery = globalSearchInput.value.trim().toLowerCase();

    Array.from(tableBody.rows).forEach(row => {
      const statusMatches = statusFilter.value === "all" || row.dataset.status === statusFilter.value;
      const dateMatches = matchesDatePeriod(row.dataset.shipmentDate);
      const globalSearchMatches = !globalQuery || Object.values(columnIndexes).some(columnIndex => {
        const cell = row.cells[columnIndex];
        return cell && cell.textContent.toLowerCase().includes(globalQuery);
      });
      const specificSearchMatches = activeSearchFilters.every(filter => {
        const cell = row.cells[filter.columnIndex];
        if (!cell) return false;
        const value = cell.textContent.trim().toLowerCase();
        return filter.exact ? value === filter.query : value.includes(filter.query);
      });
      const searchMatches = globalSearchMatches && specificSearchMatches;
      row.style.display = statusMatches && dateMatches && searchMatches ? "" : "none";
    });
  }

  function matchesDatePeriod(dateValue) {
    const mode = datePeriodFilter.value;
    if (mode === "all") return true;
    if (!dateValue) return false;

    if (mode === "range") {
      return (!dateFrom.value || dateValue >= dateFrom.value) &&
        (!dateTo.value || dateValue <= dateTo.value);
    }
    if (mode === "month") {
      return !shipmentMonth.value || dateValue.startsWith(shipmentMonth.value);
    }

    const shipmentDate = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(shipmentDate.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (mode === "last-week" ? 6 : 29));
    return shipmentDate >= startDate && shipmentDate <= today;
  }

  window.updateStatus = function(id, value) {
    runServerAction(async () => {
      const shipment = shipments.find(item => String(item.id) === String(id));
      if (!shipment) return;
      const updated = await window.shipmentApi.patch(id, { version: shipment.version, status: value });
      shipments = shipments.map(item => item.id === updated.id ? updated : item);
      renderShipments();
    });
  };

  window.editEntry = function (id) {
    const s = shipments.find(item => String(item.id) === String(id));
    if (!s) return;
    companySelect.required = Boolean(s.nazwaSpolki);
    const knownCompany = Array.from(companySelect.options)
      .some(option => option.value === s.nazwaSpolki && option.value !== "inna");
    companySelect.value = knownCompany || !s.nazwaSpolki ? s.nazwaSpolki : "inna";
    otherCompanyInput.value = knownCompany || !s.nazwaSpolki ? "" : s.nazwaSpolki;
    updateOtherCompanyInput();
    document.getElementById("firma").value = s.firma;
    document.getElementById("numerListu").value = s.numerListu;
    document.getElementById("data").value = s.data;
    document.getElementById("odbiorca").value = s.odbiorca;
    document.getElementById("nadawca").value = s.nadawca;
    document.getElementById("rodzaj").value = s.rodzaj;
    document.getElementById("iloscPrzesylek").value = s.iloscPrzesylek ?? 1;
    document.getElementById("zamowienie").value = s.zamowienie;
    document.getElementById("projekt").value = s.projekt || "";

    const zawartoscContainer = document.getElementById("zawartoscFields");
    zawartoscContainer.innerHTML = "";
    s.zawartosc.forEach(z =>
      addZawartoscField(z.nazwa, z.ilosc, z.jednostka, z.serial)
    );

    editId = s.id;
    editVersion = s.version;
    document.getElementById("submitButton").textContent = "Zapisz zmiany";
    form.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  };

  window.deleteEntry = function (id) {
    if (!confirm("Czy na pewno chcesz usunąć tę przesyłkę?")) return;
    runServerAction(async () => {
      const shipment = shipments.find(item => String(item.id) === String(id));
      if (!shipment) return;
      await window.shipmentApi.remove(id, shipment.version);
      shipments = shipments.filter(item => String(item.id) !== String(id));
      renderShipments();
      showToast("Paczka została usunięta.", "danger");
    });
  };

  document.getElementById("numerListu").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.getElementById("data").focus();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    runServerAction(async () => {
      const newShipment = {
        nazwaSpolki: companySelect.value === "inna"
          ? otherCompanyInput.value.trim()
          : companySelect.value,
        firma: document.getElementById("firma").value.trim(),
        numerListu: document.getElementById("numerListu").value.trim(),
        data: document.getElementById("data").value,
        odbiorca: document.getElementById("odbiorca").value.trim(),
        nadawca: document.getElementById("nadawca").value.trim(),
        rodzaj: document.getElementById("rodzaj").value,
        iloscPrzesylek: Number(document.getElementById("iloscPrzesylek").value),
        zamowienie: document.getElementById("zamowienie").value.trim(),
        projekt: document.getElementById("projekt").value.trim(),
        zawartosc: Array.from(document.querySelectorAll(".zawartosc-item")).map(row => {
          const inputs = row.querySelectorAll("input, select");
          return {
            nazwa: inputs[0].value.trim(),
            ilosc: Number.parseInt(inputs[1].value, 10),
            jednostka: inputs[2].value,
            serial: inputs[3].value.trim()
          };
        })
      };

      if (editId !== null) {
        const existing = shipments.find(shipment => shipment.id === editId);
        if (!existing) throw new Error("Nie znaleziono edytowanej przesyłki. Odśwież listę.");
        const updated = await window.shipmentApi.update(editId, {
          ...newShipment,
          status: existing.status,
          odbiorcaPodpis: existing.odbiorcaPodpis,
          notatki: existing.notatki,
          version: editVersion
        });
        shipments = shipments.map(shipment => shipment.id === updated.id ? updated : shipment);
        editId = null;
        editVersion = null;
        document.getElementById("submitButton").textContent = "Dodaj przesyłkę";
      } else {
        shipments.push(await window.shipmentApi.create(newShipment));
      }

      form.reset();
      companySelect.required = true;
      updateOtherCompanyInput();
      document.getElementById("zawartoscFields").innerHTML = "";
      addZawartoscField();
      renderShipments();
    });
  });

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

  addZawartoscField();
  loginUsername.focus();

  window.shipmentApi.session().then(async ({ user }) => {
    if (!user) return;
    showSignedIn(user);
    try {
      await loadShipments();
    } catch (error) {
      showAppError(`Nie udało się pobrać listy przesyłek: ${error.message}`);
    }
  }).catch(error => {
    loginError.textContent = `Nie udało się połączyć z serwerem: ${error.message}`;
    loginError.hidden = false;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      showAppError(`Nie udało się zaktualizować obsługi pamięci podręcznej: ${error.message}`);
    });
  }

  window.setInterval(() => {
    if (!document.hidden && !appContent.hidden) reloadShipmentList();
  }, 30_000);
});

// Funkcja kopiująca dane jednego rekordu do schowka
function copyToClipboard(id) {
  const entry = shipments.find(shipment => String(shipment.id) === String(id));
  if (!entry) return;
  const contents = Array.isArray(entry.zawartosc) ? entry.zawartosc : [];

  const zawartoscHTML = `
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse: collapse; font-family: Arial; font-size: 14px;">
      <tr style="background-color: #f0f0f0;">
        <th>Nazwa</th>
        <th>Ilość</th>
        <th>Jednostka</th>
        <th>Numer seryjny</th>
      </tr>
      ${contents.map(z => `
        <tr>
          <td>${escapeHTML(z.nazwa)}</td>
          <td>${escapeHTML(z.ilosc)}</td>
          <td>${escapeHTML(z.jednostka)}</td>
          <td>${escapeHTML(z.serial)}</td>
        </tr>
      `).join("")}
    </table>
  `;

  const html = `
    <table border="0" cellpadding="5" cellspacing="0" style="font-family: Arial; font-size: 14px;">
      <tr><th align="left">Firma przewozowa</th><td>${escapeHTML(entry.firma)}</td></tr>
      <tr><th align="left">Numer listu przewozowego</th><td>${escapeHTML(entry.numerListu)}</td></tr>
      <tr><th align="left">Data przyjęcia</th><td>${escapeHTML(entry.data)}</td></tr>
      <tr><th align="left">Adresat</th><td>${escapeHTML(entry.odbiorca)}</td></tr>
      <tr><th align="left">Nadawca</th><td>${escapeHTML(entry.nadawca)}</td></tr>
      <tr><th align="left">Rodzaj przesyłki</th><td>${escapeHTML(formatShipmentTypeAndQuantity(entry))}</td></tr>
      <tr><th align="left">Zawartość</th><td>${zawartoscHTML}</td></tr>
      <tr><th align="left">Numer zamówienia</th><td>${escapeHTML(entry.zamowienie)}</td></tr>
      <tr><th align="left">Numer projektu</th><td>${escapeHTML(entry.projekt)}</td></tr>
    </table>
  `;
  const plainText = [
    `Firma przewozowa: ${entry.firma || ""}`,
    `Numer listu przewozowego: ${entry.numerListu || ""}`,
    `Data przyjęcia: ${entry.data || ""}`,
    `Adresat: ${entry.odbiorca || ""}`,
    `Nadawca: ${entry.nadawca || ""}`,
    `Rodzaj przesyłki: ${formatShipmentTypeAndQuantity(entry)}`,
    "Zawartość:",
    ...contents.map(item => `${item.nazwa || ""} (${item.ilosc || ""} ${item.jednostka || ""}${item.serial ? `, SN: ${item.serial}` : ""})`),
    `Numer zamówienia: ${entry.zamowienie || ""}`,
    `Numer projektu: ${entry.projekt || ""}`
  ].join("\n");

  const listener = (e) => {
    e.preventDefault();
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", plainText);
  };

  document.addEventListener("copy", listener);
  let copied;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", listener);
  }
  showToast(
    copied ? "Dane przesyłki skopiowano do schowka." : "Nie udało się skopiować danych do schowka.",
    copied ? "success" : "error"
  );
}

function printReceipt(id) {
  const entry = shipments.find(shipment => String(shipment.id) === String(id));
  if (!entry) return;

  const contents = Array.isArray(entry.zawartosc) ? entry.zawartosc : [];
  const contentsHTML = `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <tr style="background-color: #f0f0f0;">
        <th>Nazwa</th><th>Ilość</th><th>Jednostka</th><th>Numer seryjny</th>
      </tr>
      ${contents.map(item => `
        <tr>
          <td>${escapeHTML(item.nazwa)}</td>
          <td>${escapeHTML(item.ilosc)}</td>
          <td>${escapeHTML(item.jednostka)}</td>
          <td>${escapeHTML(item.serial)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  const details = [
    ["Numer ID", entry.numerId],
    ["Firma przewozowa", entry.firma],
    ["Numer listu przewozowego", entry.numerListu],
    ["Data przyjęcia", entry.data],
    ["Adresat", entry.odbiorca],
    ["Nadawca", entry.nadawca],
    ["Rodzaj przesyłki", formatShipmentTypeAndQuantity(entry)],
    ["Zawartość", contentsHTML],
    ["Numer zamówienia", entry.zamowienie],
    ["Numer projektu", entry.projekt]
  ];
  const html = `
    <!DOCTYPE html>
    <html lang="pl">
      <head>
        <meta charset="utf-8">
        <title>Potwierdzenie odbioru</title>
      </head>
      <body style="font-family: Arial, sans-serif; font-size: 11pt;">
        <h1 style="text-align: center; font-size: 18pt; margin-bottom: 48px;">Potwierdzenie odbioru</h1>
        <table border="0" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          ${details.map(([label, value]) => `
            <tr>
              <th align="left" valign="top" style="width: 30%;">${label}</th>
              <td>${label === "Zawartość" ? value : escapeHTML(value)}</td>
            </tr>
          `).join("")}
        </table>
        <table border="0" cellpadding="12" cellspacing="0" style="margin-top: 110px; width: 100%; text-align: center;">
          <tr>
            <td style="width: 38%; vertical-align: top;">
              <div style="height: 55px; border-bottom: 1px solid #000;"></div>
              <p>Wystawił</p>
            </td>
            <td style="width: 24%; vertical-align: top;">&nbsp;</td>
            <td style="width: 38%; vertical-align: top;">
              <div style="height: 55px; border-bottom: 1px solid #000;"></div>
              <p>Odebrał</p>
              <div style="height: 35px; margin-top: 30px; border-bottom: 1px solid #000;"></div>
              <p>Data odbioru</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Nie udało się otworzyć okna wydruku.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}

function escapeHTML(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, character => entities[character]);
}

function formatShipmentTypeAndQuantity(shipment) {
  const type = String(shipment.rodzaj ?? "").toLocaleLowerCase("pl-PL");
  const capitalizedType = type.charAt(0).toLocaleUpperCase("pl-PL") + type.slice(1);
  return `${capitalizedType}, ${shipment.iloscPrzesylek ?? 1} szt.`;
}

function addZawartoscField(nazwa = "", ilosc = "", jednostka = "szt.", serial = "") {
  const container = document.getElementById("zawartoscFields");
  const tr = document.createElement("tr");
  tr.className = "zawartosc-item";

  const nameCell = document.createElement("td");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "nazwa";
  nameInput.value = nazwa;
  nameInput.placeholder = "Nazwa";
  nameInput.required = true;
  nameCell.appendChild(nameInput);

  const quantityCell = document.createElement("td");
  const quantityInput = document.createElement("input");
  quantityInput.type = "number";
  quantityInput.name = "ilosc";
  quantityInput.value = ilosc;
  quantityInput.min = "1";
  quantityInput.placeholder = "Ilość";
  quantityInput.required = true;
  quantityCell.appendChild(quantityInput);

  const unitCell = document.createElement("td");
  const unitSelect = document.createElement("select");
  unitSelect.name = "jednostka";
  ["szt.", "opk.", "mb", "kpl."].forEach(unit => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    option.selected = unit === jednostka;
    unitSelect.appendChild(option);
  });
  unitCell.appendChild(unitSelect);

  const serialCell = document.createElement("td");
  const serialInput = document.createElement("input");
  serialInput.type = "text";
  serialInput.name = "serial";
  serialInput.value = serial;
  serialInput.placeholder = "Numer seryjny";
  serialInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (serialInput.value && !serialInput.value.endsWith(", ")) {
      serialInput.value += ", ";
    }
  });
  serialCell.appendChild(serialInput);

  const removeCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-item-button";
  removeButton.textContent = "X";
  removeButton.title = "Usuń pozycję";
  removeButton.setAttribute("aria-label", "Usuń pozycję");
  removeButton.addEventListener("click", () => tr.remove());
  removeCell.appendChild(removeButton);

  tr.append(nameCell, quantityCell, unitCell, serialCell, removeCell);
  container.appendChild(tr);
}

// ------------------------
// OBSŁUGA PODPISU (MODAL)
// ------------------------

function openSignatureModal(id) {
  const shipment = shipments.find(item => String(item.id) === String(id));
  if (!shipment) return;

  currentSignatureId = shipment.id;
  recipientNameInput.value = shipment.odbiorcaPodpis || "";
  document.getElementById("signatureModal").style.display = "block";
  recipientNameInput.focus();
  recipientNameInput.select();
}

function closeSignatureModal() {
  document.getElementById("signatureModal").style.display = "none";
  currentSignatureId = null;
}

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
