// Słownik odbiorców: lista, dodawanie i edycja.

const { pool } = require("../database");
const { requireObject, text, recordId, notFound } = require("./validation");

// Waliduje dane odbiorcy (pola adresowe opcjonalne) i zwraca wartości w kolejności parametrów SQL.
function recipientInput(input) {
  requireObject(input, "Dane odbiorcy");
  return [
    text(input.name, "nazwa odbiorcy", { required: true }),
    text(input.street == null ? "" : input.street, "ulica"),
    text(input.buildingNumber == null ? "" : input.buildingNumber, "numer", { max: 100 }),
    text(input.postalCode == null ? "" : input.postalCode, "kod pocztowy", { max: 30 }),
    text(input.city == null ? "" : input.city, "miasto"),
    text(input.address2 == null ? "" : input.address2, "adres 2", { max: 500 }),
    text(input.contactPerson == null ? "" : input.contactPerson, "osoba kontaktowa", { max: 200 }),
    text(input.phone == null ? "" : input.phone, "numer telefonu", { max: 100 })
  ];
}

// Zwraca wszystkich odbiorców posortowanych po nazwie.
async function listRecipients() {
  const result = await pool.query(`
    SELECT id, name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, address2,
           contact_person AS "contactPerson", phone
      FROM recipients
     ORDER BY name, id
  `);
  return result.rows;
}

// Dodaje odbiorcę.
async function createRecipient(input) {
  const values = recipientInput(input);
  const result = await pool.query(`
    INSERT INTO recipients
      (name, street, building_number, postal_code, city, address2, contact_person, phone)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, name, street, building_number AS "buildingNumber",
              postal_code AS "postalCode", city, address2,
              contact_person AS "contactPerson", phone
  `, values);
  return result.rows[0];
}

// Aktualizuje odbiorcę; brak rekordu to 404.
async function updateRecipient(id, input) {
  const values = recipientInput(input);
  const result = await pool.query(`
    UPDATE recipients
       SET name = $2, street = $3, building_number = $4,
           postal_code = $5, city = $6, address2 = $7,
           contact_person = $8, phone = $9
     WHERE id = $1
    RETURNING id, name, street, building_number AS "buildingNumber",
              postal_code AS "postalCode", city, address2,
              contact_person AS "contactPerson", phone
  `, [recordId(id), ...values]);
  if (!result.rowCount) throw notFound("Nie znaleziono odbiorcy.");
  return result.rows[0];
}

module.exports = { listRecipients, createRecipient, updateRecipient };
