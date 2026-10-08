CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  received_on DATE NOT NULL,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  shipment_type TEXT NOT NULL,
  order_number TEXT NOT NULL DEFAULT '',
  project_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'na magazynie'
    CHECK (status IN ('na magazynie', 'odebrane', 'częściowo odebrane')),
  recipient_signature TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipments_received_on_idx ON shipments (received_on);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments (status);
CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx ON shipments (tracking_number);

CREATE TABLE IF NOT EXISTS shipment_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  serial_number TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS shipment_items_shipment_id_idx ON shipment_items (shipment_id);
