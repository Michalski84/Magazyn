// Słownik projektów: lista, dodawanie i edycja.

const { pool } = require("../database");
const { requireObject, text, recordId, validDate, notFound, conflictOnDuplicate } = require("./validation");

const DUPLICATE_MESSAGE = "Projekt o tym numerze już istnieje.";

// Waliduje dane projektu i zwraca wartości w kolejności parametrów SQL.
function projectInput(input) {
  requireObject(input, "Dane projektu");
  return [
    text(input.projectNumber, "numer projektu", { required: true }),
    text(input.shortName, "nazwa skrócona", { required: true }),
    text(input.fullName, "nazwa pełna", { required: true }),
    validDate(input.endDate)
  ];
}

// Zwraca wszystkie projekty posortowane po numerze.
async function listProjects() {
  const result = await pool.query(`
    SELECT id, project_number AS "projectNumber", short_name AS "shortName",
           full_name AS "fullName", end_date AS "endDate"
      FROM projects
     ORDER BY project_number
  `);
  return result.rows;
}

// Dodaje projekt; duplikat numeru kończy się błędem 409.
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
    throw conflictOnDuplicate(error, DUPLICATE_MESSAGE);
  }
}

// Aktualizuje projekt; brak rekordu to 404, duplikat numeru to 409.
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
    if (!result.rowCount) throw notFound("Nie znaleziono projektu.");
    return result.rows[0];
  } catch (error) {
    throw conflictOnDuplicate(error, DUPLICATE_MESSAGE);
  }
}

module.exports = { listProjects, createProject, updateProject };
