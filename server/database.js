const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) throw new Error("Brak DATABASE_URL w konfiguracji.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const directory = path.join(__dirname, "..", "migrations");
  const migrations = (await fs.readdir(directory))
    .filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort();

  for (const name of migrations) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(730421)");
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (applied.rowCount === 0) {
        const sql = await fs.readFile(path.join(directory, name), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { pool, runMigrations, closeDatabase };
