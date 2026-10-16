INSERT INTO warehouses (company_id, name, warehouse_type)
SELECT c.id, defaults.name, defaults.warehouse_type
  FROM companies c
  JOIN (
    VALUES
      ('Maxto Technology'), ('Maxto ITS'), ('Maxto Consulting'), ('Nexcore'),
      ('ecvision'), ('Revotec'), ('Trocom'), ('SES Energy'), ('Quantica Lab'),
      ('Bear Lake')
  ) AS standard_companies(name) ON standard_companies.name = c.name
 CROSS JOIN (
    VALUES
      ('Magazyn główny', 'main'),
      ('Magazyn serwisowy', 'service')
  ) AS defaults(name, warehouse_type)
 WHERE c.active
   AND NOT EXISTS (
     SELECT 1
       FROM warehouses existing
      WHERE existing.company_id = c.id
        AND existing.warehouse_type = defaults.warehouse_type
   )
ON CONFLICT (company_id, name) DO NOTHING;
