const { pool } = require("./database");

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requireObject(input, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid(`${label} musi być obiektem.`);
  }
}

function text(value, field, { required = false, max = 500 } = {}) {
  if (typeof value !== "string") invalid(`Nieprawidłowa wartość pola ${field}.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) {
    invalid(`Nieprawidłowa wartość pola ${field}.`);
  }
  return normalized;
}

function recordId(value) {
  const id = String(value || "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n) {
    invalid("Nieprawidłowy identyfikator rekordu.");
  }
  return id;
}

function validDate(value) {
  if (value === "" || value == null) return null;
  const date = text(value, "data zakończenia", { max: 10 });
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    invalid("Data zakończenia musi być poprawną datą w formacie RRRR-MM-DD.");
  }
  return date;
}

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

function projectInput(input) {
  requireObject(input, "Dane projektu");
  return [
    text(input.projectNumber, "numer projektu", { required: true }),
    text(input.shortName, "nazwa skrócona", { required: true }),
    text(input.fullName, "nazwa pełna", { required: true }),
    validDate(input.endDate)
  ];
}

async function listCompanies() {
  const result = await pool.query(`
    SELECT id, name, street, building_number AS "buildingNumber",
           postal_code AS "postalCode", city, nip, active
      FROM companies
     ORDER BY name
  `);
  return result.rows;
}

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
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Spółka o tej nazwie już istnieje.";
    }
    throw error;
  }
}

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
    if (!result.rowCount) {
      const error = new Error("Nie znaleziono spółki.");
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Spółka o tej nazwie już istnieje.";
    }
    throw error;
  }
}

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
  if (!result.rowCount) {
    const error = new Error("Nie znaleziono odbiorcy.");
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function listProjects() {
  const result = await pool.query(`
    SELECT id, project_number AS "projectNumber", short_name AS "shortName",
           full_name AS "fullName", end_date AS "endDate"
      FROM projects
     ORDER BY project_number
  `);
  return result.rows;
}

async function createProject(input) {
  const values = projectInput(input);
  try {
    const result = await pool.query(`
      INSERT INTO projects (project_number, short_name, full_name, end_date)
      VALUES ($1, $2, $3, $4)
      RETURNING id, project_number AS "projectNumber", short_name AS "shortName",
                full_name AS "fullName", end_date AS "endDate"
    `, values);
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Projekt o tym numerze już istnieje.";
    }
    throw error;
  }
}

async function updateProject(id, input) {
  const values = projectInput(input);
  try {
    const result = await pool.query(`
      UPDATE projects
         SET project_number = $2, short_name = $3, full_name = $4, end_date = $5
       WHERE id = $1
      RETURNING id, project_number AS "projectNumber", short_name AS "shortName",
                full_name AS "fullName", end_date AS "endDate"
    `, [recordId(id), ...values]);
    if (!result.rowCount) {
      const error = new Error("Nie znaleziono projektu.");
      error.status = 404;
      throw error;
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Projekt o tym numerze już istnieje.";
    }
    throw error;
  }
}

async function deleteRecord(table, id, notFoundMessage, inUseMessage) {
  try {
    const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [recordId(id)]);
    if (!result.rowCount) {
      const error = new Error(notFoundMessage);
      error.status = 404;
      throw error;
    }
  } catch (error) {
    if (error.code === "23503") {
      error.status = 409;
      error.message = inUseMessage;
    }
    throw error;
  }
}

const deleteCompany = id => deleteRecord(
  "companies", id, "Nie znaleziono spółki.",
  "Nie można usunąć spółki, ponieważ ma przypisane magazyny, towary lub dokumenty."
);
const deleteRecipient = id => deleteRecord("recipients", id, "Nie znaleziono odbiorcy.", "Nie można usunąć odbiorcy.");
const deleteProject = id => deleteRecord("projects", id, "Nie znaleziono projektu.", "Nie można usunąć projektu.");

module.exports = {
  listCompanies, createCompany, updateCompany, deleteCompany,
  listRecipients, createRecipient, updateRecipient, deleteRecipient,
  listProjects, createProject, updateProject, deleteProject
};
