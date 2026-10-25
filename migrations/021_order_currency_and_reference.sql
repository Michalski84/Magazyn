ALTER TABLE orders
  ADD COLUMN eod_salesforce_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN order_value NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (order_value >= 0),
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'PLN' CHECK (currency IN ('PLN', 'EUR', 'USD')),
  ADD COLUMN exchange_rate NUMERIC(14, 6),
  ADD CONSTRAINT orders_exchange_rate_check CHECK (
    (currency = 'PLN' AND exchange_rate IS NULL) OR
    (currency <> 'PLN' AND exchange_rate IS NOT NULL AND exchange_rate > 0)
  );

INSERT INTO companies (name) VALUES
  ('Maxto Technology Energy'),
  ('SES')
ON CONFLICT (name) DO NOTHING;
