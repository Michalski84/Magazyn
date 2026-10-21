// Korekty stanów magazynowych (KOR).
const { pool } = require("../database");
const { invalid, requireObject, requiredText, requiredId, optionalText } = require("./validation");
const { lockWarehouses, stockBalance } = require("./ledger");

// Tworzy dokument korekty stanu (KOR) i zapisuje ruchy magazynowe w jednej transakcji.
async function createAdjustment(input, userId) {
  requireObject(input, "Dane korekty");
  const warehouseId = requiredId(input.warehouseId, "magazyn");
  const itemId = requiredId(input.itemId, "towar");
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 99_999_999_999.999) {
    invalid("Korekta musi być niezerową liczbą.");
  }
  const delta = Math.round(quantity * 1000) / 1000;
  if (delta === 0) invalid("Korekta po zaokrągleniu musi być niezerowa.");
  const notes = requiredText(input.notes, "powód korekty");
  const orderNumber = optionalText(input.orderNumber, "numer zamówienia", 500);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockWarehouses(client, [warehouseId]);
    const warehouse = await client.query(
      "SELECT id, company_id, warehouse_type FROM warehouses WHERE id = $1 AND active",
      [warehouseId]
    );
    if (!warehouse.rowCount) {
      const error = new Error("Nie znaleziono aktywnego magazynu.");
      error.status = 404;
      throw error;
    }
    const item = await client.query("SELECT company_id FROM items WHERE id = $1 AND active", [itemId]);
    if (!item.rowCount) invalid("Towar nie istnieje lub jest nieaktywny.");
    const companyId = item.rows[0].company_id;
    if (warehouse.rows[0].warehouse_type !== "main" &&
        String(warehouse.rows[0].company_id) !== String(companyId)) {
      invalid("Wybrany towar należy do innej spółki niż magazyn.");
    }
    const current = await stockBalance(client, warehouseId, itemId);
    if (current + delta < 0) {
      const error = new Error("Korekta nie może spowodować ujemnego stanu magazynowego.");
      error.status = 409;
      throw error;
    }
    const reference = `KOR/${Date.now()}`;
    if (delta > 0) {
      const entry = await client.query(`
        INSERT INTO warehouse_stock_entries
          (company_id, warehouse_id, item_id, order_number, project_number, received_quantity, reference_no)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        companyId, warehouseId, itemId, orderNumber,
        optionalText(input.projectNumber, "numer projektu", 500), delta, reference
      ]);
      await client.query(`
        INSERT INTO stock_movements
          (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
           document_type, reference_no, created_by, notes)
        VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, 'adjustment', $6, $7, $8)
      `, [
        companyId, warehouseId, itemId, entry.rows[0].id,
        delta, reference, userId, notes
      ]);
    } else {
      let remaining = -delta;
      const entries = await client.query(`
        SELECT e.id, COALESCE(SUM(m.quantity_delta), 0) AS balance
          FROM warehouse_stock_entries e
          LEFT JOIN stock_movements m ON m.stock_entry_id = e.id
         WHERE e.warehouse_id = $1 AND e.item_id = $2
         GROUP BY e.id
        HAVING SUM(m.quantity_delta) > 0
         ORDER BY e.created_at, e.id
      `, [warehouseId, itemId]);
      for (const entry of entries.rows) {
        if (!remaining) break;
        const quantity = Math.min(remaining, Number(entry.balance));
        await client.query(`
          INSERT INTO stock_movements
            (company_id, warehouse_id, item_id, stock_entry_id, movement_type,
             quantity_delta, document_type, reference_no, created_by, notes)
          VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, 'adjustment', $6, $7, $8)
        `, [
          companyId, warehouseId, itemId, entry.id,
          -quantity, reference, userId, notes
        ]);
        remaining = Math.round((remaining - quantity) * 1000) / 1000;
      }
      if (remaining > 0) {
        const error = new Error("Nie udało się przypisać korekty do dostępnych partii. Odśwież stan i spróbuj ponownie.");
        error.status = 409;
        throw error;
      }
    }
    await client.query("COMMIT");
    return { warehouseId, itemId, quantityOnHand: current + delta };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createAdjustment };
