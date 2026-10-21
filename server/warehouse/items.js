// Katalog towarów: odczyt i dodawanie towarów wraz z przyjęciem początkowym.
const { pool } = require("../database");
const { invalid, requireObject, requiredText, requiredId, optionalText, positiveQuantity } = require("./validation");
const { lockWarehouses } = require("./ledger");

// Zwraca katalog towarów (opcjonalnie dla jednej spółki).
async function getItems(companyId = null) {
  const result = await pool.query(`
    SELECT i.id, i.company_id AS "companyId", c.name AS "companyName",
           i.code, i.name, i.unit, i.category, i.description,
           i.minimum_stock AS "minimumStock", i.active
      FROM items i
      JOIN companies c ON c.id = i.company_id
     WHERE ($1::bigint IS NULL OR i.company_id = $1)
     ORDER BY c.name, i.name, i.unit
  `, [companyId || null]);
  return result.rows;
}

// Dodaje towar (i pozycję magazynową z przyjęciem początkowym) do magazynu spółki.
async function createItem(input, userId) {
  requireObject(input, "Dane pozycji");
  const name = requiredText(input.name, "nazwa towaru");
  const unit = requiredText(input.unit, "jednostka miary", 40);
  const quantity = positiveQuantity(input.quantity == null ? 1 : input.quantity, "ilość");
  const serialNumber = optionalText(input.serialNumber, "numer seryjny", 500);
  const orderNumber = optionalText(input.orderNumber, "numer zamówienia", 500);
  const projectNumber = optionalText(input.projectNumber, "numer projektu", 500);
  const supplier = optionalText(input.supplier, "dostawca", 500);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let companyId;
    if (input.companyId) {
      companyId = requiredId(input.companyId, "spółka");
      const compRes = await client.query("SELECT id FROM companies WHERE id = $1 AND active", [companyId]);
      if (!compRes.rowCount) {
        const error = new Error("Nie znaleziono aktywnej spółki.");
        error.status = 400;
        throw error;
      }
    } else if (input.companyName) {
      const compRes = await client.query("SELECT id FROM companies WHERE name = $1 AND active", [input.companyName.trim()]);
      if (!compRes.rowCount) {
        const error = new Error("Nie znaleziono aktywnej spółki.");
        error.status = 400;
        throw error;
      }
      companyId = compRes.rows[0].id;
    } else {
      invalid("Pole spółka jest wymagane.");
    }

    let warehouseId;
    if (input.warehouseId) {
      warehouseId = requiredId(input.warehouseId, "magazyn");
    } else {
      const main = await client.query("SELECT id FROM warehouses WHERE warehouse_type = 'main' AND active");
      if (!main.rowCount) {
        const error = new Error("Nie znaleziono aktywnego magazynu głównego.");
        error.status = 409;
        throw error;
      }
      warehouseId = main.rows[0].id;
    }

    await lockWarehouses(client, [warehouseId]);

    const warehouseRes = await client.query(
      "SELECT id, company_id, warehouse_type FROM warehouses WHERE id = $1 AND active",
      [warehouseId]
    );
    if (!warehouseRes.rowCount) {
      const error = new Error("Nie znaleziono aktywnego magazynu.");
      error.status = 404;
      throw error;
    }
    const wh = warehouseRes.rows[0];
    if (wh.warehouse_type !== "main" && String(wh.company_id) !== String(companyId)) {
      const error = new Error("Wybrany magazyn nie należy do wskazanej spółki.");
      error.status = 400;
      throw error;
    }

    const itemRes = await client.query(`
      INSERT INTO items (company_id, name, unit)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, name, unit) DO UPDATE SET active = TRUE
      RETURNING id, company_id AS "companyId", name, unit
    `, [companyId, name, unit]);
    const itemId = itemRes.rows[0].id;

    const reference = `PZ/RĘCZNE/${Date.now()}`;
    const entryRes = await client.query(`
      INSERT INTO warehouse_stock_entries
        (company_id, warehouse_id, item_id, order_number, project_number,
         received_quantity, reference_no, supplier, serial_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      companyId, warehouseId, itemId, orderNumber, projectNumber,
      quantity, reference, supplier, serialNumber
    ]);
    const stockEntryId = entryRes.rows[0].id;

    const note = `Przyjęcie ręczne${serialNumber ? `, SN: ${serialNumber}` : ""}${supplier ? `, dostawca: ${supplier}` : ""}`;
    await client.query(`
      INSERT INTO stock_movements
        (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
         document_type, reference_no, created_by, notes)
      VALUES ($1, $2, $3, $4, 'IN', $5, 'receipt', $6, $7, $8)
    `, [
      companyId, warehouseId, itemId, stockEntryId,
      quantity, reference, userId || null, note
    ]);

    await client.query("COMMIT");
    return {
      itemId,
      stockEntryId,
      companyId,
      warehouseId,
      name,
      unit,
      quantity,
      serialNumber,
      orderNumber,
      projectNumber,
      supplier
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getItems, createItem };
