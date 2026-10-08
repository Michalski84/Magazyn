const { pool } = require("./database");
const { normalizeShipment } = require("./validation");

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

const shipmentSelect = `
  SELECT s.id, s.carrier AS firma, s.tracking_number AS "numerListu",
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

async function insertShipment(client, input) {
  const shipment = normalizeShipment(input);
  const result = await client.query(`
    INSERT INTO shipments
      (carrier, tracking_number, received_on, recipient, sender, shipment_type, package_quantity,
       order_number, project_number, status, recipient_signature, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
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

  return getShipment(shipmentId, client);
}

async function createShipment(input) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const shipment = await insertShipment(client, input);
    await client.query("COMMIT");
    return shipment;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function replaceShipment(id, input) {
  const shipment = normalizeShipment(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE shipments
         SET carrier = $1, tracking_number = $2, received_on = $3,
             recipient = $4, sender = $5, shipment_type = $6,
             package_quantity = $7, order_number = $8, project_number = $9, status = $10,
             recipient_signature = $11, notes = $12,
             version = version + 1, updated_at = NOW()
       WHERE id = $13 AND version = $14
       RETURNING id
    `, [
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
  const result = await pool.query(
    "DELETE FROM shipments WHERE id = $1 AND version = $2",
    [id, Number(version)]
  );
  if (result.rowCount === 0) {
    const exists = await pool.query("SELECT 1 FROM shipments WHERE id = $1", [id]);
    const error = new Error(exists.rowCount ? "Przesyłka została zmieniona przez innego użytkownika. Odśwież listę przed usunięciem." : "Nie znaleziono przesyłki.");
    error.status = exists.rowCount ? 409 : 404;
    throw error;
  }
}

async function importShipments(inputs, { replace = true } = {}) {
  if (!Array.isArray(inputs) || inputs.length > 5000) {
    invalid("Import może zawierać maksymalnie 5000 przesyłek.");
  }
  const shipments = inputs.map(normalizeShipment);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE shipments IN SHARE ROW EXCLUSIVE MODE");
    if (replace) {
      await client.query("DELETE FROM shipments");
    } else {
      const existing = await client.query("SELECT 1 FROM shipments LIMIT 1");
      if (existing.rowCount > 0) {
        const error = new Error("Baza zawiera już przesyłki. Migracja przerwana, aby zapobiec nadpisaniu danych.");
        error.status = 409;
        throw error;
      }
    }
    for (const shipment of shipments) await insertShipment(client, shipment);
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
