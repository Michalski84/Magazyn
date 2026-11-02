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

// Zwraca id aktywnego magazynu spółki o nazwie spółki; tworzy go, jeśli jeszcze nie istnieje.
async function ensureCompanyWarehouse(client, companyId) {
  const company = await client.query("SELECT name FROM companies WHERE id = $1", [companyId]);
  if (!company.rowCount) {
    const error = new Error("Nie znaleziono spółki.");
    error.status = 400;
    throw error;
  }
  await client.query(`
    INSERT INTO warehouses (company_id, name, warehouse_type)
    VALUES ($1, $2, 'other')
    ON CONFLICT (company_id, name) WHERE active DO NOTHING
  `, [companyId, company.rows[0].name]);
  const warehouse = await client.query(
    "SELECT id FROM warehouses WHERE company_id = $1 AND name = $2 AND active",
    [companyId, company.rows[0].name]
  );
  return warehouse.rows[0].id;
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

module.exports = { ensureCompanyWarehouse, lockWarehouses, stockBalance, stockEntryBalance, createDocumentNumber };
