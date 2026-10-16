CREATE TABLE companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO companies (name)
SELECT DISTINCT BTRIM(company_name)
  FROM shipments
 WHERE BTRIM(company_name) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO companies (name) VALUES
  ('Maxto Technology'), ('Maxto ITS'), ('Maxto Consulting'), ('Nexcore'),
  ('ecvision'), ('Revotec'), ('Trocom'), ('SES Energy'), ('Quantica Lab'),
  ('Bear Lake')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE warehouses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  warehouse_type TEXT NOT NULL DEFAULT 'main'
    CHECK (warehouse_type IN ('main', 'service', 'transit', 'temporary', 'other')),
  address TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX warehouses_company_code_idx ON warehouses (company_id, LOWER(code))
  WHERE code <> '';

CREATE TABLE items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  minimum_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name, unit)
);

CREATE UNIQUE INDEX items_company_code_idx ON items (company_id, LOWER(code))
  WHERE code <> '';

CREATE TABLE warehouse_stock_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  item_id BIGINT NOT NULL REFERENCES items(id),
  source_shipment_id BIGINT REFERENCES shipments(id),
  source_shipment_item_id BIGINT REFERENCES shipment_items(id),
  source_entry_id BIGINT REFERENCES warehouse_stock_entries(id),
  order_number TEXT NOT NULL DEFAULT '',
  received_quantity NUMERIC(14, 3) NOT NULL CHECK (received_quantity > 0),
  reference_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (source_shipment_id IS NULL AND source_shipment_item_id IS NULL) OR
    (source_shipment_id IS NOT NULL AND source_shipment_item_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX warehouse_stock_entries_receipt_item_idx
  ON warehouse_stock_entries (source_shipment_item_id)
  WHERE source_shipment_item_id IS NOT NULL AND source_entry_id IS NULL;
CREATE INDEX warehouse_stock_entries_warehouse_idx
  ON warehouse_stock_entries (warehouse_id, item_id, created_at, id);

CREATE TABLE issue_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  document_no TEXT NOT NULL UNIQUE,
  issue_date DATE NOT NULL,
  issued_to TEXT NOT NULL,
  created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE issue_document_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_document_id BIGINT NOT NULL REFERENCES issue_documents(id),
  stock_entry_id BIGINT NOT NULL REFERENCES warehouse_stock_entries(id),
  item_id BIGINT NOT NULL REFERENCES items(id),
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  order_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE warehouse_transfers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  from_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  document_no TEXT NOT NULL UNIQUE,
  transfer_date DATE NOT NULL,
  created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE warehouse_transfer_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id BIGINT NOT NULL REFERENCES warehouse_transfers(id),
  source_entry_id BIGINT NOT NULL REFERENCES warehouse_stock_entries(id),
  destination_entry_id BIGINT NOT NULL REFERENCES warehouse_stock_entries(id),
  item_id BIGINT NOT NULL REFERENCES items(id),
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  order_number TEXT NOT NULL DEFAULT ''
);

CREATE TABLE stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  item_id BIGINT NOT NULL REFERENCES items(id),
  stock_entry_id BIGINT NOT NULL REFERENCES warehouse_stock_entries(id),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'RETURN')),
  quantity_delta NUMERIC(14, 3) NOT NULL CHECK (quantity_delta <> 0),
  document_type TEXT NOT NULL
    CHECK (document_type IN ('shipment', 'wz', 'adjustment', 'transfer', 'opening')),
  document_id BIGINT,
  reference_no TEXT NOT NULL DEFAULT '',
  created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stock_movements_stock_idx
  ON stock_movements (warehouse_id, item_id, created_at, id);
CREATE INDEX stock_movements_document_idx
  ON stock_movements (document_type, document_id);

ALTER TABLE shipments
  ADD COLUMN warehouse_id BIGINT REFERENCES warehouses(id);

CREATE TABLE warehouse_document_counters (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

CREATE TABLE warehouse_transfer_counters (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

CREATE VIEW warehouse_stock AS
SELECT e.company_id, e.warehouse_id, e.item_id, e.id AS stock_entry_id,
       e.order_number, e.source_shipment_id, e.source_shipment_item_id,
       e.source_entry_id, e.received_quantity,
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
