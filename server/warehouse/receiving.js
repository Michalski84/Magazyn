// Przyjmowanie przesyłek na magazyn (PZ).
const { pool } = require("../database");
const { invalid, requiredId } = require("./validation");

// Przyjmuje towary z przesyłki na magazyn (PZ) w ramach istniejącej transakcji.
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

// Przyjmuje na magazyn przesyłkę już zapisaną w rejestrze.
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

module.exports = { receiveShipment, receiveExistingShipment };
