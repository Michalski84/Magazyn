document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("shipmentForm");
  const tableBody = document.querySelector("#shipmentsTable tbody");
  const searchInput = document.getElementById("searchInput");
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
  const importExcelButton = document.getElementById("importExcelButton");
  const importExcelFile = document.getElementById("importExcelFile");
  const excelHeaders = [
    "Firma przewozowa", "Numer listu", "Data odbioru", "Adresat", "Nadawca",
    "Rodzaj przesyłki", "Zawartość", "Numer zamówienia", "Numer projektu", "Status"
  ];
  const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  let editIndex = null;
  let currentSignatureIndex = null;
  let previewSignatureIndex = null;

  document.getElementById("scrollToTop").addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  });

  document.getElementById("scrollToBottom").addEventListener("click", function () {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrollBehavior });
  });

  exportExcelButton.addEventListener("click", function () {
    if (!window.XLSX) {
      alert("Nie udało się załadować obsługi plików Excel.");
      return;
    }

    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
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
        JSON.stringify(shipment.zawartosc || []),
        shipment.zamowienie,
        shipment.projekt || "",
        shipment.status || "na magazynie"
      ]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([excelHeaders, ...rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Przesylki");
    XLSX.writeFile(workbook, "magazyn.xls", { bookType: "xls" });
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
      const requiredHeaders = excelHeaders.filter(header => header !== "Adresat" && header !== "Numer projektu");
      const hasRecipientHeader = Object.hasOwn(importedRows[0], "Adresat") || Object.hasOwn(importedRows[0], "Odbiorca");
      if (!requiredHeaders.every(header => Object.hasOwn(importedRows[0], header)) || !hasRecipientHeader) {
        throw new Error("Arkusz ma nieprawidłowe nagłówki. Użyj pliku wyeksportowanego z tej aplikacji.");
      }

      const allowedStatuses = new Set(["na magazynie", "odebrane", "częściowo odebrane"]);
      const importedShipments = importedRows.map((row, index) => {
        let zawartosc;
        try {
          zawartosc = JSON.parse(String(row["Zawartość"] || "[]"));
        } catch {
          throw new Error(`Nieprawidłowa zawartość przesyłki w wierszu ${index + 2}.`);
        }
        if (!Array.isArray(zawartosc)) {
          throw new Error(`Nieprawidłowa zawartość przesyłki w wierszu ${index + 2}.`);
        }

        const shipment = {
          firma: String(row["Firma przewozowa"]).trim(),
          numerListu: String(row["Numer listu"]).trim(),
          data: String(row["Data odbioru"]).trim(),
          odbiorca: String(row["Adresat"] ?? row["Odbiorca"]).trim(),
          nadawca: String(row["Nadawca"]).trim(),
          rodzaj: String(row["Rodzaj przesyłki"]).trim(),
          zamowienie: String(row["Numer zamówienia"]).trim(),
          projekt: String(row["Numer projektu"] ?? "").trim(),
          zawartosc,
          status: String(row.Status).trim()
        };

        if (!shipment.firma || !shipment.numerListu || !shipment.data || !shipment.odbiorca || !shipment.nadawca || !shipment.rodzaj) {
          throw new Error(`Brak wymaganych danych w wierszu ${index + 2}.`);
        }
        if (!allowedStatuses.has(shipment.status)) shipment.status = "na magazynie";
        return shipment;
      });

      const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
      localStorage.setItem("shipments", JSON.stringify([...shipments, ...importedShipments]));
      renderShipments();
      searchInput.dispatchEvent(new Event("input"));
      alert(`Zaimportowano ${importedShipments.length} przesyłek.`);
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
    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
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
      const actions = [
        ["Edytuj", "✏️", () => window.editEntry(index)],
        ["Usuń", "🗑️", () => window.deleteEntry(index)],
        ["Kopiuj do schowka", "📋", () => copyToClipboard(index)],
        ["Podpisz", "✍️", () => openSignatureModal(index)]
      ];
      actions.forEach(([title, icon, handler]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.title = title;
        button.textContent = icon;
        button.addEventListener("click", handler);
        actionsCell.appendChild(button);
      });
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
      if (shipment.signature) {
        const signatureButton = document.createElement("button");
        signatureButton.type = "button";
        signatureButton.title = "Pokaż podpis";
        signatureButton.textContent = "🖼️";
        signatureButton.addEventListener("click", () => window.showFullSignature(index));
        statusCell.appendChild(signatureButton);
      }
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
    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
    if (shipments[index]) {
      shipments[index].status = value;
      localStorage.setItem("shipments", JSON.stringify(shipments));
      renderShipments();
      searchInput.dispatchEvent(new Event("input"));
    }
  };

  window.showFullSignature = function(index) {
    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
    const img = document.getElementById("fullSignatureImg");
    if (shipments[index] && shipments[index].signature) {
      img.src = shipments[index].signature;
      document.getElementById("fullSignatureModal").style.display = "block";
    }
  };

  window.closeFullSignatureModal = function() {
    document.getElementById("fullSignatureModal").style.display = "none";
  };

  window.editEntry = function (index) {
    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
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
    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
    shipments.splice(index, 1);
    localStorage.setItem("shipments", JSON.stringify(shipments));
    renderShipments();
  };

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

    const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
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
      status: existingShipment?.status || "na magazynie"
    };

    if (editIndex !== null) {
      newShipment.signature = existingShipment.signature || null;
      shipments[editIndex] = newShipment;
      editIndex = null;
      document.getElementById("submitButton").textContent = "Dodaj przesyłkę";
    } else {
      shipments.push(newShipment);
    }

    localStorage.setItem("shipments", JSON.stringify(shipments));
    form.reset();
    document.getElementById("zawartoscFields").innerHTML = "";
    renderShipments();
  });

  searchInput.addEventListener("input", applyShipmentFilters);
  searchColumns.forEach(checkbox => checkbox.addEventListener("change", applyShipmentFilters));
  statusFilter.addEventListener("change", applyShipmentFilters);
  shipmentSort.addEventListener("change", renderShipments);
  datePeriodFilter.addEventListener("change", function () {
    dateRangeControls.hidden = this.value !== "range";
    monthControls.hidden = this.value !== "month";
    applyShipmentFilters();
  });
  [dateFrom, dateTo, shipmentMonth].forEach(input => input.addEventListener("change", applyShipmentFilters));

  renderShipments();
  addZawartoscField(); // Dodaj jedno puste pole domyślnie
});

// Funkcja kopiująca dane jednego rekordu do schowka
function copyToClipboard(index) {
  const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
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
      <tr><th align="left">Data odbioru</th><td>${escapeHTML(entry.data)}</td></tr>
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
    `Data odbioru: ${entry.data || ""}`,
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
  serialCell.appendChild(serialInput);

  const removeCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "❌";
  removeButton.addEventListener("click", () => tr.remove());
  removeCell.appendChild(removeButton);

  tr.append(nameCell, quantityCell, unitCell, serialCell, removeCell);
  container.appendChild(tr);
}

// ------------------------
// OBSŁUGA PODPISU (MODAL)
// ------------------------

function openSignatureModal(index) {
  currentSignatureIndex = index;
  document.getElementById("signatureModal").style.display = "block";
  resizeSignatureCanvas();
}

function closeSignatureModal() {
  document.getElementById("signatureModal").style.display = "none";
  clearSignature();
}

const canvas = document.getElementById("signatureCanvas");
const ctx = canvas.getContext("2d");
ctx.lineWidth = 2;         // 👈 tutaj ustalasz grubość linii
ctx.lineCap = "round";     // zaokrąglenie końców linii (polecam!)
ctx.strokeStyle = "#000";  // kolor linii
let drawing = false;

function resizeSignatureCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = 300;
}

window.addEventListener("resize", resizeSignatureCanvas);
window.addEventListener("load", resizeSignatureCanvas);

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", () => drawing = false);
canvas.addEventListener("mouseout", () => drawing = false);
canvas.addEventListener("touchstart", startDraw);
canvas.addEventListener("touchmove", drawTouch);
canvas.addEventListener("touchend", () => drawing = false);

function startDraw(e) {
  drawing = true;
  ctx.beginPath();
  ctx.moveTo(getX(e), getY(e));
  e.preventDefault();
}

function draw(e) {
  if (!drawing) return;
  ctx.lineTo(getX(e), getY(e));
  ctx.stroke();
  e.preventDefault();
}

function drawTouch(e) {
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent("mousemove", {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  draw(mouseEvent);
}

function getX(e) {
  return e.clientX ? e.clientX - canvas.getBoundingClientRect().left : e.touches[0].clientX - canvas.getBoundingClientRect().left;
}

function getY(e) {
  return e.clientY ? e.clientY - canvas.getBoundingClientRect().top : e.touches[0].clientY - canvas.getBoundingClientRect().top;
}

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function saveSignature() {
  const dataURL = canvas.toDataURL("image/png");

  const shipments = JSON.parse(localStorage.getItem("shipments") || "[]");
  if (currentSignatureIndex !== null && shipments[currentSignatureIndex]) {
    shipments[currentSignatureIndex].signature = dataURL;
    localStorage.setItem("shipments", JSON.stringify(shipments));
    alert("Podpis został zapisany.");
  }

  closeSignatureModal();
  renderShipments();
}
