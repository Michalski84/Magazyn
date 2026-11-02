// Test klienta (jsdom): zaznaczanie pozycji, tworzenie WZ/MM z zaznaczenia, podgląd WZ i filtry listy WZ.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const full = fs.readFileSync(path.join(root, "index.htm"), "utf8");
const html = full.replace(/<script[\s\S]*?<\/script>/g, "");

let w;
let ctx;

// Wykonuje kod w kontekście strony.
const run = code => new vm.Script(code).runInContext(ctx);
const byId = id => w.document.getElementById(id);
const rows = () => [...w.document.querySelectorAll("#stockTable tbody tr")];

test.before(() => {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:3000/" });
  w = dom.window;
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  w.XLSX = {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  ctx = dom.getInternalVMContext();
  for (const [, src] of full.matchAll(/<script src="(src\/[^"]+)"/g)) {
    new vm.Script(fs.readFileSync(path.join(root, src), "utf8"), { filename: src }).runInContext(ctx);
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  run(`
    state.companies = [{id:1,name:"Alfa",active:true},{id:2,name:"Beta",active:true},{id:3,name:"Gamma",active:true}];
    state.warehouses = [{id:10,name:"Główny",type:"main",active:true,companyId:null},{id:11,name:"Mag B",type:"x",active:true,companyId:2}];
    state.recipients = [{id:5,name:"Odb"},{id:6,name:"Inny"}];
    const mk = (id,c,cn,wh,whn,qty) => ({stockEntryId:id,createdAt:new Date(Date.UTC(2026,0,7-id)).toISOString(),companyId:c,companyName:cn,warehouseId:wh,warehouseName:whn,name:"T"+id,unit:"szt",quantityIn:qty,quantityOut:0,quantityOnHand:qty,issues:[],serialNumber:"SN"+id,projectNumber:"",orderNumber:"",supplier:""});
    state.stock = [mk(1,2,"Beta",10,"Główny",3),mk(2,2,"Beta",10,"Główny",4),mk(3,1,"Alfa",10,"Główny",5),mk(4,3,"Gamma",10,"Główny",0),mk(5,2,"Beta",11,"Mag B",2),mk(6,2,"Beta",10,"Główny",1)];
    populateCompanyControls(); populateWarehouseControls(); populateIssueRecipients(); populateIssueFilterRecipients();
    renderStock();
  `);
  run("showToast = (message) => { globalThis.__toast = message; }");
});

test("formularz logowania nie wysyła danych metodą GET", () => {
  assert.equal(byId("loginForm").method, "post");
  assert.equal(byId("loginForm").action, "http://localhost:3000/api/auth/login");
});

test("tablica notatek jest dostępna w nawigacji, a import waliduje wersję kopii", () => {
  assert.equal(w.document.querySelector('[data-module="notesBoardModule"]').textContent, "Tablica notatek");
  assert.ok(byId("notesBoardStage"));
  assert.equal(byId("notesBoardStatusFilter"), null);
  assert.equal(byId("notesBoardDeadlineFilter"), null);
  assert.equal(byId("notesBoardNotificationsButton"), null);
  const backup = run(`validateNotesBoardBackup({
    format: "magazyn-notes-board", version: 1, notes: [], images: []
  })`);
  assert.equal(backup.notes.length, 0);
  assert.equal(backup.images.length, 0);
  assert.equal(backup.settings.status, "active");
  assert.throws(() => run(`validateNotesBoardBackup({ format: "magazyn-notes-board", version: 999, notes: [], images: [] })`), /Nieobsługiwany format/);
  assert.throws(() => run(`validateNotesBoardBackup({
    format: "magazyn-notes-board", version: 1, notes: [], images: [{ id: "img", type: "text/html", data: "" }]
  })`), /nieobsługiwany format obrazu/);
});

test("jednostka km jest dostępna we wszystkich polach wyboru jednostki", () => {
  const allowedUnits = ["szt.", "opk.", "mb", "km", "kpl."];
  assert.deepEqual([...byId("newItemUnit").options].map(option => option.value), allowedUnits);
  assert.deepEqual([...byId("editStockUnit").options].map(option => option.value), allowedUnits);

  byId("addZawartoscButton").click();
  const shipmentUnit = byId("zawartoscFields").lastElementChild.querySelector('[name="jednostka"]');
  assert.deepEqual([...shipmentUnit.options].map(option => option.value), allowedUnits);
  shipmentUnit.value = "km";
  assert.equal(shipmentUnit.value, "km");

  const orderUnit = byId("orderItemsFields").querySelector('[name="itemUnit"]');
  assert.deepEqual([...orderUnit.options].map(option => option.value), allowedUnits);
});

test("pinezka pokazuje opcje na karteczce, a osobny przycisk otwiera edytor tekstu", () => {
  const card = run(`notesBoardRenderCard({
    id: "note-test", text: "Treść próbna", color: "yellow", x: 10, y: 20,
    width: 280, height: 330, createdAt: "2026-10-27T10:00:00.000Z",
    important: false, completed: false, archived: false, reminderAt: "",
    imageIds: [], imageWidths: {}, order: 1
  })`);
  assert.equal(card.querySelectorAll(".notes-board-card-header button").length, 1);
  assert.equal(card.querySelector(".notes-board-options-toggle").textContent, "📌");
  assert.equal(card.querySelector(".notes-board-text").textContent, "Treść próbna");
  assert.equal(card.querySelector(".notes-board-text").getAttribute("contenteditable"), "true");
  const cardOptions = card.querySelector(".notes-board-card-options");
  assert.equal(cardOptions.hidden, true);
  assert.equal(card.querySelector(".notes-board-images").parentElement, cardOptions);
  assert.equal([...card.querySelectorAll("button")].some(button => /Archiwizuj|Ukończ|Przenieś na wierzch/.test(button.textContent)), false);
  assert.match(card.querySelector(".notes-board-created").textContent, /Utworzono:/);
  assert.equal(card.querySelector('[aria-label="Rozmiar karteczki"]'), null);
  assert.equal([...card.querySelectorAll("button")].some(button => button.textContent.includes("Duplikuj")), false);

  const editorModal = w.document.querySelector('.notes-board-editor-modal[data-note-id="note-test"]');
  assert.equal(editorModal.parentElement, w.document.body);
  assert.equal(editorModal.hidden, true);
  assert.equal(editorModal.querySelector(".notes-board-text"), null);
  assert.equal(editorModal.querySelectorAll(".notes-board-format-button").length, 3);
  assert.ok(editorModal.querySelector('[aria-label="Wielkość czcionki"]'));
  assert.ok(editorModal.querySelector('[aria-label="Krój pisma"]'));
  assert.ok(editorModal.querySelector('[aria-label="Kolor tekstu: zastosuj wybrany kolor"]'));
  assert.ok(editorModal.querySelector('[aria-label="Kolor tła tekstu: zastosuj wybrany kolor"]'));
  assert.equal(editorModal.querySelectorAll(".notes-board-color-swatch").length, 16);
  assert.equal([...editorModal.querySelectorAll(".notes-board-color-palette")].every(palette => palette.hidden), true);
  assert.equal(editorModal.querySelectorAll('[aria-label$="wybierz własny kolor"]').length, 2);
  const textColorDropdown = editorModal.querySelector('[aria-label="Wybierz kolor tekstu"]');
  const textColorPalette = editorModal.querySelector('[aria-label="Kolor tekstu — kolory podstawowe"]');
  textColorDropdown.click();
  assert.equal(textColorPalette.hidden, false);
  textColorDropdown.click();
  assert.equal(textColorPalette.hidden, true);
  assert.equal(editorModal.querySelector("textarea.notes-board-text"), null);
  assert.equal(editorModal.querySelector(".notes-board-delete-button"), null);
  assert.equal(editorModal.querySelector(".notes-board-card-controls"), null);
  const importantButton = card.querySelector(".notes-board-option-actions button");
  const editTextButton = card.querySelector(".notes-board-option-actions button[title='Otwórz edytor tekstu']");
  const deleteButton = card.querySelector(".notes-board-delete-button");
  assert.equal(editTextButton.previousElementSibling, importantButton);
  assert.equal(importantButton.parentElement, deleteButton.parentElement);
  assert.equal(card.querySelector(".notes-board-card-controls select").parentElement,
    card.querySelector(".notes-board-card-controls"));
  assert.equal(card.querySelector(".notes-board-reminder"), null);

  card.querySelector(".notes-board-options-toggle").click();
  assert.equal(cardOptions.hidden, false);
  assert.equal(editorModal.hidden, true);
  assert.equal(card.querySelector(".notes-board-options-toggle").getAttribute("aria-expanded"), "true");
  const secondCard = run(`notesBoardRenderCard({
    id: "note-test-second", text: "Druga treść", color: "blue", x: 30, y: 40,
    width: 280, height: 330, createdAt: "2026-10-27T10:00:00.000Z",
    important: false, completed: false, archived: false, reminderAt: "",
    imageIds: [], imageWidths: {}, order: 2
  })`);
  const secondModal = w.document.querySelector('.notes-board-editor-modal[data-note-id="note-test-second"]');
  secondCard.querySelector(".notes-board-options-toggle").click();
  assert.equal(editorModal.hidden, true);
  assert.equal(secondModal.hidden, true);
  assert.equal(card.querySelector(".notes-board-options-toggle").getAttribute("aria-expanded"), "true");
  secondCard.querySelector(".notes-board-option-actions button[title='Otwórz edytor tekstu']").click();
  assert.equal(secondModal.hidden, false);
  card.querySelector(".notes-board-option-actions button[title='Otwórz edytor tekstu']").click();
  assert.equal(editorModal.hidden, false);
  assert.equal(secondModal.hidden, true);
  editorModal.querySelector(".notes-board-editor-close").click();
  assert.equal(editorModal.hidden, true);

  const imported = run(`validateNotesBoardBackup({
    format: "magazyn-notes-board", version: 1,
    notes: [{
      id: "resized", text: "Ręcznie zmieniona", color: "blue", x: 10, y: 20,
      width: 340, height: 260, sizeManual: true, imageIds: []
    }],
    images: []
  })`);
  assert.equal(imported.notes[0].sizeManual, true);
});

test("import kopii zachowuje dozwolone formatowanie, ale usuwa niebezpieczne znaczniki", () => {
  const imported = run(`validateNotesBoardBackup({
    format: "magazyn-notes-board", version: 1,
    notes: [{
      id: "formatted", text: "Ważna treść", richText: '<b>Tekst</b><img src=x onerror="alert(1)"><span style="color:#ff0000;background-color:#ffff00">kolor</span><script>alert(1)</script>',
      color: "yellow", x: 10, y: 20, width: 260, height: 180, imageIds: []
    }],
    images: []
  })`);
  assert.ok(imported.notes[0].richText.includes("<b>Tekst</b>"));
  assert.ok(imported.notes[0].richText.includes("background-color: rgb(255, 255, 0)"));
  ["<img", "<script", "onerror", "alert("].forEach(value => {
    assert.equal(imported.notes[0].richText.includes(value), false);
  });
});

test("zamówienia domyślnie używają PLN i pokazują poprawną wartość bez NaN", async () => {
  assert.equal(byId("orderForm").elements.currency.value, "PLN");
  ctx.__ordersTestApi = {
    list: async () => [
      {
        id: "1", orderNumber: "ZAM-1", orderDate: "2026-10-01", supplier: "Dostawca",
        companyName: "Maxto ITS", itemName: "Towar", quantity: 1, currency: "PLN",
        orderValue: 123.45, orderValuePln: 123.45, status: "zlozone"
      },
      {
        id: "2", orderNumber: "ZAM-2", orderDate: "2026-10-02", supplier: "Dostawca",
        companyName: "Maxto ITS", itemName: "Towar", quantity: 1, status: "zlozone"
      }
    ]
  };
  run(`
    Object.assign(window.shipmentApi.orders, globalThis.__ordersTestApi);
    window.shipmentApi.catalogs.companies = async () => [];
    window.shipmentApi.catalogs.projects = async () => [];
  `);
  w.document.body.dataset.role = "viewer";
  w.dispatchEvent(new w.CustomEvent("module-selected", { detail: "ordersModule" }));
  await new Promise(resolve => setTimeout(resolve, 0));

  const amountCells = [...byId("ordersTable").tBodies[0].rows].map(row => row.cells[4].textContent);
  assert.deepEqual(amountCells, ["123,45 zł", "— zł"]);
  assert.ok(amountCells.every(value => !value.includes("NaN")));
});

test("strzałki ilości w zamówieniu zmieniają ją o 1, ale ręcznie można wpisać ułamek", async () => {
  const form = byId("orderForm");
  const quantity = byId("orderItemsFields").querySelector('[name="itemQuantity"]');
  assert.equal(quantity.step, "1");
  assert.equal(quantity.min, "0");
  quantity.value = "1.25";
  assert.equal(quantity.validity.stepMismatch, true);

  const companySelect = form.elements.companyId;
  companySelect.add(new w.Option("Spółka testowa", "1"));
  form.elements.orderNumber.value = "TEST-1";
  form.elements.supplier.value = "Dostawca testowy";
  companySelect.value = "1";
  form.elements.deliveryAddress.value = "Adres testowy";
  form.elements.orderDate.value = "2026-11-01";
  form.elements.orderValue.value = "0";
  byId("orderItemsFields").querySelector('[name="itemName"]').value = "Towar testowy";

  let submittedOrder;
  run(`window.shipmentApi.orders.create = async order => {
    globalThis.__submittedOrder = order;
    return { ...order, id: "order-step-test", status: "zlozone" };
  }`);
  quantity.value = "0";
  form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(run("globalThis.__submittedOrder"), undefined);

  quantity.value = "1.25";
  form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  submittedOrder = run("globalThis.__submittedOrder");
  assert.equal(submittedOrder.items[0].quantity, "1.25");
  assert.equal(quantity.step, "1");
});

test("wybranie podpowiedzi zamówienia uzupełnia dane przesyłki i zachowuje ilości", async () => {
  let searchedPrefix;
  run(`
    window.shipmentApi.orders.suggest = async prefix => {
      globalThis.__searchedOrderPrefix = prefix;
      return [{
        orderNumber: "PO-123", supplier: "Dostawca testowy", companyName: "Maxto ITS",
        projectNumber: "PROJ-7",
        items: [
          { name: "Przewód", quantity: 1.25, unit: "mb" },
          { name: "Złączka", quantity: 4, unit: "szt." }
        ]
      }];
    };
  `);
  const orderInput = byId("zamowienie");
  orderInput.value = "PO-";
  orderInput.dispatchEvent(new w.Event("input"));
  await new Promise(resolve => setTimeout(resolve, 300));
  searchedPrefix = run("globalThis.__searchedOrderPrefix");

  assert.equal(searchedPrefix, "PO-");
  const suggestion = byId("orderSuggestions").querySelector("button");
  assert.ok(suggestion);
  suggestion.click();

  assert.equal(orderInput.value, "PO-123");
  assert.equal(byId("nadawca").value, "Dostawca testowy");
  assert.equal(byId("projekt").value, "PROJ-7");
  assert.equal(byId("nazwaSpolkiSelect").value, "Maxto ITS");
  const contentRows = [...byId("zawartoscFields").rows];
  assert.deepEqual(contentRows.map(row => row.querySelector('[name="nazwa"]').value), ["Przewód", "Złączka"]);
  assert.deepEqual(contentRows.map(row => row.querySelector('[name="ilosc"]').value), ["1.25", "4"]);
  assert.deepEqual(contentRows.map(row => row.querySelector('[name="jednostka"]').value), ["mb", "szt."]);
  assert.equal(byId("orderSuggestions").hidden, true);
});

test("filtr spółek jest posortowany wg liczby pozycji", () => {
  const options = [...byId("warehouseCompanyFilter").options].map(o => o.text).join("|");
  assert.equal(options, "Wszystkie spółki|Beta (4)|Alfa (1)|Gamma (0)");
  assert.equal([...byId("stockCompanyColumnFilter").options].map(o => o.text).join("|"), options);
});

test("formularz rejestracji domyślnie ukrywa hasła i pozwala je ujawnić", () => {
  byId("showRegisterButton").click();
  assert.equal(byId("registerModal").style.display, "flex");
  assert.equal(byId("hideRegisterPassword").checked, true);
  assert.equal(byId("registerPassword").type, "password");

  byId("hideRegisterPassword").click();
  assert.equal(byId("registerPassword").type, "text");
  assert.equal(byId("registerPasswordConfirmation").type, "text");
  byId("registerCancelButton").click();
  assert.equal(byId("registerModal").style.display, "none");
});

test("towary są domyślnie sortowane od najnowszych i można odwrócić kolejność", () => {
  const names = () => rows().map(row => row.cells[4].textContent);
  assert.deepEqual(names(), ["T1", "T2", "T3", "T4", "T5", "T6"]);

  byId("stockSortOrder").value = "oldest-first";
  byId("stockSortOrder").dispatchEvent(new w.Event("change"));
  assert.deepEqual(names(), ["T6", "T5", "T4", "T3", "T2", "T1"]);

  byId("stockSortOrder").value = "newest-first";
  byId("stockSortOrder").dispatchEvent(new w.Event("change"));
});

test("zaznaczanie pozycji i blokada mieszanych spółek", () => {
  assert.equal(rows().length, 6);
  assert.ok(rows()[3].querySelector(".stock-select-checkbox").disabled);
  rows()[0].querySelector(".stock-select-checkbox").click();
  rows()[1].querySelector(".stock-select-checkbox").click();
  assert.equal(byId("stockSelectionCount").textContent, "Zaznaczono: 2 pozycje");
  byId("stockCompanyColumnFilter").value = "1";
  byId("stockCompanyColumnFilter").dispatchEvent(new w.Event("change"));
  run("renderStock()");
  byId("stockSelectAll").click();
  assert.equal(run("selectedStockIds.size"), 3);
  byId("createIssueFromSelectionButton").click();
  assert.match(run("globalThis.__toast"), /tylko jednej spółki/);
  byId("clearStockSelectionButton").click();
  assert.equal(run("selectedStockIds.size"), 0);
});

test("WZ z zaznaczenia ma gotowe pozycje, a podgląd pokazuje sumę", async () => {
  byId("stockCompanyColumnFilter").value = "2";
  byId("stockCompanyColumnFilter").dispatchEvent(new w.Event("change"));
  run("renderStock()");
  rows()[0].querySelector(".stock-select-checkbox").click();
  rows()[1].querySelector(".stock-select-checkbox").click();
  byId("createIssueFromSelectionButton").click();
  const lines = [...w.document.querySelectorAll("#issueLines .issue-line")];
  assert.equal(lines.length, 2);
  assert.equal(lines[0].querySelector("input[type=number]").value, "3");
  assert.equal(lines[1].querySelector("select").value, "2");

  const payload = lines.map(row => ({
    stockEntryId: row.querySelector("select").value,
    quantity: row.querySelector("input[type=number]").value,
    serialNumber: row.querySelector(".issue-line-serial").value
  }));
  w.globalThis.__lines = payload;
  const pending = run("confirmIssuePreview(globalThis.__lines)");
  const overlay = w.document.querySelector(".issue-preview-overlay");
  assert.ok(overlay);
  assert.match(overlay.textContent, /łączna ilość: 7/);
  overlay.querySelector(".issue-preview-actions button:last-child").click();
  assert.equal(await pending, true);
  assert.equal(w.document.querySelector(".issue-preview-overlay"), null);

  const pendingBack = run("confirmIssuePreview(globalThis.__lines)");
  w.document.querySelector(".issue-preview-actions button").click();
  assert.equal(await pendingBack, false);
});

test("MM z zaznaczenia: jeden magazyn źródłowy i pełne ilości", () => {
  byId("clearStockSelectionButton").click();
  rows().forEach(row => {
    const checkbox = row.querySelector(".stock-select-checkbox");
    if (!checkbox.disabled) checkbox.click();
  });
  byId("createTransferFromSelectionButton").click();
  assert.match(run("globalThis.__toast"), /jednego magazynu źródłowego/);
  byId("clearStockSelectionButton").click();
  rows()[0].querySelector(".stock-select-checkbox").click();
  byId("createTransferFromSelectionButton").click();
  assert.equal(byId("transferSource").value, "10");
  assert.notEqual(byId("transferTarget").value, "10");
  const line = w.document.querySelector("#transferLines .issue-line");
  assert.equal(line.querySelector("select").value, "1");
  assert.equal(line.querySelector("input").value, "3");
});

test("filtry listy WZ: numer, odbiorca, projekt, daty i status", () => {
  run(`state.issues = [
    {id:1,documentNo:"WZ/2026/1",issueDate:"2026-01-10",companyName:"Alfa",warehouseName:"Główny",issuedTo:"Odb",recipientId:5,projectNumber:"P-100",lineCount:1,status:"issued"},
    {id:2,documentNo:"WZ/2026/2",issueDate:"2026-02-10",companyName:"Beta",warehouseName:"Główny",issuedTo:"Inny",recipientId:6,projectNumber:"P-200",lineCount:2,status:"issued"},
    {id:3,documentNo:"WZ/2026/3",issueDate:"2026-03-10",companyName:"Beta",warehouseName:"Główny",issuedTo:"Odb",recipientId:5,projectNumber:"",lineCount:1,status:"cancelled"}];
    renderIssues();`);
  const count = () => w.document.querySelectorAll("#issuesTable tbody tr").length;
  const set = (id, value) => {
    byId(id).value = value;
    byId(id).dispatchEvent(new w.Event(byId(id).tagName === "SELECT" ? "change" : "input"));
  };
  assert.equal(count(), 3);
  set("issueFilterSearch", "wz/2026/2");
  assert.equal(count(), 1);
  byId("issueFilterClear").click();
  set("issueFilterRecipient", "5");
  assert.equal(count(), 2);
  set("issueFilterProject", "p-1");
  assert.equal(count(), 1);
  byId("issueFilterClear").click();
  set("issueFilterFrom", "2026-02-01");
  set("issueFilterTo", "2026-02-28");
  assert.equal(count(), 1);
  byId("issueFilterClear").click();
  set("issueFilterStatus", "cancelled");
  assert.equal(count(), 1);
  assert.match(byId("issueFilterCount").textContent, /1 z 3/);
});

test.after(() => w.close());
