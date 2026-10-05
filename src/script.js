const storage = window.electronBridge?.storage || window.localStorage;
let currentSignatureIndex = null;
const recipientNameInput = document.getElementById("recipientNameInput");

recipientNameInput.addEventListener("click", () => recipientNameInput.focus());
recipientNameInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveSignature(false);
});

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("shipmentForm");
  const tableBody = document.querySelector("#shipmentsTable tbody");
  const searchInput = document.getElementById("searchInput");
  const resetFiltersButton = document.getElementById("resetFiltersButton");
  const searchColumns = document.querySelectorAll(".search-col");
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
  const excelHeaders = [
    "Firma przewozowa", "Numer listu", "Data przyjęcia", "Adresat", "Nadawca",
    "Rodzaj przesyłki", "Zawartość", "Numer zamówienia", "Numer projektu", "Status",
    "Imię i nazwisko odbiorcy", "Notatki"
  ];
  const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  let editIndex = null;
  let currentNotesIndex = null;
  let scrollAnimationFrame = null;

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
    if (!confirm("Odświeżyć aplikację? Niezapisane dane formularza zostaną utracone.")) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    } catch {}
    window.location.reload();
  });

  document.getElementById("scrollToTop").addEventListener("click", function () {
    scrollPageTo(0);
  });

  document.getElementById("scrollToBottom").addEventListener("click", function () {
    scrollPageTo(document.documentElement.scrollHeight);
  });

  function openNotesModal(index) {
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    const shipment = shipments[index];
    if (!shipment) return;

    currentNotesIndex = index;
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
    currentNotesIndex = null;
  }

  window.addEventListener("focus", focusNotesTextarea);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) focusNotesTextarea();
  });

  notesSaveButton.addEventListener("click", function () {
    if (currentNotesIndex === null) return;
    const note = notesTextarea.value.trim();
    if (!note) {
      alert("Wpisz treść notatki przed zapisaniem.");
      notesTextarea.focus();
      return;
    }

    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    if (!shipments[currentNotesIndex]) return;
    shipments[currentNotesIndex].notatki = note;
    storage.setItem("shipments", JSON.stringify(shipments));
    renderShipments();
    closeNotesModal();
  });

  notesEditButton.addEventListener("click", function () {
    if (currentNotesIndex === null) return;
    notesTextarea.readOnly = false;
    focusNotesTextarea();
  });

  notesDeleteButton.addEventListener("click", function () {
    if (currentNotesIndex === null || !confirm("Czy na pewno usunąć tę notatkę?")) return;
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    if (shipments[currentNotesIndex]) {
      shipments[currentNotesIndex].notatki = "";
      storage.setItem("shipments", JSON.stringify(shipments));
      renderShipments();
    }
    closeNotesModal();
  });

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
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    const rows = shipments.map(shipment => [
      shipment.firma,
      shipment.numerListu,
      shipment.data,
      shipment.odbiorca,
      shipment.nadawca,
      shipment.rodzaj,
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
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    const visibleIndices = Array.from(tableBody.rows)
      .filter(row => row.style.display !== "none")
      .map(row => Number(row.dataset.shipmentIndex));

    const rows = visibleIndices
      .map(index => shipments[index])
      .filter(Boolean)
      .map(shipment => [
        shipment.firma,
        shipment.numerListu,
        shipment.data,
        shipment.odbiorca,
        shipment.nadawca,
        shipment.rodzaj,
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
      const requiredHeaders = excelHeaders.filter(header => header !== "Adresat" && header !== "Numer projektu" && header !== "Data przyjęcia" && header !== "Imię i nazwisko odbiorcy" && header !== "Notatki");
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
          firma: String(row["Firma przewozowa"]).trim(),
          numerListu: String(row["Numer listu"]).trim(),
          data: String(row["Data przyjęcia"] ?? row["Data odbioru"]).trim(),
          odbiorca: String(row["Adresat"] ?? row["Odbiorca"]).trim(),
          nadawca: String(row["Nadawca"]).trim(),
          rodzaj: String(row["Rodzaj przesyłki"]).trim(),
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

      storage.setItem("shipments", JSON.stringify(importedShipments));
      renderShipments();
      searchInput.dispatchEvent(new Event("input"));
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
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    tableBody.innerHTML = "";
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
      tr.dataset.shipmentIndex = String(index);
      tr.dataset.status = shipment.status || "na magazynie";
      tr.dataset.shipmentDate = shipment.data || "";

      const numberCell = document.createElement("td");
      numberCell.className = getShipmentNumberClass(shipment);
      numberCell.textContent = String(index + 1);
      tr.appendChild(numberCell);

      [shipment.firma, shipment.numerListu, shipment.data, shipment.odbiorca, shipment.nadawca, shipment.rodzaj]
        .forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value ?? "";
          tr.appendChild(cell);
        });

      const contentsCell = document.createElement("td");
      const contentsList = document.createElement("ul");
      (Array.isArray(shipment.zawartosc) ? shipment.zawartosc : []).forEach(item => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.nazwa ?? ""} (${item.ilosc ?? ""} ${item.jednostka ?? ""}${item.serial ? `, SN: ${item.serial}` : ""})`;
        contentsList.appendChild(listItem);
      });
      contentsCell.appendChild(contentsList);
      tr.appendChild(contentsCell);

      const orderCell = document.createElement("td");
      orderCell.textContent = shipment.zamowienie ?? "";
      tr.appendChild(orderCell);

      const projectCell = document.createElement("td");
      projectCell.textContent = shipment.projekt ?? "";
      tr.appendChild(projectCell);

      const actionsCell = document.createElement("td");
      const actionButtons = document.createElement("div");
      actionButtons.className = "action-buttons";
      const actions = [
        ["Edytuj", "✏️", () => window.editEntry(index)],
        ["Usuń", "🗑️", () => window.deleteEntry(index)],
        ["Kopiuj do schowka", "📋", () => copyToClipboard(index)],
        ["Drukuj potwierdzenie odbioru", "🖨️", () => printReceipt(index)],
        ["Podpisz", "✍️", () => openSignatureModal(index)],
        ["Notatki", "📝", () => openNotesModal(index)]
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
      statusSelect.addEventListener("change", () => window.updateStatus(index, statusSelect.value));
      statusCell.appendChild(statusSelect);
      tr.appendChild(statusCell);
      tableBody.appendChild(tr);
    });
    applyShipmentFilters();
  }

  function applyShipmentFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const activeCols = Array.from(searchColumns)
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
    const columnIndexes = {
      firma: 1,
      numerListu: 2,
      data: 3,
      odbiorca: 4,
      nadawca: 5,
      rodzaj: 6,
      zawartosc: 7,
      zamowienie: 8,
      projekt: 9
    };

    Array.from(tableBody.rows).forEach(row => {
      const statusMatches = statusFilter.value === "all" || row.dataset.status === statusFilter.value;
      const dateMatches = matchesDatePeriod(row.dataset.shipmentDate);
      const searchMatches = !query || activeCols.some(column => {
        const cell = row.cells[columnIndexes[column]];
        return cell && cell.textContent.toLowerCase().includes(query);
      });
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

  window.updateStatus = function(index, value) {
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    if (shipments[index]) {
      shipments[index].status = value;
      storage.setItem("shipments", JSON.stringify(shipments));
      renderShipments();
      searchInput.dispatchEvent(new Event("input"));
    }
  };

  window.editEntry = function (index) {
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    const s = shipments[index];
    document.getElementById("firma").value = s.firma;
    document.getElementById("numerListu").value = s.numerListu;
    document.getElementById("data").value = s.data;
    document.getElementById("odbiorca").value = s.odbiorca;
    document.getElementById("nadawca").value = s.nadawca;
    document.getElementById("rodzaj").value = s.rodzaj;
    document.getElementById("zamowienie").value = s.zamowienie;
    document.getElementById("projekt").value = s.projekt || "";

    const zawartoscContainer = document.getElementById("zawartoscFields");
    zawartoscContainer.innerHTML = "";
    s.zawartosc.forEach(z =>
      addZawartoscField(z.nazwa, z.ilosc, z.jednostka, z.serial)
    );

    editIndex = index;
    document.getElementById("submitButton").textContent = "Zapisz zmiany";
    form.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  };

  window.deleteEntry = function (index) {
    if (!confirm("Czy na pewno chcesz usunąć tę przesyłkę?")) return;
    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    shipments.splice(index, 1);
    storage.setItem("shipments", JSON.stringify(shipments));
    renderShipments();
  };

  document.getElementById("numerListu").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.getElementById("data").focus();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const firma = document.getElementById("firma").value.trim();
    const numerListu = document.getElementById("numerListu").value.trim();
    const data = document.getElementById("data").value;
    const odbiorca = document.getElementById("odbiorca").value.trim();
    const nadawca = document.getElementById("nadawca").value.trim();
    const rodzaj = document.getElementById("rodzaj").value;
    const zamowienie = document.getElementById("zamowienie").value.trim();
    const projekt = document.getElementById("projekt").value.trim();

    const zawartosc = Array.from(document.querySelectorAll(".zawartosc-item")).map(row => {
      const inputs = row.querySelectorAll("input, select");
      return {
        nazwa: inputs[0].value.trim(),
        ilosc: parseInt(inputs[1].value),
        jednostka: inputs[2].value,
        serial: inputs[3].value.trim()
      };
    });

    const shipments = JSON.parse(storage.getItem("shipments") || "[]");
    const existingShipment = editIndex !== null ? shipments[editIndex] : null;
    const newShipment = {
      firma,
      numerListu,
      data,
      odbiorca,
      nadawca,
      rodzaj,
      zamowienie,
      projekt,
      zawartosc,
      odbiorcaPodpis: existingShipment?.odbiorcaPodpis || "",
      notatki: existingShipment?.notatki || "",
      status: existingShipment?.status || "na magazynie"
    };

    if (editIndex !== null) {
      shipments[editIndex] = newShipment;
      editIndex = null;
      document.getElementById("submitButton").textContent = "Dodaj przesyłkę";
    } else {
      shipments.push(newShipment);
    }

    storage.setItem("shipments", JSON.stringify(shipments));
    form.reset();
    document.getElementById("zawartoscFields").innerHTML = "";
    renderShipments();
  });

  function resetShipmentFilters() {
    searchInput.value = "";
    statusFilter.value = "all";
    shipmentSort.value = "default";
    datePeriodFilter.value = "all";
    dateFrom.value = "";
    dateTo.value = "";
    shipmentMonth.value = "";
    dateRangeControls.hidden = true;
    monthControls.hidden = true;
    searchColumns.forEach(checkbox => {
      checkbox.checked = true;
    });
    renderShipments();
    applyShipmentFilters();
  }

  searchInput.addEventListener("input", applyShipmentFilters);
  searchColumns.forEach(checkbox => checkbox.addEventListener("change", applyShipmentFilters));
  statusFilter.addEventListener("change", applyShipmentFilters);
  shipmentSort.addEventListener("change", renderShipments);
  resetFiltersButton.addEventListener("click", resetShipmentFilters);
  datePeriodFilter.addEventListener("change", function () {
    dateRangeControls.hidden = this.value !== "range";
    monthControls.hidden = this.value !== "month";
    applyShipmentFilters();
  });
  [dateFrom, dateTo, shipmentMonth].forEach(input => input.addEventListener("change", applyShipmentFilters));

  renderShipments();
  addZawartoscField();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
});

// Funkcja kopiująca dane jednego rekordu do schowka
function copyToClipboard(index) {
  const shipments = JSON.parse(storage.getItem("shipments") || "[]");
  const entry = shipments[index];
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
      <tr><th align="left">Rodzaj przesyłki</th><td>${escapeHTML(entry.rodzaj)}</td></tr>
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
    `Rodzaj przesyłki: ${entry.rodzaj || ""}`,
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
  document.execCommand("copy");
  document.removeEventListener("copy", listener);

  alert("Dane przesyłki zostały skopiowane do schowka.");
}

function printReceipt(index) {
  const shipments = JSON.parse(storage.getItem("shipments") || "[]");
  const entry = shipments[index];
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
    ["Firma przewozowa", entry.firma],
    ["Numer listu przewozowego", entry.numerListu],
    ["Data odbioru", entry.data],
    ["Adresat", entry.odbiorca],
    ["Nadawca", entry.nadawca],
    ["Rodzaj przesyłki", entry.rodzaj],
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

function openSignatureModal(index) {
  const shipments = JSON.parse(storage.getItem("shipments") || "[]");
  const shipment = shipments[index];
  if (!shipment) return;

  currentSignatureIndex = index;
  recipientNameInput.value = shipment.odbiorcaPodpis || "";
  document.getElementById("signatureModal").style.display = "block";
  recipientNameInput.focus();
  recipientNameInput.select();
}

function closeSignatureModal() {
  document.getElementById("signatureModal").style.display = "none";
  currentSignatureIndex = null;
}

function saveSignature(showConfirmation = true) {
  const recipientName = document.getElementById("recipientNameInput").value.trim();
  if (!recipientName) {
    alert("Wpisz imię i nazwisko odbiorcy.");
    document.getElementById("recipientNameInput").focus();
    return;
  }

  const shipments = JSON.parse(storage.getItem("shipments") || "[]");
  if (currentSignatureIndex !== null && shipments[currentSignatureIndex]) {
    shipments[currentSignatureIndex].odbiorcaPodpis = recipientName;
    delete shipments[currentSignatureIndex].signature;
    storage.setItem("shipments", JSON.stringify(shipments));
    if (showConfirmation) alert("Dane odbiorcy zostały zapisane.");
  } else {
    return;
  }

  closeSignatureModal();
  renderShipments();
}
