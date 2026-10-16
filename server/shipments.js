const { pool } = require("./database");
const { normalizeShipment } = require("./validation");
const { formatRegisterNumber, parseRegisterNumber } = require("./shipment-numbers");
const warehouse = require("./warehouse");

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

const shipmentSelect = `
  SELECT s.id, s.register_number AS "numerId", s.warehouse_id AS "warehouseId",
           s.received_without_warehouse AS "bezMagazynu",
           s.company_name AS "nazwaSpolki",
         s.carrier AS firma, s.tracking_number AS "numerListu",
         to_char(s.received_on, 'YYYY-MM-DD') AS data, s.recipient AS odbiorca,
         s.sender AS nadawca, s.shipment_type AS rodzaj,
         s.package_quantity AS "iloscPrzesylek",
         s.order_number AS zamowienie, s.project_number AS projekt,
         s.status, s.recipient_signature AS "odbiorcaPodpis", s.notes AS notatki,
         s.version,
         COALESCE(
           json_agg(
             json_build_object(
               'nazwa', i.name, 'ilosc', i.quantity,
               'jednostka', i.unit, 'serial', i.serial_number
             ) ORDER BY i.id
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::json
         ) AS zawartosc
    FROM shipments s
    LEFT JOIN shipment_items i ON i.shipment_id = s.id
`;

async function getShipments(client = pool) {
  const result = await client.query(`
    ${shipmentSelect}
    GROUP BY s.id
    ORDER BY s.id
  `);
  return result.rows;
}

async function getShipment(id, client = pool) {
  const result = await client.query(`
    ${shipmentSelect}
    WHERE s.id = $1
    GROUP BY s.id
  `, [id]);
  return result.rows[0] || null;
}

async function insertShipment(client, input, importedRegisterNumber = null, options = {}) {
  const shipment = normalizeShipment(input);
  const registerNumber = importedRegisterNumber || await nextRegisterNumber(client, shipment.data);
  shipment.numerId = registerNumber;
  const result = await client.query(`
    INSERT INTO shipments
      (register_number, warehouse_id, company_name, carrier, tracking_number, received_on, recipient, sender, shipment_type, package_quantity,
       order_number, project_number, status, recipient_signature, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `, [
    registerNumber,
    null,
    shipment.nazwaSpolki,
    shipment.firma, shipment.numerListu, shipment.data, shipment.odbiorca,
    shipment.nadawca, shipment.rodzaj, shipment.iloscPrzesylek,
    shipment.zamowienie, shipment.projekt,
    shipment.status, shipment.odbiorcaPodpis, shipment.notatki
  ]);
  const shipmentId = result.rows[0].id;

  if (shipment.zawartosc.length) {
    const values = [];
    const placeholders = shipment.zawartosc.map((item, index) => {
      const offset = index * 5;
      values.push(shipmentId, item.nazwa, item.ilosc, item.jednostka, item.serial);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });
    await client.query(`
      INSERT INTO shipment_items (shipment_id, name, quantity, unit, serial_number)
      VALUES ${placeholders.join(", ")}
    `, values);
  }

  if (options.receiveInventory) {
    await warehouse.receiveShipment(client, shipmentId, shipment, options.userId);
  }
  return getShipment(shipmentId, client);
}

async function nextRegisterNumber(client, receivedOn) {
  const year = Number(receivedOn.slice(0, 4));
  const result = await client.query(`
    INSERT INTO shipment_number_counters (year, last_number)
    VALUES ($1, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = shipment_number_counters.last_number + 1
    RETURNING last_number::TEXT AS sequence
  `, [year]);
  return formatRegisterNumber(result.rows[0].sequence, year);
}

async function preserveImportedRegisterNumber(client, value) {
  const parsed = parseRegisterNumber(value);
  await client.query(`
    INSERT INTO shipment_number_counters (year, last_number)
    VALUES ($1, $2)
    ON CONFLICT (year) DO UPDATE
      SET last_number = GREATEST(shipment_number_counters.last_number, EXCLUDED.last_number)
  `, [parsed.year, parsed.sequence]);
  return parsed.value;
}

async function createShipment(input, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const shipment = await insertShipment(client, input, null, { receiveInventory: true, userId });
    await client.query("COMMIT");
    return shipment;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function replaceShipment(id, input, userId) {
  const shipment = normalizeShipment(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockedShipment = await client.query("SELECT 1 FROM shipments WHERE id = $1 FOR UPDATE", [id]);
    if (!lockedShipment.rowCount) {
      const error = new Error("Nie znaleziono przesyłki.");
      error.status = 404;
      throw error;
    }
    const existingShipment = await getShipment(id, client);
    const result = await client.query(`
      UPDATE shipments
         SET company_name = $1, carrier = $2, tracking_number = $3, received_on = $4,
             recipient = $5, sender = $6, shipment_type = $7,
             package_quantity = $8, order_number = $9, project_number = $10, status = $11,
             recipient_signature = $12, notes = $13,
             version = version + 1, updated_at = NOW()
       WHERE id = $14 AND version = $15
       RETURNING id
    `, [
      shipment.nazwaSpolki,
      shipment.firma, shipment.numerListu, shipment.data, shipment.odbiorca,
      shipment.nadawca, shipment.rodzaj, shipment.iloscPrzesylek,
      shipment.zamowienie, shipment.projekt,
      shipment.status, shipment.odbiorcaPodpis, shipment.notatki,
      id, Number(input.version)
    ]);
    if (result.rowCount === 0) {
      const exists = await client.query("SELECT 1 FROM shipments WHERE id = $1", [id]);
      const error = new Error(exists.rowCount ? "Przesyłka została zmieniona przez innego użytkownika. Odśwież dane i spróbuj ponownie." : "Nie znaleziono przesyłki.");
      error.status = exists.rowCount ? 409 : 404;
      throw error;
    }
    await client.query("DELETE FROM shipment_items WHERE shipment_id = $1", [id]);
    if (shipment.zawartosc.length) {
      const values = [];
      const placeholders = shipment.zawartosc.map((item, index) => {
        const offset = index * 5;
        values.push(id, item.nazwa, item.ilosc, item.jednostka, item.serial);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      });
      await client.query(`
        INSERT INTO shipment_items (shipment_id, name, quantity, unit, serial_number)
        VALUES ${placeholders.join(", ")}
      `, values);
    }
    if (!existingShipment.warehouseId && shipment.warehouseId) {
      shipment.numerId = existingShipment.numerId;
      await warehouse.receiveShipment(client, id, shipment, userId);
    }
    const updated = await getShipment(id, client);
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function patchShipment(id, patch) {
  const fields = {
    status: ["status", value => {
      if (typeof value !== "string" || !["na magazynie", "odebrane", "częściowo odebrane"].includes(value)) {
        invalid("Nieprawidłowy status przesyłki.");
      }
      return value;
    }],
    notatki: ["notes", value => normalizeOptionalText(value, "notatki")],
    odbiorcaPodpis: ["recipient_signature", value => normalizeOptionalText(value, "odbiorcaPodpis")]
  };
  const entries = Object.entries(patch).filter(([key]) => key !== "version");
  if (!entries.length || entries.some(([key]) => !fields[key])) {
    invalid("Nieprawidłowe pola do aktualizacji.");
  }
  const assignments = entries.map(([key], index) => `${fields[key][0]} = $${index + 1}`);
  const values = entries.map(([key, value]) => fields[key][1](value));
  const idParameter = values.length + 1;
  const versionParameter = values.length + 2;
  const result = await pool.query(`
    UPDATE shipments
       SET ${assignments.join(", ")}, version = version + 1, updated_at = NOW()
     WHERE id = $${idParameter} AND version = $${versionParameter}
     RETURNING id
  `, [...values, id, Number(patch.version)]);
  if (result.rowCount === 0) {
    const exists = await pool.query("SELECT 1 FROM shipments WHERE id = $1", [id]);
    const error = new Error(exists.rowCount ? "Przesyłka została zmieniona przez innego użytkownika. Odśwież dane i spróbuj ponownie." : "Nie znaleziono przesyłki.");
    error.status = exists.rowCount ? 409 : 404;
    throw error;
  }
  return getShipment(id);
}

function normalizeOptionalText(value, field) {
  if (typeof value !== "string") invalid(`Nieprawidłowa wartość pola ${field}.`);
  if (value.length > (field === "notatki" ? 20_000 : 500)) {
    invalid(`Pole ${field} jest zbyt długie.`);
  }
  return value.trim();
}

async function deleteShipment(id, version) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const shipment = await client.query(
      "SELECT id FROM shipments WHERE id = $1 AND version = $2 FOR UPDATE",
      [id, Number(version)]
    );
    if (!shipment.rowCount) {
      const exists = await client.query("SELECT 1 FROM shipments WHERE id = $1", [id]);
      const error = new Error(exists.rowCount ? "Przesyłka została zmieniona przez innego użytkownika. Odśwież listę przed usunięciem." : "Nie znaleziono przesyłki.");
      error.status = exists.rowCount ? 409 : 404;
      throw error;
    }
    await client.query("DELETE FROM shipments WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function importShipments(inputs, { replace = true } = {}) {
  if (!Array.isArray(inputs) || inputs.length > 5000) {
    invalid("Import może zawierać maksymalnie 5000 przesyłek.");
  }
  const registerNumbers = new Set();
  const shipments = inputs.map(input => {
    const shipment = normalizeShipment(input);
    const rawRegisterNumber = input.numerId;
    if (rawRegisterNumber == null ||
        (typeof rawRegisterNumber === "string" && rawRegisterNumber.trim() === "")) {
      return shipment;
    }
    let parsed;
    try {
      parsed = parseRegisterNumber(rawRegisterNumber);
    } catch (error) {
      invalid(error.message);
    }
    if (registerNumbers.has(parsed.value)) {
      invalid(`Numer ID ${parsed.value} występuje więcej niż raz w imporcie.`);
    }
    registerNumbers.add(parsed.value);
    return { ...shipment, numerId: parsed.value };
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE shipments IN SHARE ROW EXCLUSIVE MODE");
    if (replace) {
      const inventory = await client.query("SELECT 1 FROM stock_movements LIMIT 1");
      if (inventory.rowCount) {
        const error = new Error("Nie można zastąpić rejestru przesyłek po rozpoczęciu pracy z magazynem, ponieważ zachowa to historię ruchów.");
        error.status = 409;
        throw error;
      }
      await client.query("DELETE FROM shipments");
    } else {
      const existing = await client.query("SELECT 1 FROM shipments LIMIT 1");
      if (existing.rowCount > 0) {
        const error = new Error("Baza zawiera już przesyłki. Migracja przerwana, aby zapobiec nadpisaniu danych.");
        error.status = 409;
        throw error;
      }
    }
    for (const shipment of shipments) {
      if (shipment.numerId) {
        shipment.numerId = await preserveImportedRegisterNumber(client, shipment.numerId);
      }
    }
    for (const shipment of shipments) {
      await insertShipment(client, shipment, shipment.numerId);
    }
    await client.query("COMMIT");
    return getShipments();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getShipments, createShipment, replaceShipment, patchShipment,
  deleteShipment, importShipments
};
