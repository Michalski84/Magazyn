ALTER TABLE orders
  ADD COLUMN items JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE orders
   SET items = jsonb_build_array(
     jsonb_build_object('name', item_name, 'quantity', quantity::float8, 'unit', 'szt.')
   );
