// Stany magazynowe: pozycje, ich edycja/usuwanie oraz historia ruchów.
const { pool } = require("../database");
const { invalid, requireObject, requiredText, requiredId, optionalText, validDate } = require("./validation");
const { stockEntryBalance } = require("./ledger");

// Blokuje i zwraca aktywną pozycję magazynową.
async function lockActiveEntry(client, id) {
  const result = await client.query(`
    SELECT id, company_id, warehouse_id, item_id
      FROM warehouse_stock_entries
     WHERE id = $1 AND active
     FOR UPDATE
  `, [id]);
  if (!result.rowCount) {
    const error = new Error("Nie znaleziono pozycji magazynowej.");
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

// Zapisuje ruch korygujący dla pozycji magazynowej.
async function insertAdjustment(client, entry, delta, userId, note) {
  await client.query(`
    INSERT INTO stock_movements
      (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
       document_type, reference_no, created_by, notes)
    VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, 'adjustment', $6, $7, $8)
  `, [
    entry.company_id, entry.warehouse_id, entry.item_id, entry.id,
    delta, `KOR/${Date.now()}`, userId || null, note
  ]);
}

// Edytuje pozycję magazynową (towar, ilość, zamówienie, projekt, dostawcę, numer seryjny); różnicę ilości zapisuje jako ruch korygujący.
async function updateStockEntry(entryId, input, userId) {
  const id = requiredId(entryId, "pozycja");
  requireObject(input, "Dane pozycji");
  const name = requiredText(input.name, "nazwa towaru");
  const unit = requiredText(input.unit, "jednostka miary", 40);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) invalid("Ilość musi być liczbą nieujemną.");
  const serialNumber = optionalText(input.serialNumber, "numer seryjny", 500);
  const orderNumber = optionalText(input.orderNumber, "numer zamówienia", 500);
  const projectNumber = optionalText(input.projectNumber, "numer projektu", 500);
  const supplier = optionalText(input.supplier, "dostawca", 500);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = await lockActiveEntry(client, id);
    const itemRes = await client.query(`
      INSERT INTO items (company_id, name, unit)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, name, unit) DO UPDATE SET active = TRUE
      RETURNING id
    `, [entry.company_id, name, unit]);
    const itemId = itemRes.rows[0].id;
    await client.query(`
      UPDATE warehouse_stock_entries
         SET item_id = $2, order_number = $3, project_number = $4,
             supplier = $5, serial_number = $6
       WHERE id = $1
    `, [id, itemId, orderNumber, projectNumber, supplier, serialNumber]);
    await client.query("UPDATE stock_movements SET item_id = $2 WHERE stock_entry_id = $1", [id, itemId]);
    entry.item_id = itemId;

    const balance = await stockEntryBalance(client, id);
    const delta = Math.round((quantity - balance) * 1000) / 1000;
    if (delta !== 0) {
      await insertAdjustment(client, entry, delta, userId, "Edycja pozycji magazynowej");
    }
    await client.query("COMMIT");
    return { stockEntryId: id, quantity };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Usuwa (dezaktywuje) pozycję magazynową z zapisem ruchu.
async function deleteStockEntry(entryId, userId) {
  const id = requiredId(entryId, "pozycja");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = await lockActiveEntry(client, id);
    const balance = await stockEntryBalance(client, id);
    if (balance > 0) {
      await insertAdjustment(client, entry, -balance, userId, "Usunięcie pozycji z magazynu");
    }
    await client.query("UPDATE warehouse_stock_entries SET active = FALSE WHERE id = $1", [id]);
    await client.query("COMMIT");
    return { stockEntryId: id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Zwraca stany magazynowe z filtrami spółki, magazynu i wyszukiwania.
async function getStock({ companyId = null, warehouseId = null, search = "" } = {}) {
  const result = await pool.query(`
    SELECT w.id AS "warehouseId", w.name AS "warehouseName",
           c.id AS "companyId", c.name AS "companyName",
           i.id AS "itemId", i.code, i.name, i.unit, i.category,
           i.minimum_stock AS "minimumStock",
           s.stock_entry_id AS "stockEntryId",
           s.order_number AS "orderNumber",
           e.project_number AS "projectNumber",
           e.supplier,
           e.serial_number AS "serialNumber",
           s.quantity_in AS "quantityIn",
           s.quantity_out AS "quantityOut",
           s.quantity_on_hand AS "quantityOnHand",
           COALESCE((
             SELECT json_agg(json_build_object(
                      'issueId', d.id, 'documentNo', d.document_no, 'quantity', l.quantity)
                    ORDER BY d.issue_date, d.id, l.id)
               FROM issue_document_lines l
               JOIN issue_documents d ON d.id = l.issue_document_id
              WHERE l.stock_entry_id = s.stock_entry_id AND d.status = 'issued'
           ), '[]'::json) AS "issues",
           SUM(s.quantity_on_hand) OVER (PARTITION BY w.id, i.id) AS "itemQuantityOnHand"
      FROM warehouse_stock s
      JOIN warehouses w ON w.id = s.warehouse_id
      JOIN companies c ON c.id = s.company_id
      JOIN items i ON i.id = s.item_id AND i.active
      JOIN warehouse_stock_entries e ON e.id = s.stock_entry_id
     WHERE w.active AND e.active
       AND ($1::bigint IS NULL OR c.id = $1)
       AND ($2::bigint IS NULL OR w.id = $2)
       AND ($3 = '' OR i.name ILIKE '%' || $3 || '%' OR i.code ILIKE '%' || $3 || '%'
            OR s.order_number ILIKE '%' || $3 || '%'
            OR e.project_number ILIKE '%' || $3 || '%'
            OR e.supplier ILIKE '%' || $3 || '%'
            OR e.serial_number ILIKE '%' || $3 || '%')
     ORDER BY c.name, w.name, i.name, s.order_number, s.stock_entry_id
  `, [companyId || null, warehouseId || null, search.trim()]);
  return result.rows.map(row => ({
    ...row,
    quantityIn: Number(row.quantityIn),
    quantityOut: Number(row.quantityOut),
    quantityOnHand: Number(row.quantityOnHand),
    minimumStock: Number(row.minimumStock),
    itemQuantityOnHand: Number(row.itemQuantityOnHand),
    lowStock: Number(row.itemQuantityOnHand) <= Number(row.minimumStock)
  }));
}

// Zwraca historię ruchów magazynowych z filtrami.
async function getMovements({ warehouseId = null, itemId = null, stockEntryId = null, from = null, to = null } = {}) {
  if (from) validDate(from, "data początkowa");
  if (to) validDate(to, "data końcowa");
  if (from && to && from > to) invalid("Data początkowa nie może być późniejsza niż końcowa.");
  const result = await pool.query(`
    SELECT m.id, m.movement_type AS type, m.quantity_delta AS quantity,
           m.document_type AS "documentType", m.document_id AS "documentId",
           m.reference_no AS reference, m.notes, m.created_at AS "createdAt",
           u.username AS "createdBy", w.name AS "warehouseName",
         c.name AS "companyName", i.name AS "itemName", i.unit,
         e.order_number AS "orderNumber"
    FROM stock_movements m
    JOIN warehouses w ON w.id = m.warehouse_id
    JOIN companies c ON c.id = m.company_id
    JOIN items i ON i.id = m.item_id
    JOIN warehouse_stock_entries e ON e.id = m.stock_entry_id
    LEFT JOIN app_users u ON u.id = m.created_by
     WHERE ($1::bigint IS NULL OR m.warehouse_id = $1)
     AND ($2::bigint IS NULL OR m.item_id = $2)
     AND ($3::bigint IS NULL OR m.stock_entry_id = $3)
     AND ($4::date IS NULL OR m.created_at::date >= $4)
     AND ($5::date IS NULL OR m.created_at::date <= $5)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1000
  `, [warehouseId || null, itemId || null, stockEntryId || null, from || null, to || null]);
  return result.rows;
}

module.exports = { updateStockEntry, deleteStockEntry, getStock, getMovements };
