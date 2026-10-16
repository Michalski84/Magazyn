DROP VIEW IF EXISTS warehouse_stock;

ALTER TABLE warehouse_stock_entries
  ADD COLUMN IF NOT EXISTS supplier TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS serial_number TEXT NOT NULL DEFAULT '';

UPDATE warehouse_stock_entries AS entry
   SET supplier = shipment.sender
  FROM shipments AS shipment
 WHERE entry.source_shipment_id = shipment.id
   AND entry.supplier = '';

UPDATE warehouse_stock_entries AS entry
   SET serial_number = item.serial_number
  FROM shipment_items AS item
 WHERE entry.source_shipment_item_id = item.id
   AND entry.serial_number = '';

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_document_type_check;

UPDATE stock_movements
   SET document_type = 'receipt',
       document_id = NULL
 WHERE document_type = 'shipment';

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_document_type_check
    CHECK (document_type IN ('receipt', 'shipment', 'wz', 'adjustment', 'transfer', 'opening'));

DROP INDEX IF EXISTS warehouse_stock_entries_receipt_item_idx;

ALTER TABLE warehouse_stock_entries
  DROP COLUMN IF EXISTS source_shipment_id,
  DROP COLUMN IF EXISTS source_shipment_item_id;

DROP INDEX IF EXISTS warehouses_single_main_idx;
CREATE UNIQUE INDEX warehouses_single_main_idx
  ON warehouses ((warehouse_type))
  WHERE warehouse_type = 'main';

ALTER TABLE warehouses
  DROP CONSTRAINT IF EXISTS warehouses_company_id_name_key;
DROP INDEX IF EXISTS warehouses_company_name_active_idx;
CREATE UNIQUE INDEX warehouses_company_name_active_idx
  ON warehouses (company_id, name)
  WHERE active;

CREATE VIEW warehouse_stock AS
SELECT e.company_id, e.warehouse_id, e.item_id, e.id AS stock_entry_id,
       e.order_number, e.source_entry_id, e.received_quantity,
       COALESCE(SUM(m.quantity_delta) FILTER (
         WHERE m.quantity_delta > 0 AND m.movement_type <> 'RETURN'
       ), 0) AS quantity_in,
       GREATEST(0,
         COALESCE(-SUM(m.quantity_delta) FILTER (
           WHERE m.quantity_delta < 0
         ), 0) -
         COALESCE(SUM(m.quantity_delta) FILTER (
           WHERE m.movement_type = 'RETURN'
         ), 0)
       ) AS quantity_out,
       COALESCE(SUM(m.quantity_delta), 0) AS quantity_on_hand
  FROM warehouse_stock_entries e
  LEFT JOIN stock_movements m ON m.stock_entry_id = e.id
 GROUP BY e.company_id, e.warehouse_id, e.item_id, e.id;
