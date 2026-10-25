CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL,
  order_date DATE NOT NULL,
  supplier TEXT NOT NULL,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  delivery_address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'zlozone'
    CHECK (status IN ('zlozone', 'potwierdzone', 'zrealizowane', 'anulowane')),
  notes TEXT NOT NULL DEFAULT '',
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_user_idx ON orders (user_id, order_date DESC, id DESC);
