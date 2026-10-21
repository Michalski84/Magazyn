// Formularz przesyłki: dodawanie, edycja, usuwanie, zmiana statusu i pozycje zawartości.
// Pokazuje pole własnej nazwy spółki tylko po wybraniu opcji „inna”.
function updateOtherCompanyInput() {
  const isOtherCompany = companySelect.value === "inna";
  otherCompanyContainer.hidden = !isOtherCompany;
  otherCompanyInput.required = isOtherCompany;
  if (!isOtherCompany) otherCompanyInput.value = "";
}

// Dodaje wiersz pozycji zawartości (nazwa, ilość, jednostka, numer seryjny) do formularza.
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

// Podłącza formularz przesyłki oraz akcje edycji, usuwania i zmiany statusu w tabeli.
function initForm() {
  // Pole „inna spółka” i dodawanie pozycji zawartości.

  companySelect.addEventListener("change", updateOtherCompanyInput);
  companySelect.addEventListener("change", () => {
    companySelect.required = true;
  });

  addZawartoscButton.addEventListener("click", () => addZawartoscField());

  // Zmiana statusu przesyłki (wywoływana z tabeli).

  window.updateStatus = function(id, value) {
    runServerAction(async () => {
      const shipment = shipments.find(item => String(item.id) === String(id));
      if (!shipment) return;
      const updated = await window.shipmentApi.patch(id, { version: shipment.version, status: value });
      shipments = shipments.map(item => item.id === updated.id ? updated : item);
      renderShipments();
    });
  };

  // Wczytanie przesyłki do formularza w celu edycji.

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
    document.getElementById("shipmentWarehouseSelect").value = s.warehouseId ? "main" : (s.bezMagazynu ? "none" : "main");

    const zawartoscContainer = document.getElementById("zawartoscFields");
    zawartoscContainer.innerHTML = "";
    s.zawartosc.forEach(z =>
      addZawartoscField(z.nazwa, z.ilosc, z.jednostka, z.serial)
    );

    editId = s.id;
    editVersion = s.version;
    document.getElementById("submitButton").textContent = "Zapisz zmiany";
    document.getElementById("shipmentWarehouseSelect").disabled = Boolean(s.warehouseId);
    form.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  };

  // Usunięcie przesyłki.

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

  // Enter w numerze listu przenosi do pola daty.

  document.getElementById("numerListu").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.getElementById("data").focus();
  });

  // Zapis formularza (dodanie lub aktualizacja przesyłki).

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    runServerAction(async () => {
      const newShipment = {
        nazwaSpolki: companySelect.value === "inna"
          ? otherCompanyInput.value.trim()
          : companySelect.value,
        warehouseId: document.getElementById("shipmentWarehouseSelect").value || null,
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
        document.getElementById("shipmentWarehouseSelect").disabled = false;
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
}
