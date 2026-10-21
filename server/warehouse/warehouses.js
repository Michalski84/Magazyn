// Spółki i magazyny: odczyt, tworzenie, edycja oraz usuwanie magazynów.
const { pool } = require("../database");
const { requireObject, requiredText, requiredId } = require("./validation");
const { lockWarehouses, stockEntryBalance } = require("./ledger");

// Zwraca spółki dostępne w module magazynu.
async function getCompanies() {
  const result = await pool.query(`
    SELECT id, name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, nip, active
      FROM companies ORDER BY name
  `);
  return result.rows;
}

// Zwraca listę magazynów.
async function getWarehouses() {
  const result = await pool.query(`
    SELECT w.id, w.company_id AS "companyId", c.name AS "companyName",
           w.name, w.code, w.warehouse_type AS type, w.address, w.active
      FROM warehouses w
      LEFT JOIN companies c ON c.id = w.company_id
     WHERE w.active
     ORDER BY (w.warehouse_type = 'main') DESC, c.name NULLS FIRST, w.name
  `);
  return result.rows;
}

// Dodaje magazyn.
async function createWarehouse(input) {
  requireObject(input, "Dane magazynu");
  const companyId = requiredId(input.companyId, "spółka");
  const name = requiredText(input.name, "nazwa magazynu");
  try {
    const result = await pool.query(`
      INSERT INTO warehouses (company_id, name, warehouse_type)
      SELECT id, $2, 'other'
        FROM companies
       WHERE id = $1 AND active
      RETURNING id, company_id AS "companyId", name, warehouse_type AS type, active
    `, [companyId, name]);
    if (!result.rowCount) {
      const error = new Error("Nie znaleziono aktywnej spółki.");
      error.status = 400;
      throw error;
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Magazyn o tej nazwie już istnieje w tej spółce.";
    }
    throw error;
  }
}

// Aktualizuje magazyn.
async function updateWarehouse(warehouseId, input) {
  const id = requiredId(warehouseId, "magazyn");
  requireObject(input, "Dane magazynu");
  const name = requiredText(input.name, "nazwa magazynu");
  try {
    const result = await pool.query(`
      UPDATE warehouses
         SET name = $2
       WHERE id = $1 AND warehouse_type <> 'main' AND active
      RETURNING id, company_id AS "companyId", name, warehouse_type AS type, active
    `, [id, name]);
    if (!result.rowCount) {
      const error = new Error("Nie znaleziono aktywnego magazynu do edycji albo jest to magazyn główny.");
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Magazyn o tej nazwie już istnieje w tej spółce.";
    }
    throw error;
  }
}

// Usuwa magazyn (nie główny); dodatnie stany przenosi najpierw do magazynu głównego.
async function deleteWarehouse(warehouseId, userId) {
  const id = requiredId(warehouseId, "magazyn");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      "SELECT id, name, warehouse_type FROM warehouses WHERE id = $1 AND active",
      [id]
    );
    if (!selected.rowCount) {
      const error = new Error("Nie znaleziono aktywnego magazynu.");
      error.status = 404;
      throw error;
    }
    if (selected.rows[0].warehouse_type === "main") {
      const error = new Error("Magazynu głównego nie można usunąć.");
      error.status = 400;
      throw error;
    }
    const main = await client.query(
      "SELECT id FROM warehouses WHERE warehouse_type = 'main' AND active"
    );
    if (!main.rowCount) {
      const error = new Error("Nie znaleziono aktywnego magazynu głównego.");
      error.status = 409;
      throw error;
    }
    const mainId = String(main.rows[0].id);
    await lockWarehouses(client, [id, mainId]);
    const entries = await client.query(`
      SELECT id, company_id, item_id, order_number, project_number,
             reference_no, supplier, serial_number
        FROM warehouse_stock_entries
       WHERE warehouse_id = $1
       ORDER BY id
       FOR UPDATE
    `, [id]);
    let movedEntries = 0;
    for (const entry of entries.rows) {
      const balance = await stockEntryBalance(client, entry.id);
      if (balance <= 0) continue;
      const note = `Przeniesienie do magazynu głównego przed usunięciem magazynu „${selected.rows[0].name}”.`;
      const destination = await client.query(`
        INSERT INTO warehouse_stock_entries
          (company_id, warehouse_id, item_id, source_entry_id, order_number,
           project_number, received_quantity, reference_no, supplier, serial_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        entry.company_id, mainId, entry.item_id, entry.id, entry.order_number,
        entry.project_number, balance, entry.reference_no, entry.supplier, entry.serial_number
      ]);
      await client.query(`
        INSERT INTO stock_movements
          (company_id, warehouse_id, item_id, stock_entry_id, movement_type,
           quantity_delta, document_type, reference_no, created_by, notes)
        VALUES
          ($1, $2, $3, $4, 'TRANSFER', $5, 'transfer', $6, $7, $8),
          ($1, $9, $3, $10, 'TRANSFER', $11, 'transfer', $6, $7, $8)
      `, [
        entry.company_id, id, entry.item_id, entry.id, -balance,
        selected.rows[0].name, userId, note, mainId, destination.rows[0].id, balance
      ]);
      movedEntries += 1;
    }
    await client.query("UPDATE warehouses SET active = FALSE WHERE id = $1", [id]);
    await client.query("COMMIT");
    return { id, movedEntries };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getCompanies, getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse };
