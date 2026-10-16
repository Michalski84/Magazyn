ALTER TABLE warehouses
  DROP CONSTRAINT warehouses_warehouse_type_check;

UPDATE warehouses
   SET warehouse_type = 'other'
 WHERE warehouse_type = 'transit';

ALTER TABLE warehouses
  ADD CONSTRAINT warehouses_warehouse_type_check
  CHECK (warehouse_type IN ('main', 'service', 'temporary', 'spady', 'other'));
