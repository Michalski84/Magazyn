// Eksport i import przesyłek z plików Excel.
// Zamienia zawartość przesyłki na tekst do kolumny „Zawartość” w pliku Excel.
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

// Odczytuje zawartość przesyłki z komórki Excela (JSON lub zapis tekstowy).
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

// Zapisuje wiersze przesyłek do pliku Excel o podanej nazwie.
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

// Podłącza przyciski eksportu i importu Excela.
function initExcel() {
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
}
