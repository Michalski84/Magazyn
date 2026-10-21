// Słownik spółek: lista, dodawanie i edycja.

const { pool } = require("../database");
const { requireObject, text, recordId, notFound, conflictOnDuplicate } = require("./validation");

const DUPLICATE_MESSAGE = "Spółka o tej nazwie już istnieje.";

// Waliduje dane spółki i zwraca wartości w kolejności parametrów SQL.
function companyInput(input) {
  requireObject(input, "Dane spółki");
  return [
    text(input.name, "nazwa spółki", { required: true }),
    text(input.street, "ulica", { required: true }),
    text(input.buildingNumber, "numer", { required: true, max: 100 }),
    text(input.postalCode, "kod pocztowy", { required: true, max: 30 }),
    text(input.city, "miasto", { required: true }),
    text(input.nip, "NIP", { required: true, max: 30 })
  ];
}

// Zwraca wszystkie spółki posortowane po nazwie.
async function listCompanies() {
  const result = await pool.query(`
    SELECT id, name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, nip, active
      FROM companies
     ORDER BY name
  `);
  return result.rows;
}

// Dodaje spółkę; duplikat nazwy kończy się błędem 409.
async function createCompany(input) {
  const values = companyInput(input);
  try {
    const result = await pool.query(`
      INSERT INTO companies (name, street, building_number, postal_code, city, nip)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, street, building_number AS "buildingNumber",
                postal_code AS "postalCode", city, nip, active
    `, values);
    return result.rows[0];
  } catch (error) {
    throw conflictOnDuplicate(error, DUPLICATE_MESSAGE);
  }
}

// Aktualizuje spółkę; brak rekordu to 404, duplikat nazwy to 409.
async function updateCompany(id, input) {
  const values = companyInput(input);
  try {
    const result = await pool.query(`
      UPDATE companies
         SET name = $2, street = $3, building_number = $4,
             postal_code = $5, city = $6, nip = $7
       WHERE id = $1
      RETURNING id, name, street, building_number AS "buildingNumber",
                postal_code AS "postalCode", city, nip, active
    `, [recordId(id), ...values]);
    if (!result.rowCount) throw notFound("Nie znaleziono spółki.");
    return result.rows[0];
  } catch (error) {
    throw conflictOnDuplicate(error, DUPLICATE_MESSAGE);
  }
}

module.exports = { listCompanies, createCompany, updateCompany };
