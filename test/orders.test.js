// Testy podpowiedzi zamówień: zakres roku utworzenia i widoczność rekordów użytkownika.
const test = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase } = require("./db-helper");

let db;
let orders;
let userId;

test.before(async () => {
  db = await setupTestDatabase("orders");
  if (!db) return;
  orders = require("../server/orders");
  userId = (await db.pool.query(
    "INSERT INTO app_users (username, password_hash) VALUES ('order-suggest-user', 'x') RETURNING id"
  )).rows[0].id;
  const otherUserId = (await db.pool.query(
    "INSERT INTO app_users (username, password_hash) VALUES ('other-order-user', 'x') RETURNING id"
  )).rows[0].id;
  const year = new Date().getFullYear();
  const fixtures = [
    [userId, `PO-${year}-1`, `${year}-02-01T00:00:00.000Z`],
    [userId, `PO-${year}-OLD`, `${year - 1}-12-31T23:59:59.000Z`],
    [otherUserId, `PO-${year}-OTHER`, `${year}-03-01T00:00:00.000Z`]
  ];
  for (const [ownerId, number, createdAt] of fixtures) {
    await db.pool.query(`
      INSERT INTO orders (user_id, order_number, order_date, supplier, company_name, item_name, quantity, created_at)
      VALUES ($1, $2, CURRENT_DATE, 'Dostawca', 'Maxto ITS', 'Towar', 2, $3)
    `, [ownerId, number, createdAt]);
  }
});

test.after(async () => {
  if (db) await db.teardown();
});

test("suggestions return only current-year orders matching the prefix and user scope", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const suggestions = await orders.suggestOrders(`PO-${new Date().getFullYear()}`, { id: userId, role: "viewer" });
  assert.deepEqual(suggestions.map(order => order.orderNumber), [`PO-${new Date().getFullYear()}-1`]);
});
