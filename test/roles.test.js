// Testy HTTP: role użytkowników (admin, warehouse, viewer) oraz dziennik zmian.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { setupTestDatabase } = require("./db-helper");

let db;
let server;
let base;

// Loguje użytkownika i zwraca ciasteczko sesji.
async function login(username) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "haslo-testowe-123" })
  });
  assert.equal(response.status, 200);
  // Zapis sesji w bazie kończy się chwilę po odpowiedzi.
  await new Promise(resolve => setTimeout(resolve, 300));
  return response.headers.get("set-cookie").split(";")[0];
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

test("viewer może czytać, ale nie zapisywać", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("obs");
  assert.equal((await call(cookie, "/warehouse/stock")).status, 200);
  const write = await call(cookie, "/warehouse/items", { method: "POST", body: JSON.stringify({}) });
  assert.equal(write.status, 403);
});

test("warehouse zapisuje w magazynie, ale nie w kartotekach", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const cookie = await login("mag");
  const warehouseWrite = await call(cookie, "/warehouse/items", { method: "POST", body: JSON.stringify({}) });
  assert.equal(warehouseWrite.status, 400);
  const catalogWrite = await call(cookie, "/catalogs/projects", { method: "POST", body: JSON.stringify({}) });
  assert.equal(catalogWrite.status, 403);
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
