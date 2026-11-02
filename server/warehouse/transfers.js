// Przesunięcia międzymagazynowe (MM).
const { pool } = require("../database");
const { invalid, requireObject, requiredId, optionalText, positiveQuantity } = require("./validation");
const { lockWarehouses, stockEntryBalance, createDocumentNumber } = require("./ledger");

// Tworzy przesunięcie międzymagazynowe (MM) w jednej transakcji.
async function createTransfer(input, userId) {
  requireObject(input, "Dane dokumentu MM");
  const sourceId = requiredId(input.sourceWarehouseId, "magazyn źródłowy");
  const targetId = requiredId(input.targetWarehouseId, "magazyn docelowy");
  if (sourceId === targetId) invalid("Magazyn źródłowy i docelowy muszą być różne.");
  const notes = optionalText(input.notes, "uwagi");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 500) {
    invalid("Dokument MM musi zawierać od 1 do 500 pozycji.");
  }
  const grouped = new Map();
  input.lines.forEach((line, index) => {
    const stockEntryId = requiredId(line?.stockEntryId, `partia w pozycji ${index + 1}`);
    const quantity = positiveQuantity(line?.quantity, `ilość w pozycji ${index + 1}`);
    const existing = grouped.get(stockEntryId);
    if (existing) existing.quantity = Math.round((existing.quantity + quantity) * 1000) / 1000;
    else grouped.set(stockEntryId, { stockEntryId, quantity });
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockWarehouses(client, [sourceId, targetId]);
    const warehouses = await client.query(
      "SELECT id, name, company_id, warehouse_type FROM warehouses WHERE id = ANY($1::bigint[]) AND active",
      [[sourceId, targetId]]
    );
    const target = warehouses.rows.find(row => String(row.id) === targetId);
    if (warehouses.rowCount !== 2 || !target) {
      const error = new Error("Wybrany magazyn jest nieaktywny lub nie istnieje.");
      error.status = 404;
      throw error;
    }
    const source = warehouses.rows.find(row => String(row.id) === sourceId);

    const year = new Date().getFullYear();
    const documentNo = await createDocumentNumber(client, "warehouse_mm_counters", year, "MM");
    const note = `Przesunięcie MM: ${source.name} → ${target.name}${notes ? `. ${notes}` : ""}`;
    for (const line of grouped.values()) {
      const entry = await client.query(`
        SELECT e.id, e.company_id, e.item_id, e.order_number, e.project_number,
               e.supplier, e.serial_number, i.unit
          FROM warehouse_stock_entries e
          JOIN items i ON i.id = e.item_id
         WHERE e.id = $1 AND e.warehouse_id = $2 AND i.active
         FOR UPDATE OF e
      `, [line.stockEntryId, sourceId]);
      if (!entry.rowCount) {
        const error = new Error("Wybrana partia nie należy do magazynu źródłowego.");
        error.status = 400;
        throw error;
      }
      const row = entry.rows[0];
      if (String(target.company_id) !== String(row.company_id)) {
        invalid("Towar można przesunąć tylko do magazynu tej samej spółki.");
      }
      const available = await stockEntryBalance(client, row.id);
      if (line.quantity > available) {
        const error = new Error(`Brak wystarczającego stanu. Dostępne: ${available} ${row.unit}.`);
        error.status = 409;
        throw error;
      }
      const destination = await client.query(`
        INSERT INTO warehouse_stock_entries
          (company_id, warehouse_id, item_id, source_entry_id, order_number,
           project_number, received_quantity, reference_no, supplier, serial_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        row.company_id, targetId, row.item_id, row.id, row.order_number,
        row.project_number, line.quantity, documentNo, row.supplier, row.serial_number
      ]);
      await client.query(`
        INSERT INTO stock_movements
          (company_id, warehouse_id, item_id, stock_entry_id, movement_type,
           quantity_delta, document_type, reference_no, created_by, notes)
        VALUES
          ($1, $2, $3, $4, 'TRANSFER', $5, 'transfer', $6, $7, $8),
          ($1, $9, $3, $10, 'TRANSFER', $11, 'transfer', $6, $7, $8)
      `, [
        row.company_id, sourceId, row.item_id, row.id, -line.quantity,
        documentNo, userId || null, note, targetId, destination.rows[0].id, line.quantity
      ]);
    }
    await client.query("COMMIT");
    return { documentNo, lineCount: grouped.size };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createTransfer };
