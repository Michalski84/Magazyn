// Wspólne operacje na księdze ruchów magazynowych: blokady, salda i numeracja dokumentów.
// Blokuje wiersze magazynów (w stałej kolejności), aby serializować równoległe operacje.
async function lockWarehouses(client, warehouseIds) {
  const ids = [...new Set(warehouseIds.map(String))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const result = await client.query(
    "SELECT id FROM warehouses WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE",
    [ids]
  );
  if (result.rowCount !== ids.length) {
    const error = new Error("Nie znaleziono jednego z wybranych magazynów.");
    error.status = 404;
    throw error;
  }
}

// Zwraca bieżący stan towaru w magazynie.
async function stockBalance(client, warehouseId, itemId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS balance
      FROM stock_movements
     WHERE warehouse_id = $1 AND item_id = $2
  `, [warehouseId, itemId]);
  return Number(result.rows[0].balance);
}

// Zwraca bieżący stan pojedynczej pozycji magazynowej.
async function stockEntryBalance(client, stockEntryId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS balance
      FROM stock_movements
     WHERE stock_entry_id = $1
  `, [stockEntryId]);
  return Number(result.rows[0].balance);
}

// Nadaje kolejny numer dokumentu (prefiks + rok + licznik) w podanej tabeli.
async function createDocumentNumber(client, table, year, prefix) {
  const allowedTables = new Set(["warehouse_document_counters", "warehouse_mm_counters"]);
  if (!allowedTables.has(table)) throw new Error("Nieprawidłowy licznik dokumentów.");
  const result = await client.query(`
    INSERT INTO ${table} (year, last_number)
    VALUES ($1, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = ${table}.last_number + 1
    RETURNING last_number::TEXT AS number
  `, [year]);
  return `${prefix}/${year}/${result.rows[0].number.padStart(4, "0")}`;
}

module.exports = { lockWarehouses, stockBalance, stockEntryBalance, createDocumentNumber };
