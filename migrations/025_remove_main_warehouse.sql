-- Rezygnacja z magazynu głównego: każda spółka ma magazyn o swojej nazwie.
INSERT INTO warehouses (company_id, name, warehouse_type)
SELECT c.id, c.name, 'other'
  FROM companies c
 WHERE EXISTS (
         SELECT 1 FROM warehouse_stock_entries e
           JOIN warehouses m ON m.id = e.warehouse_id AND m.warehouse_type = 'main'
          WHERE e.company_id = c.id)
    OR EXISTS (
         SELECT 1 FROM issue_documents d
           JOIN warehouses m ON m.id = d.warehouse_id AND m.warehouse_type = 'main'
          WHERE d.company_id = c.id)
    OR EXISTS (
         SELECT 1 FROM shipments s
           JOIN warehouses m ON m.id = s.warehouse_id AND m.warehouse_type = 'main'
          WHERE s.company_name = c.name)
ON CONFLICT (company_id, name) WHERE active DO NOTHING;

UPDATE warehouse_stock_entries e
   SET warehouse_id = w.id
  FROM warehouses m, companies c, warehouses w
 WHERE e.warehouse_id = m.id AND m.warehouse_type = 'main'
   AND c.id = e.company_id
   AND w.company_id = c.id AND w.name = c.name AND w.active;

UPDATE stock_movements x
   SET warehouse_id = w.id
  FROM warehouses m, companies c, warehouses w
 WHERE x.warehouse_id = m.id AND m.warehouse_type = 'main'
   AND c.id = x.company_id
   AND w.company_id = c.id AND w.name = c.name AND w.active;

UPDATE issue_documents d
   SET warehouse_id = w.id
  FROM warehouses m, companies c, warehouses w
 WHERE d.warehouse_id = m.id AND m.warehouse_type = 'main'
   AND c.id = d.company_id
   AND w.company_id = c.id AND w.name = c.name AND w.active;

UPDATE shipments s
   SET warehouse_id = w.id
  FROM warehouses m, companies c, warehouses w
 WHERE s.warehouse_id = m.id AND m.warehouse_type = 'main'
   AND c.name = s.company_name
   AND w.company_id = c.id AND w.name = c.name AND w.active;

DROP INDEX IF EXISTS warehouses_single_main_idx;

UPDATE warehouses
   SET active = FALSE, warehouse_type = 'other'
 WHERE warehouse_type = 'main';
