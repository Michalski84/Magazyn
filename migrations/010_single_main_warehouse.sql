DROP TABLE IF EXISTS warehouse_transfer_lines;
DROP TABLE IF EXISTS warehouse_transfers;
DROP TABLE IF EXISTS warehouse_transfer_counters;

ALTER TABLE warehouses ALTER COLUMN company_id DROP NOT NULL;

INSERT INTO warehouses (company_id, name, warehouse_type)
VALUES (NULL, 'Magazyn główny', 'main');

UPDATE warehouse_stock_entries
   SET warehouse_id = (SELECT id FROM warehouses WHERE company_id IS NULL);
UPDATE stock_movements
   SET warehouse_id = (SELECT id FROM warehouses WHERE company_id IS NULL);
UPDATE issue_documents
   SET warehouse_id = (SELECT id FROM warehouses WHERE company_id IS NULL);
UPDATE shipments
   SET warehouse_id = (SELECT id FROM warehouses WHERE company_id IS NULL)
 WHERE warehouse_id IS NOT NULL;

DELETE FROM warehouses WHERE company_id IS NOT NULL;

-- Dozwolony jest dokładnie jeden magazyn: główny.
CREATE UNIQUE INDEX warehouses_single_main_idx ON warehouses ((TRUE));
