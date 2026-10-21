// Pomocnik testów z bazą: tworzy osobny, tymczasowy schemat PostgreSQL dla danego pliku testów
// (nie wymaga uprawnienia CREATEDB i nie dotyka danych produkcyjnych).
// Gdy PostgreSQL jest niedostępny, zwraca null, a testy są pomijane.
require("dotenv").config();
const { Client } = require("pg");

// Przygotowuje schemat „test_<nazwa>”, ustawia DATABASE_URL (search_path) i uruchamia migracje.
async function setupTestDatabase(name) {
  if (!process.env.DATABASE_URL) return null;
  const schema = `test_${name}`;
  const baseUrl = process.env.DATABASE_URL;
  const admin = new Client({ connectionString: baseUrl });
  try {
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
  } catch (error) {
    await admin.end().catch(() => {});
    console.warn(`Pomijam testy z bazą: ${error.message}`);
    return null;
  }
  await admin.end();

  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "x".repeat(40);
  const database = require("../server/database");
  await database.runMigrations();

  // Usuwa schemat testowy po zakończeniu testów.
  async function teardown() {
    await database.pool.end();
    const cleanup = new Client({ connectionString: baseUrl });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanup.end();
  }
  return { pool: database.pool, teardown };
}

module.exports = { setupTestDatabase };
