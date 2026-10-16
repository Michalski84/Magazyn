ALTER TABLE warehouse_stock_entries
  ADD COLUMN project_number TEXT NOT NULL DEFAULT '';

UPDATE warehouse_stock_entries AS entry
   SET project_number = shipment.project_number
  FROM shipments AS shipment
 WHERE entry.source_shipment_id = shipment.id
   AND entry.project_number = '';

WITH RECURSIVE batch_projects AS (
  SELECT id, project_number
    FROM warehouse_stock_entries
   WHERE source_shipment_id IS NOT NULL
  UNION ALL
  SELECT child.id, parent.project_number
    FROM warehouse_stock_entries AS child
    JOIN batch_projects AS parent ON child.source_entry_id = parent.id
)
UPDATE warehouse_stock_entries AS entry
   SET project_number = batch_projects.project_number
  FROM batch_projects
 WHERE entry.id = batch_projects.id
   AND entry.project_number = '';
