ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS recipient_signed_on DATE;
