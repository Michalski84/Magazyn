// Dokumenty wydania (WZ): tworzenie, odczyt, edycja i anulowanie.
const { pool } = require("../database");
const { invalid, requireObject, requiredText, requiredId, optionalText, positiveQuantity, validDate } = require("./validation");
const { lockWarehouses, stockEntryBalance, createDocumentNumber, ensureCompanyWarehouse } = require("./ledger");

const DELIVERY_METHODS = new Set(["courier", "personal_pickup", "own_transport", "dedicated_transport"]);

// Waliduje nagłówek WZ: datę, odbiorcę, projekt i sposób dostawy (list przewozowy / osoba odbierająca).
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
  const recipientText = optionalText(input.recipientText, "odbiorca", 2000).replace(/\r\n?/g, "\n").trim();
  const hasRecipientId = input.recipientId != null && String(input.recipientId).trim() !== "";
  if (!recipientText && !hasRecipientId) invalid("Podaj odbiorcę: wpisz adres lub wybierz zapisanego odbiorcę.");
  return {
    issueDate: validDate(input.issueDate, "data wydania"),
    recipientId: hasRecipientId ? requiredId(input.recipientId, "odbiorca") : null,
    recipientText,
    projectNumber: optionalText(input.projectNumber, "numer projektu", 500),
    deliveryMethod,
    deliveryTrackingNumber,
    receivingPerson
  };
}

// Składa jednoliniowy adres odbiorcy do wydruku dokumentu.
function issueAddressLine(party) {
  return [
    [party.street, party.buildingNumber].filter(Boolean).join(" "),
    [party.postalCode, party.city].filter(Boolean).join(" ")
  ].filter(Boolean).join("\n");
}

// Wczytuje odbiorcę dokumentu WZ z bazy (lub zgłasza błąd).
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

// Ustala dane odbiorcy: wpisany tekst (pierwsza linia = nazwa, reszta = adres) lub zapisany odbiorca.
async function resolveIssueRecipient(client, header) {
  if (header.recipientText) {
    const [name, ...rest] = header.recipientText.split("\n");
    return {
      name: name.trim().slice(0, 500),
      addressText: rest.join("\n").trim(),
      address2: "",
      contactPerson: "",
      phone: ""
    };
  }
  const recipient = await loadIssueRecipient(client, header.recipientId);
  return { ...recipient, addressText: issueAddressLine(recipient) };
}

// Tworzy dokument WZ, zdejmuje stany i zapisuje ruchy w jednej transakcji.
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
      : optionalText(line.serialNumber, `SN w pozycji ${index + 1}`, 100_000)
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
    const recipient = await resolveIssueRecipient(client, header);
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
      recipient.addressText, recipient.address2, recipient.contactPerson, recipient.phone,
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

// Zwraca jeden dokument WZ wraz z pozycjami.
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

// Zwraca listę dokumentów WZ.
async function getIssues() {
  const result = await pool.query(`
    SELECT d.id, d.document_no AS "documentNo", to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate",
           d.issued_to AS "issuedTo", d.status, d.created_at AS "createdAt",
           d.project_number AS "projectNumber", d.recipient_id AS "recipientId",
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

// Edytuje nagłówek dokumentu WZ (odbiorca, data, projekt, dostawa); pozycje i stany bez zmian.
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
    const recipient = await resolveIssueRecipient(client, header);
    await client.query(`
      UPDATE issue_documents
         SET issue_date = $2, recipient_id = $3, issued_to = $4, recipient_address = $5,
             recipient_address2 = $6, recipient_contact = $7, recipient_phone = $8,
             project_number = $9, delivery_method = $10, delivery_tracking_number = $11,
             receiving_person = $12
       WHERE id = $1
    `, [
      id, header.issueDate, header.recipientId, recipient.name, recipient.addressText,
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

// Anuluje dokument WZ i przywraca stany magazynowe.
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
      returnWarehouseId = await ensureCompanyWarehouse(client, issue.company_id);
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

module.exports = { createIssue, getIssue, getIssues, updateIssue, cancelIssue };
