// Testy logiki magazynu na tymczasowej bazie PostgreSQL: przyjęcie, WZ, MM, korekty i walidacje.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase } = require("./db-helper");

let db;
let warehouse;
let ctx;

// Przygotowuje spółkę z adresem, odbiorcę, dwa magazyny i użytkownika.
async function seed(pool) {
  const company = (await pool.query(`
    UPDATE companies SET street = 'Testowa', building_number = '1', postal_code = '00-001',
           city = 'Warszawa', nip = '5260001246'
     WHERE id = (SELECT MIN(id) FROM companies) RETURNING id`)).rows[0];
  const main = (await pool.query(
    `INSERT INTO warehouses (company_id, name, warehouse_type)
     SELECT id, name, 'other' FROM companies WHERE id = $1
     ON CONFLICT (company_id, name) WHERE active DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [company.id]
  )).rows[0];
  const other = (await pool.query(
    "INSERT INTO warehouses (company_id, name, warehouse_type) VALUES ($1, 'Testowy drugi', 'other') RETURNING id",
    [company.id]
  )).rows[0];
  const recipient = (await pool.query(
    "INSERT INTO recipients (name, street, building_number, postal_code, city) VALUES ('Odbiorca Test', 'Ulica', '2', '00-002', 'Kraków') RETURNING id"
  )).rows[0];
  const user = (await pool.query(
    "INSERT INTO app_users (username, password_hash) VALUES ('tester', 'x') RETURNING id"
  )).rows[0];
  return { companyId: company.id, mainId: main.id, otherId: other.id, recipientId: recipient.id, userId: user.id };
}

// Zwraca partię towaru o podanej nazwie.
async function stockOf(name) {
  const rows = await warehouse.getStock({});
  return rows.filter(row => row.name === name);
}

test.before(async () => {
  db = await setupTestDatabase("warehouse");
  if (!db) return;
  warehouse = require("../server/warehouse");
  ctx = await seed(db.pool);
});

test.after(async () => {
  if (db) await db.teardown();
});

test("przyjęcie towaru tworzy stan w magazynie", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const result = await warehouse.createItem({
    companyId: ctx.companyId, warehouseId: ctx.mainId, name: "Kabel", unit: "szt", quantity: 10
  }, ctx.userId);
  assert.ok(result);
  const [entry] = await stockOf("Kabel");
  assert.equal(Number(entry.quantityOnHand), 10);
});

test("WZ zdejmuje stan i zwraca dokument z numerem", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const [entry] = await stockOf("Kabel");
  const issue = await warehouse.createIssue({
    warehouseId: ctx.mainId, issueDate: "2026-01-15", recipientId: ctx.recipientId,
    deliveryMethod: "own_transport", lines: [{ stockEntryId: entry.stockEntryId, quantity: 4 }]
  }, ctx.userId);
  assert.match(issue.documentNo, /WZ/);
  const [after] = await stockOf("Kabel");
  assert.equal(Number(after.quantityOnHand), 6);
  const list = await warehouse.getIssues();
  assert.equal(list[0].documentNo, issue.documentNo);
  assert.equal(String(list[0].recipientId), String(ctx.recipientId));
});

test("WZ nie pozwala wydać więcej niż jest na stanie", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const [entry] = await stockOf("Kabel");
  await assert.rejects(() => warehouse.createIssue({
    warehouseId: ctx.mainId, issueDate: "2026-01-15", recipientId: ctx.recipientId,
    deliveryMethod: "own_transport", lines: [{ stockEntryId: entry.stockEntryId, quantity: 999 }]
  }, ctx.userId));
  const [after] = await stockOf("Kabel");
  assert.equal(Number(after.quantityOnHand), 6);
});

test("WZ wymaga sposobu dostawy i poprawnych pozycji", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  await assert.rejects(() => warehouse.createIssue({
    warehouseId: ctx.mainId, issueDate: "2026-01-15", recipientId: ctx.recipientId, lines: []
  }, ctx.userId), { status: 400 });
});

test("MM przenosi towar między magazynami", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const [entry] = await stockOf("Kabel");
  await warehouse.createTransfer({
    sourceWarehouseId: ctx.mainId, targetWarehouseId: ctx.otherId,
    lines: [{ stockEntryId: entry.stockEntryId, quantity: 2 }]
  }, ctx.userId);
  const rows = await stockOf("Kabel");
  const byWarehouse = Object.fromEntries(rows.map(r => [String(r.warehouseId), Number(r.quantityOnHand)]));
  assert.equal(byWarehouse[String(ctx.mainId)], 4);
  assert.equal(byWarehouse[String(ctx.otherId)], 2);
});

test("MM odrzuca ten sam magazyn źródłowy i docelowy", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const [entry] = await stockOf("Kabel");
  await assert.rejects(() => warehouse.createTransfer({
    sourceWarehouseId: ctx.mainId, targetWarehouseId: ctx.mainId,
    lines: [{ stockEntryId: entry.stockEntryId, quantity: 1 }]
  }, ctx.userId), { status: 400 });
});

test("korekta wymaga powodu i niezerowej ilości", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const items = await warehouse.getItems(ctx.companyId);
  const item = items.find(i => i.name === "Kabel");
  await assert.rejects(() => warehouse.createAdjustment({
    warehouseId: ctx.mainId, itemId: item.id, quantity: 0, notes: "x"
  }, ctx.userId), { status: 400 });
  await assert.rejects(() => warehouse.createAdjustment({
    warehouseId: ctx.mainId, itemId: item.id, quantity: 1, notes: ""
  }, ctx.userId), { status: 400 });
});
