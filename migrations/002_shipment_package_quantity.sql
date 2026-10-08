ALTER TABLE shipments
  ADD COLUMN package_quantity INTEGER NOT NULL DEFAULT 1
  CHECK (package_quantity > 0);
