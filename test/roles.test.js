// Testy HTTP: role użytkowników (admin, warehouse, viewer) oraz dziennik zmian.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { setupTestDatabase } = require("./db-helper");

let db;
let server;
let base;

// Loguje użytkownika i zwraca ciasteczko sesji (sesje są współdzielone, bo logowanie ma limit żądań).
const sessionCookies = new Map();
async function login(username) {
  if (sessionCookies.has(username)) return sessionCookies.get(username);
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "haslo-testowe-123" })
  });
  assert.equal(response.status, 200);
  // Zapis sesji w bazie kończy się chwilę po odpowiedzi.
  await new Promise(resolve => setTimeout(resolve, 300));
  const cookie = response.headers.get("set-cookie").split(";")[0];
  sessionCookies.set(username, cookie);
  return cookie;
}

// Wysyła żądanie z ciasteczkiem sesji.
function call(cookie, path, options = {}) {
  return fetch(`${base}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie }
  });
}

test.before(async () => {
  db = await setupTestDatabase("roles");
  if (!db) return;
  const hash = await bcrypt.hash("haslo-testowe-123", 4);
  for (const [username, role] of [["adm", "admin"], ["mag", "warehouse"], ["obs", "viewer"]]) {
    await db.pool.query("INSERT INTO app_users (username, password_hash, role) VALUES ($1, $2, $3)", [username, hash, role]);
  }
  const app = require("../server/app");
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.teardown();
});

test("sesja zwraca rolę użytkownika", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("obs");
  const body = await (await call(cookie, "/auth/session")).json();
  assert.equal(body.user.role, "viewer");
});

test("rejestracja wymaga unikalnego konta, a nowe konto czeka na aktywację administratora", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const credentials = {
    username: "nowy-uzytkownik",
    password: "haslo-testowe-123",
    passwordConfirmation: "haslo-testowe-123"
  };
  const response = await call("", "/auth/register", {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  assert.equal(response.status, 201);

  const duplicate = await call("", "/auth/register", {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  assert.equal(duplicate.status, 409);

  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });
  assert.equal(loginResponse.status, 403);
  assert.match((await loginResponse.json()).error, /oczekuje na aktywację/);
});

test("administrator nadaje rolę i aktywuje konto; deaktywacja odbiera dostęp", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const adminCookie = await login("adm");
  const users = await (await call(adminCookie, "/admin/users")).json();
  const user = users.find(account => account.username === "nowy-uzytkownik");
  assert.ok(user);
  assert.equal(user.active, false);

  const updated = await call(adminCookie, `/admin/users/${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "warehouse", active: true })
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(
    (({ role, active }) => ({ role, active }))(await updated.json()),
    { role: "warehouse", active: true }
  );

  const accountCookie = await login("nowy-uzytkownik");
  assert.equal((await call(accountCookie, "/warehouse/items", {
    method: "POST",
    body: JSON.stringify({})
  })).status, 400);
  assert.equal((await call(accountCookie, "/catalogs/projects", {
    method: "POST",
    body: JSON.stringify({})
  })).status, 400);
  assert.equal((await call(accountCookie, "/catalogs/recipients", {
    method: "POST",
    body: JSON.stringify({})
  })).status, 400);
  assert.equal((await call(accountCookie, "/catalogs/companies", {
    method: "POST",
    body: JSON.stringify({})
  })).status, 403);

  const deactivated = await call(adminCookie, `/admin/users/${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "viewer", active: false })
  });
  assert.equal(deactivated.status, 200);
  assert.equal((await call(accountCookie, "/warehouse/stock")).status, 401);

  assert.equal((await call(adminCookie, `/admin/users/${user.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await call(adminCookie, "/admin/users")).status, 200);
  const admin = (await (await call(adminCookie, "/admin/users")).json())
    .find(account => account.username === "adm");
  assert.ok(admin);
  assert.equal((await call(adminCookie, `/admin/users/${admin.id}`, {
    method: "DELETE"
  })).status, 400);
});

test("viewer może czytać, ale nie zapisywać", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("obs");
  assert.equal((await call(cookie, "/warehouse/stock")).status, 200);
  const write = await call(cookie, "/warehouse/items", { method: "POST", body: JSON.stringify({}) });
  assert.equal(write.status, 403);
});

test("warehouse zapisuje w magazynie, edytuje spółki i dodaje projekty, ale nie reszty kartotek", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("mag");
  const warehouseWrite = await call(cookie, "/warehouse/items", { method: "POST", body: JSON.stringify({}) });
  assert.equal(warehouseWrite.status, 400);
  const projectWrite = await call(cookie, "/catalogs/projects", { method: "POST", body: JSON.stringify({}) });
  assert.equal(projectWrite.status, 400);
  const companyEdit = await call(cookie, "/catalogs/companies/1", { method: "PUT", body: JSON.stringify({}) });
  assert.equal(companyEdit.status, 400);
  const companyCreate = await call(cookie, "/catalogs/companies", { method: "POST", body: JSON.stringify({}) });
  assert.equal(companyCreate.status, 403);
  const recipientEdit = await call(cookie, "/catalogs/recipients/1", { method: "PUT", body: JSON.stringify({}) });
  assert.equal(recipientEdit.status, 403);
  const projectEdit = await call(cookie, "/catalogs/projects/1", { method: "PUT", body: JSON.stringify({}) });
  assert.equal(projectEdit.status, 403);
  const projectDelete = await call(cookie, "/catalogs/projects/1", { method: "DELETE" });
  assert.equal(projectDelete.status, 403);
});

test("dziennik zmian jest dostępny tylko dla administratora i zawiera wpisy", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const adminCookie = await login("adm");
  const create = await call(adminCookie, "/catalogs/projects", {
    method: "POST",
    body: JSON.stringify({ projectNumber: "P-1", shortName: "Test", fullName: "Projekt testowy" })
  });
  assert.equal(create.status, 201);
  await new Promise(resolve => setTimeout(resolve, 200));

  const forbidden = await call(await login("mag"), "/admin/audit");
  assert.equal(forbidden.status, 403);

  const entries = await (await call(adminCookie, "/admin/audit")).json();
  assert.ok(entries.some(entry => entry.username === "adm" && entry.action.startsWith("POST catalogs/projects")));
  assert.ok(entries.some(entry => entry.action === "Logowanie"));
});

test("zamówienia: użytkownik widzi tylko własne, administrator wszystkie", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const company = (await db.pool.query(
    "SELECT id FROM companies WHERE name = 'Maxto Technology'"
  )).rows[0];
  const order = number => JSON.stringify({
    orderNumber: number, eodSalesforceNumber: "SF-" + number, projectNumber: "PRJ-7",
    orderDate: "2026-10-01", supplier: "Dostawca", companyId: String(company.id),
    itemName: "Towar", quantity: "2.5", orderValue: "100.50", currency: "EUR",
    exchangeRate: "4.5", deliveryAddress: "Adres 1"
  });
  const mag = await login("mag");
  const obs = await login("obs");
  const adm = await login("adm");

  const created = await call(mag, "/orders", { method: "POST", body: order("ZAM-1") });
  assert.equal(created.status, 201);
  const own = await created.json();
  assert.equal(own.status, "zlozone");
  assert.equal(own.companyName, "Maxto Technology");
  assert.equal(own.eodSalesforceNumber, "SF-ZAM-1");
  assert.equal(own.orderValue, 100.5);
  assert.equal(own.currency, "EUR");
  assert.equal(own.exchangeRate, 4.5);
  assert.equal(own.orderValuePln, 452.25);
  assert.equal(own.projectNumber, "PRJ-7");
  assert.deepEqual(own.items, [{ name: "Towar", quantity: 2.5, unit: "szt." }]);
  const multi = await call(mag, "/orders", {
    method: "POST",
    body: JSON.stringify({
      ...JSON.parse(order("ZAM-M")),
      items: [
        { name: "A", quantity: 1, unit: "opk." },
        { name: "B", quantity: "2", unit: "mb" },
        { name: "C", quantity: "3", unit: "km" }
      ]
    })
  });
  assert.equal(multi.status, 201);
  assert.deepEqual((await multi.json()).items.map(item => item.unit), ["opk.", "mb", "km"]);
  assert.equal((await call(mag, "/orders", {
    method: "POST",
    body: JSON.stringify({ ...JSON.parse(order("ZAM-B")), items: [{ name: "A", quantity: 1, unit: "xx" }] })
  })).status, 400);
  assert.equal((await call(obs, "/orders", { method: "POST", body: order("ZAM-2") })).status, 201);

  assert.deepEqual((await (await call(mag, "/orders")).json()).map(item => item.orderNumber), ["ZAM-M", "ZAM-1"]);
  assert.deepEqual((await (await call(obs, "/orders")).json()).map(item => item.orderNumber), ["ZAM-2"]);
  assert.equal((await (await call(adm, "/orders")).json()).length, 3);

  const foreign = await call(obs, `/orders/${own.id}`, { method: "PATCH", body: JSON.stringify({ flagged: true }) });
  assert.equal(foreign.status, 404);
  assert.equal((await call(obs, `/orders/${own.id}`, { method: "PUT", body: order("X") })).status, 404);

  const flagged = await call(mag, `/orders/${own.id}`, {
    method: "PATCH",
    body: JSON.stringify({ flagged: true, status: "potwierdzone", notes: "Pilne" })
  });
  assert.equal(flagged.status, 200);
  const updated = await flagged.json();
  assert.deepEqual([updated.flagged, updated.status, updated.notes], [true, "potwierdzone", "Pilne"]);

  const edited = await call(adm, `/orders/${own.id}`, { method: "PUT", body: order("ZAM-1A") });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).orderNumber, "ZAM-1A");

  assert.equal((await call(mag, `/orders/${own.id}`, { method: "PATCH", body: JSON.stringify({ status: "x" }) })).status, 400);
  assert.equal((await call(mag, "/orders", { method: "POST", body: JSON.stringify({}) })).status, 400);
});

test("zamówienie w PLN nie zapisuje kursu ani nie przelicza wartości", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const companyId = (await db.pool.query(
    "SELECT id FROM companies WHERE name = 'Maxto Technology'"
  )).rows[0].id;
  const response = await call(await login("mag"), "/orders", {
    method: "POST",
    body: JSON.stringify({
      orderNumber: "PLN-1", orderDate: "2026-10-01", supplier: "Dostawca",
      companyId: String(companyId), itemName: "Towar", quantity: 1, orderValue: "123.45",
      exchangeRate: "4.5", deliveryAddress: "Adres"
    })
  });
  assert.equal(response.status, 201);
  const order = await response.json();
  assert.equal(order.currency, "PLN");
  assert.equal(order.exchangeRate, null);
  assert.equal(order.orderValue, 123.45);
  assert.equal(order.orderValuePln, 123.45);
});

test("zamówienia wymagają poprawnej kwoty, waluty, kursu i dozwolonej spółki", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("mag");
  const companyId = (await db.pool.query(
    "INSERT INTO companies (name) VALUES ('Spółka niedostępna') RETURNING id"
  )).rows[0].id;
  const valid = {
    orderNumber: "WAL-1", orderDate: "2026-10-01", supplier: "Dostawca",
    companyId: String(companyId), itemName: "Towar", quantity: 1, orderValue: 0,
    currency: "PLN", deliveryAddress: "Adres"
  };
  const unsupportedCompany = await call(cookie, "/orders", {
    method: "POST",
    body: JSON.stringify(valid)
  });
  assert.equal(unsupportedCompany.status, 400);

  const allowedCompanyId = (await db.pool.query(
    "SELECT id FROM companies WHERE name = 'Maxto ITS'"
  )).rows[0].id;
  valid.companyId = String(allowedCompanyId);
  const missingRate = await call(cookie, "/orders", {
    method: "POST",
    body: JSON.stringify({ ...valid, currency: "USD" })
  });
  assert.equal(missingRate.status, 400);

  const invalidCurrency = await call(cookie, "/orders", {
    method: "POST",
    body: JSON.stringify({ ...valid, currency: "GBP" })
  });
  assert.equal(invalidCurrency.status, 400);

  const invalidAmount = await call(cookie, "/orders", {
    method: "POST",
    body: JSON.stringify({ ...valid, orderValue: "1.001" })
  });
  assert.equal(invalidAmount.status, 400);
});
