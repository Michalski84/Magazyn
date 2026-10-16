ALTER TABLE issue_document_lines
  ADD COLUMN IF NOT EXISTS serial_number TEXT NOT NULL DEFAULT '';

UPDATE issue_document_lines AS line
   SET serial_number = entry.serial_number
  FROM warehouse_stock_entries AS entry
 WHERE entry.id = line.stock_entry_id
   AND line.serial_number = '';
