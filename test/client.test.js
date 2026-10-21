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
    const mk = (id,c,cn,wh,whn,qty) => ({stockEntryId:id,companyId:c,companyName:cn,warehouseId:wh,warehouseName:whn,name:"T"+id,unit:"szt",quantityIn:qty,quantityOut:0,quantityOnHand:qty,issues:[],serialNumber:"SN"+id,projectNumber:"",orderNumber:"",supplier:""});
    state.stock = [mk(1,2,"Beta",10,"Główny",3),mk(2,2,"Beta",10,"Główny",4),mk(3,1,"Alfa",10,"Główny",5),mk(4,3,"Gamma",10,"Główny",0),mk(5,2,"Beta",11,"Mag B",2),mk(6,2,"Beta",10,"Główny",1)];
    populateCompanyControls(); populateWarehouseControls(); populateIssueRecipients(); populateIssueFilterRecipients();
    renderStock();
  `);
  run("showToast = (message) => { globalThis.__toast = message; }");
});

test("filtr spółek jest posortowany wg liczby pozycji", () => {
  const options = [...byId("warehouseCompanyFilter").options].map(o => o.text).join("|");
  assert.equal(options, "Wszystkie spółki|Beta (4)|Alfa (1)|Gamma (0)");
  assert.equal([...byId("stockCompanyColumnFilter").options].map(o => o.text).join("|"), options);
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
