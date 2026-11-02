ALTER TABLE shipment_items
  ALTER COLUMN quantity TYPE NUMERIC(14, 3)
  USING quantity::NUMERIC(14, 3);
