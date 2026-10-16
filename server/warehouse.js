const { pool } = require("./database");

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requireObject(input, name) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid(`${name} musi być obiektem.`);
  }
}

function requiredText(value, field, maxLength = 500) {
  if (typeof value !== "string") invalid(`Pole ${field} jest wymagane.`);
  const result = value.trim();
  if (!result || result.length > maxLength) invalid(`Nieprawidłowa wartość pola ${field}.`);
  return result;
}

function requiredId(value, field) {
  const id = requiredText(String(value || ""), field, 19);
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n) {
    invalid(`Nieprawidłowy identyfikator pola ${field}.`);
  }
  return id;
}

function optionalText(value, field, maxLength = 2000) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > maxLength) invalid(`Nieprawidłowa wartość pola ${field}.`);
  return value.trim();
}

function positiveQuantity(value, field = "ilość") {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99_999_999_999.999) {
    invalid(`Pole ${field} musi być większe od zera.`);
  }
  const rounded = Math.round(quantity * 1000) / 1000;
  if (rounded <= 0) invalid(`Pole ${field} musi być większe od zera.`);
  return rounded;
}

function validDate(value, field) {
  const date = requiredText(value, field, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    invalid(`Pole ${field} musi zawierać poprawną datę w formacie RRRR-MM-DD.`);
  }
  return date;
}

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

async function stockBalance(client, warehouseId, itemId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS balance
      FROM stock_movements
     WHERE warehouse_id = $1 AND item_id = $2
  `, [warehouseId, itemId]);
  return Number(result.rows[0].balance);
}

async function stockEntryBalance(client, stockEntryId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS balance
      FROM stock_movements
     WHERE stock_entry_id = $1
  `, [stockEntryId]);
  return Number(result.rows[0].balance);
}

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

async function getCompanies() {
  const result = await pool.query(`
    SELECT id, name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, nip, active
      FROM companies ORDER BY name
  `);
  return result.rows;
}

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

const DELIVERY_METHODS = new Set(["courier", "personal_pickup", "own_transport", "dedicated_transport"]);

function parseIssueHeader(input) {
  const deliveryMethod = requiredText(input.deliveryMethod, "sposób dostawy", 30);
  if (!DELIVERY_METHODS.has(deliveryMethod)) invalid("Wybierz poprawny sposób dostawy.");
  const deliveryTrackingNumber = deliveryMethod === "courier"
    ? optionalText(input.deliveryTrackingNumber, "numer listu przewozowego", 500)
    : "";
  const receivingPerson = deliveryMethod === "personal_pickup"
    ? optionalText(input.receivingPerson, "osoba odbierająca", 500)
    : "";
  if (deliveryMethod === "courier" && !deliveryTrackingNumber) {
    invalid("Podaj numer listu przewozowego dla dostawy kurierem.");
  }
  if (deliveryMethod === "personal_pickup" && !receivingPerson) {
    invalid("Podaj nazwisko osoby odbierającej przy odbiorze osobistym.");
  }
  return {
    issueDate: validDate(input.issueDate, "data wydania"),
    recipientId: requiredId(input.recipientId, "odbiorca"),
    projectNumber: optionalText(input.projectNumber, "numer projektu", 500),
    deliveryMethod,
    deliveryTrackingNumber,
    receivingPerson
  };
}

function issueAddressLine(party) {
  return [
    [party.street, party.buildingNumber].filter(Boolean).join(" "),
    [party.postalCode, party.city].filter(Boolean).join(" ")
  ].filter(Boolean).join("\n");
}

async function loadIssueRecipient(client, recipientId) {
  const recipientResult = await client.query(`
    SELECT name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, address2,
           contact_person AS "contactPerson", phone
      FROM recipients WHERE id = $1
  `, [recipientId]);
  if (!recipientResult.rowCount) {
    const error = new Error("Nie znaleziono wybranego odbiorcy.");
    error.status = 404;
    throw error;
  }
  const recipient = recipientResult.rows[0];
  return recipient;
}

async function createIssue(input, userId) {
  requireObject(input, "Dane dokumentu WZ");
  const warehouseId = requiredId(input.warehouseId, "magazyn");
  const header = parseIssueHeader(input);
  const { issueDate, recipientId, deliveryMethod, deliveryTrackingNumber, receivingPerson } = header;
  let projectNumber = header.projectNumber;
  let issuedTo = "";
  const notes = "";
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 500) {
    invalid("Dokument WZ musi zawierać od 1 do 500 pozycji.");
  }
  const lines = input.lines.map((line, index) => ({
    stockEntryId: requiredId(line?.stockEntryId, `partia w pozycji ${index + 1}`),
    quantity: positiveQuantity(line?.quantity, `ilość w pozycji ${index + 1}`),
    serialNumber: line?.serialNumber == null
      ? null
      : optionalText(line.serialNumber, `SN w pozycji ${index + 1}`, 2000)
  }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockWarehouses(client, [warehouseId]);
    const warehouse = await client.query(
      "SELECT id FROM warehouses WHERE id = $1 AND active",
      [warehouseId]
    );
    if (!warehouse.rowCount) {
      const error = new Error("Wybrany magazyn jest nieaktywny lub nie istnieje.");
      error.status = 404;
      throw error;
    }
    const grouped = new Map();
    for (const line of lines) {
      const existing = grouped.get(line.stockEntryId);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + line.quantity) * 1000) / 1000;
        if (existing.quantity > 99_999_999_999.999) invalid("Suma ilości pozycji WZ przekracza dopuszczalny zakres.");
        if (line.serialNumber != null) {
          existing.serialNumber = [existing.serialNumber, line.serialNumber].filter(Boolean).join(", ");
        }
      } else {
        grouped.set(line.stockEntryId, { ...line });
      }
    }
    const companyIds = new Set();
    for (const line of grouped.values()) {
      const item = await client.query(
        `SELECT e.item_id AS "itemId", e.order_number AS "orderNumber",
                e.project_number AS "projectNumber",
                e.company_id AS "companyId", e.serial_number AS "serialNumber", i.unit
           FROM warehouse_stock_entries e
           JOIN items i ON i.id = e.item_id
          WHERE e.id = $1 AND e.warehouse_id = $2 AND i.active`,
        [line.stockEntryId, warehouseId]
      );
      if (!item.rowCount) {
        const error = new Error("Wybrana partia nie należy do magazynu lub jej towar jest nieaktywny.");
        error.status = 400;
        throw error;
      }
      line.itemId = item.rows[0].itemId;
      line.unit = item.rows[0].unit;
      line.orderNumber = item.rows[0].orderNumber;
      line.projectNumber = item.rows[0].projectNumber;
      line.companyId = item.rows[0].companyId;
      if (line.serialNumber == null) line.serialNumber = item.rows[0].serialNumber;
      companyIds.add(String(line.companyId));
      const available = await stockEntryBalance(client, line.stockEntryId);
      if (line.quantity > available) {
        const error = new Error(`Brak wystarczającego stanu. Dostępne: ${available} ${line.unit}.`);
        error.status = 409;
        throw error;
      }
    }
    if (companyIds.size !== 1) invalid("Jeden dokument WZ może obejmować towar tylko jednej spółki.");
    const companyId = [...grouped.values()][0].companyId;
    const company = await client.query(`
      SELECT name, street, building_number AS "buildingNumber",
             postal_code AS "postalCode", city, nip
        FROM companies WHERE id = $1
    `, [companyId]);
    if (!company.rowCount) {
      const error = new Error("Nie znaleziono spółki wystawiającej dokument WZ.");
      error.status = 404;
      throw error;
    }
    const seller = company.rows[0];
    if (![seller.street, seller.buildingNumber, seller.postalCode, seller.city, seller.nip].every(Boolean)) {
      invalid(`Uzupełnij adres i NIP spółki ${seller.name} w kartotece Spółki przed wystawieniem WZ.`);
    }
    const recipient = await loadIssueRecipient(client, recipientId);
    issuedTo = recipient.name;
    const addressLine = issueAddressLine;
    if (!projectNumber) {
      projectNumber = [...new Set([...grouped.values()].map(line => line.projectNumber).filter(Boolean))]
        .join(", ").slice(0, 500);
    }

    const year = Number(issueDate.slice(0, 4));
    const documentNo = await createDocumentNumber(client, "warehouse_document_counters", year, "WZ");
    const document = await client.query(`
      INSERT INTO issue_documents
        (company_id, warehouse_id, document_no, issue_date, issued_to, created_by, notes,
         recipient_id, seller_name, seller_address, seller_nip, recipient_address,
         recipient_address2, recipient_contact, recipient_phone, project_number,
         delivery_method, delivery_tracking_number, receiving_person)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19)
      RETURNING id, document_no AS "documentNo"
    `, [
      companyId, warehouseId, documentNo, issueDate, issuedTo, userId, notes,
      recipientId, seller.name, addressLine(seller), seller.nip,
      addressLine(recipient), recipient.address2, recipient.contactPerson, recipient.phone,
      projectNumber, deliveryMethod, deliveryTrackingNumber, receivingPerson
    ]);
    const documentId = document.rows[0].id;
    for (const line of grouped.values()) {
      await client.query(`
        INSERT INTO issue_document_lines
          (issue_document_id, stock_entry_id, item_id, quantity, unit, order_number, serial_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        documentId, line.stockEntryId, line.itemId, line.quantity,
        line.unit, line.orderNumber, line.serialNumber
      ]);
      await client.query(`
        INSERT INTO stock_movements
          (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
           document_type, document_id, reference_no, created_by)
        VALUES ($1, $2, $3, $4, 'OUT', $5, 'wz', $6, $7, $8)
      `, [
        companyId, warehouseId, line.itemId, line.stockEntryId,
        -line.quantity, documentId, documentNo, userId
      ]);
    }
    await client.query("COMMIT");
    return await getIssue(documentId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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
      if (target.warehouse_type !== "main" && String(target.company_id) !== String(row.company_id)) {
        invalid("Towar można przesunąć tylko do magazynu głównego lub magazynu tej samej spółki.");
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

async function getIssue(id) {
  const document = await pool.query(`
    SELECT d.id, d.company_id AS "companyId", c.name AS "companyName",
           d.warehouse_id AS "warehouseId", w.name AS "warehouseName",
           d.document_no AS "documentNo", to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate",
           d.issued_to AS "issuedTo", d.recipient_id AS "recipientId", d.seller_name AS "sellerName",
           d.seller_address AS "sellerAddress", d.seller_nip AS "sellerNip",
           d.recipient_address AS "recipientAddress",
           d.recipient_address2 AS "recipientAddress2",
           d.recipient_contact AS "recipientContact",
           d.recipient_phone AS "recipientPhone",
           d.project_number AS "projectNumber", d.delivery_method AS "deliveryMethod",
           d.delivery_tracking_number AS "deliveryTrackingNumber",
           d.receiving_person AS "receivingPerson", d.status, d.notes,
           d.created_at AS "createdAt", u.username AS "createdBy",
           COALESCE(json_agg(json_build_object(
             'itemId', l.item_id, 'stockEntryId', l.stock_entry_id,
             'name', i.name, 'unit', l.unit, 'quantity', l.quantity,
             'orderNumber', l.order_number, 'serialNumber', l.serial_number
           ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS lines
      FROM issue_documents d
      JOIN companies c ON c.id = d.company_id
      JOIN warehouses w ON w.id = d.warehouse_id
      LEFT JOIN app_users u ON u.id = d.created_by
      LEFT JOIN issue_document_lines l ON l.issue_document_id = d.id
      LEFT JOIN items i ON i.id = l.item_id
     WHERE d.id = $1
     GROUP BY d.id, c.id, w.id, u.id
  `, [id]);
  return document.rows[0] || null;
}

async function getIssues() {
  const result = await pool.query(`
    SELECT d.id, d.document_no AS "documentNo", to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate",
           d.issued_to AS "issuedTo", d.status, d.created_at AS "createdAt",
           c.name AS "companyName", w.name AS "warehouseName",
           u.username AS "createdBy",
           COUNT(l.id)::INTEGER AS "lineCount"
      FROM issue_documents d
      JOIN companies c ON c.id = d.company_id
      JOIN warehouses w ON w.id = d.warehouse_id
      LEFT JOIN app_users u ON u.id = d.created_by
      LEFT JOIN issue_document_lines l ON l.issue_document_id = d.id
     GROUP BY d.id, c.id, w.id, u.id
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT 500
  `);
  return result.rows;
}

async function updateIssue(id, input) {
  requireObject(input, "Dane dokumentu WZ");
  const header = parseIssueHeader(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const document = await client.query(
      "SELECT status FROM issue_documents WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (!document.rowCount) {
      const error = new Error("Nie znaleziono dokumentu WZ.");
      error.status = 404;
      throw error;
    }
    if (document.rows[0].status !== "issued") {
      const error = new Error("Nie można edytować anulowanego dokumentu WZ.");
      error.status = 409;
      throw error;
    }
    const recipient = await loadIssueRecipient(client, header.recipientId);
    await client.query(`
      UPDATE issue_documents
         SET issue_date = $2, recipient_id = $3, issued_to = $4, recipient_address = $5,
             recipient_address2 = $6, recipient_contact = $7, recipient_phone = $8,
             project_number = $9, delivery_method = $10, delivery_tracking_number = $11,
             receiving_person = $12
       WHERE id = $1
    `, [
      id, header.issueDate, header.recipientId, recipient.name, issueAddressLine(recipient),
      recipient.address2, recipient.contactPerson, recipient.phone,
      header.projectNumber, header.deliveryMethod, header.deliveryTrackingNumber, header.receivingPerson
    ]);
    await client.query("COMMIT");
    return await getIssue(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cancelIssue(id, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const document = await client.query(
      "SELECT * FROM issue_documents WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (!document.rowCount) {
      const error = new Error("Nie znaleziono dokumentu WZ.");
      error.status = 404;
      throw error;
    }
    const issue = document.rows[0];
    const issueWarehouse = await client.query(
      "SELECT id, active FROM warehouses WHERE id = $1",
      [issue.warehouse_id]
    );
    if (!issueWarehouse.rowCount) {
      const error = new Error("Nie znaleziono magazynu z dokumentu WZ.");
      error.status = 409;
      throw error;
    }
    let returnWarehouseId = issue.warehouse_id;
    if (!issueWarehouse.rows[0].active) {
      const main = await client.query(
        "SELECT id FROM warehouses WHERE warehouse_type = 'main' AND active"
      );
      if (!main.rowCount) {
        const error = new Error("Nie znaleziono aktywnego magazynu głównego do zwrotu towaru.");
        error.status = 409;
        throw error;
      }
      returnWarehouseId = main.rows[0].id;
    }
    await lockWarehouses(client, [issue.warehouse_id, returnWarehouseId]);
    if (issue.status === "cancelled") {
      const error = new Error("Dokument WZ jest już anulowany.");
      error.status = 409;
      throw error;
    }
    const lines = await client.query(
      `SELECT l.item_id, l.stock_entry_id, l.quantity,
              e.order_number, e.project_number, e.reference_no, e.supplier, e.serial_number
         FROM issue_document_lines l
         JOIN warehouse_stock_entries e ON e.id = l.stock_entry_id
        WHERE l.issue_document_id = $1`,
      [id]
    );
    for (const line of lines.rows) {
      let stockEntryId = line.stock_entry_id;
      if (String(returnWarehouseId) !== String(issue.warehouse_id)) {
        const entry = await client.query(`
          INSERT INTO warehouse_stock_entries
            (company_id, warehouse_id, item_id, source_entry_id, order_number,
             project_number, received_quantity, reference_no, supplier, serial_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          issue.company_id, returnWarehouseId, line.item_id, line.stock_entry_id,
          line.order_number, line.project_number, line.quantity, line.reference_no, line.supplier,
          line.serial_number
        ]);
        stockEntryId = entry.rows[0].id;
      }
      await client.query(`
        INSERT INTO stock_movements
          (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
           document_type, document_id, reference_no, created_by, notes)
        VALUES ($1, $2, $3, $4, 'RETURN', $5, 'wz', $6, $7, $8, 'Anulowanie dokumentu WZ')
      `, [
        issue.company_id, returnWarehouseId, line.item_id, stockEntryId,
        line.quantity, id, issue.document_no, userId
      ]);
    }
    await client.query(
      "UPDATE issue_documents SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1",
      [id]
    );
    await client.query("COMMIT");
    return getIssue(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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

async function receiveShipment(client, shipmentId, shipment, userId) {
  const choice = shipment.warehouseId;
  if (!choice) return null;
  if (choice === "none") {
    await client.query("UPDATE shipments SET received_without_warehouse = TRUE WHERE id = $1", [shipmentId]);
    return null;
  }
  if (!shipment.zawartosc.length) return null;
  const warehouse = await client.query(
    "SELECT id FROM warehouses WHERE active AND warehouse_type = 'main' FOR UPDATE"
  );
  if (!warehouse.rowCount) {
    const error = new Error("Magazyn główny nie istnieje lub jest nieaktywny.");
    error.status = 400;
    throw error;
  }
  const warehouseId = warehouse.rows[0].id;
  if (!shipment.nazwaSpolki) {
    const error = new Error("Podaj nazwę spółki, aby przyjąć przesyłkę na magazyn główny.");
    error.status = 400;
    throw error;
  }
  const company = await client.query(`
    INSERT INTO companies (name) VALUES ($1)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [shipment.nazwaSpolki]);
  const companyId = company.rows[0].id;
  await client.query(
    "UPDATE shipments SET warehouse_id = $1, received_without_warehouse = FALSE WHERE id = $2",
    [warehouseId, shipmentId]
  );

  const contentRows = await client.query(`
    SELECT id, name, quantity, unit, serial_number
      FROM shipment_items
     WHERE shipment_id = $1
     ORDER BY id
  `, [shipmentId]);
  for (const line of contentRows.rows) {
    const item = await client.query(`
      INSERT INTO items (company_id, name, unit)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, name, unit) DO UPDATE SET active = TRUE
      RETURNING id
    `, [companyId, line.name, line.unit]);
    const entry = await client.query(`
      INSERT INTO warehouse_stock_entries
        (company_id, warehouse_id, item_id, order_number, project_number,
         received_quantity, reference_no, supplier, serial_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      companyId, warehouseId, item.rows[0].id,
      shipment.zamowienie || "", shipment.projekt || "",
      line.quantity, shipment.numerId, shipment.nadawca || "",
      line.serial_number || ""
    ]);
    await client.query(`
      INSERT INTO stock_movements
        (company_id, warehouse_id, item_id, stock_entry_id, movement_type, quantity_delta,
         document_type, reference_no, created_by, notes)
      VALUES ($1, $2, $3, $4, 'IN', $5, 'receipt', $6, $7, $8)
    `, [
      companyId, warehouseId, item.rows[0].id, entry.rows[0].id,
      line.quantity, shipment.numerId, userId,
      `Przyjęcie z przesyłki: ${shipment.numerListu}${line.serial_number ? `, SN: ${line.serial_number}` : ""}`
    ]);
  }
  return warehouseId;
}

async function receiveExistingShipment(shipmentId, userId) {
  requiredId(shipmentId, "przesyłka");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockedShipment = await client.query(
      "SELECT id FROM shipments WHERE id = $1 FOR UPDATE",
      [shipmentId]
    );
    if (!lockedShipment.rowCount) {
      const error = new Error("Nie znaleziono przesyłki.");
      error.status = 404;
      throw error;
    }
    const source = await client.query(`
      SELECT s.id, s.warehouse_id AS "warehouseId",
             s.company_name AS "nazwaSpolki",
             s.register_number AS "numerId",
             s.tracking_number AS "numerListu",
             s.order_number AS "zamowienie",
             s.project_number AS "projekt",
             COALESCE(json_agg(json_build_object(
               'shipmentItemId', i.id, 'nazwa', i.name, 'ilosc', i.quantity,
               'jednostka', i.unit, 'serial', i.serial_number
             ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS zawartosc
        FROM shipments s
        LEFT JOIN shipment_items i ON i.shipment_id = s.id
       WHERE s.id = $1
       GROUP BY s.id
    `, [shipmentId]);
    const shipment = source.rows[0];
    if (shipment.warehouseId) {
      const error = new Error("Ta przesyłka została już przyjęta do magazynu.");
      error.status = 409;
      throw error;
    }
    if (!shipment.zawartosc.length) invalid("Przesyłka nie zawiera pozycji towarowych do przyjęcia.");
    shipment.warehouseId = "main";
    const receivedWarehouseId = await receiveShipment(client, shipmentId, shipment, userId);
    await client.query("COMMIT");
    return { shipmentId, warehouseId: receivedWarehouseId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getCompanies, getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  getItems, createItem, getStock,
  getMovements, createIssue, createTransfer, getIssue, getIssues, updateIssue, cancelIssue, createAdjustment,
  updateStockEntry, deleteStockEntry,
  receiveShipment, receiveExistingShipment
};
