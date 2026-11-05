// Testy HTTP: klucze idempotentności chronią przed zdublowaniem zapisu.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { setupTestDatabase } = require("./db-helper");

let db;
let server;
let base;
let cookie;

function post(path, body, key) {
  return fetch(`${base}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(key ? { "Idempotency-Key": key } : {})
    },
    body: JSON.stringify(body)
  });
}

async function recipientCount() {
  return Number((await db.pool.query("SELECT count(*) FROM recipients")).rows[0].count);
}

test.before(async () => {
  db = await setupTestDatabase("idempotency");
  if (!db) return;
  const hash = await bcrypt.hash("haslo-testowe-123", 4);
  await db.pool.query("INSERT INTO app_users (username, password_hash, role) VALUES ('adm', $1, 'admin')", [hash]);
  const app = require("../server/app");
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "adm", password: "haslo-testowe-123" })
  });
  assert.equal(response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 300));
  cookie = response.headers.get("set-cookie").split(";")[0];
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.teardown();
});

test("powtórzony zapis z tym samym kluczem tworzy jeden rekord i zwraca pierwszą odpowiedź", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const key = "klucz-testowy-0000000001";
  const before = await recipientCount();
  const first = await post("/catalogs/recipients", { name: "Odbiorca A" }, key);
  const second = await post("/catalogs/recipients", { name: "Odbiorca A" }, key);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(await recipientCount(), before + 1);
});

test("równoległe żądania z tym samym kluczem nie dublują zapisu", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const key = "klucz-testowy-0000000002";
  const before = await recipientCount();
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => post("/catalogs/recipients", { name: "Odbiorca B" }, key))
  );
  assert.ok(responses.every(response => [201, 409].includes(response.status)));
  assert.ok(responses.some(response => response.status === 201));
  assert.equal(await recipientCount(), before + 1);
});

test("ten sam klucz z inną treścią jest odrzucany, a błąd walidacji zwalnia klucz", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const key = "klucz-testowy-0000000003";
  const invalid = await post("/catalogs/recipients", { name: "" }, key);
  assert.equal(invalid.status, 400);
  const retried = await post("/catalogs/recipients", { name: "Odbiorca C" }, key);
  assert.equal(retried.status, 201);
  const different = await post("/catalogs/recipients", { name: "Odbiorca D" }, key);
  assert.equal(different.status, 422);
});

test("żądania bez klucza działają jak dotąd, a zły format klucza daje 400", async t => {
  if (!db) return t.skip("brak PostgreSQL");
  const before = await recipientCount();
  assert.equal((await post("/catalogs/recipients", { name: "Odbiorca E" })).status, 201);
  assert.equal((await post("/catalogs/recipients", { name: "Odbiorca F" })).status, 201);
  assert.equal(await recipientCount(), before + 2);
  assert.equal((await post("/catalogs/recipients", { name: "Odbiorca G" }, "krotki")).status, 400);
});
