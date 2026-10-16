ALTER TABLE warehouse_stock_entries
  ADD COLUMN IF NOT EXISTS serial_number TEXT NOT NULL DEFAULT '';
