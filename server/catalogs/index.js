// Słowniki (spółki, odbiorcy, projekty) – publiczne API modułu oraz wspólne usuwanie rekordów.

const { pool } = require("../database");
const { recordId, notFound } = require("./validation");
const { listCompanies, createCompany, updateCompany } = require("./companies");
const { listRecipients, createRecipient, updateRecipient } = require("./recipients");
const { listProjects, createProject, updateProject } = require("./projects");

// Usuwa rekord z podanej tabeli (nazwa pochodzi wyłącznie z kodu); 404 gdy brak, 409 gdy rekord jest używany.
async function deleteRecord(table, id, notFoundMessage, inUseMessage) {
  try {
    const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [recordId(id)]);
    if (!result.rowCount) throw notFound(notFoundMessage);
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
