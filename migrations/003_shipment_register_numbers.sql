CREATE TABLE shipment_number_counters (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

ALTER TABLE shipments
  ADD COLUMN register_number TEXT;

WITH numbered_shipments AS (
  SELECT id,
         EXTRACT(YEAR FROM received_on)::INTEGER AS year,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM received_on)
           ORDER BY id
         ) AS sequence
    FROM shipments
)
UPDATE shipments AS s
   SET register_number = LPAD(
     n.sequence::TEXT,
     GREATEST(3, LENGTH(n.sequence::TEXT)),
     '0'
   ) || '/' || n.year::TEXT
  FROM numbered_shipments AS n
 WHERE n.id = s.id;

INSERT INTO shipment_number_counters (year, last_number)
SELECT EXTRACT(YEAR FROM received_on)::INTEGER, COUNT(*)
  FROM shipments
 GROUP BY EXTRACT(YEAR FROM received_on);

ALTER TABLE shipments
  ALTER COLUMN register_number SET NOT NULL;

CREATE UNIQUE INDEX shipments_register_number_idx ON shipments (register_number);
