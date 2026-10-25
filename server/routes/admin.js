// Trasy administracyjne (/api/admin): dziennik zmian, dostępny tylko dla administratora.
const express = require("express");
const { asyncRoute, requireRole, requireValidId } = require("../http/middleware");
const { listAudit, recordAudit } = require("../audit");
const { pool } = require("../database");

const router = express.Router();

router.get("/audit", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json(await listAudit({
    username: typeof req.query.username === "string" ? req.query.username : "",
    search: typeof req.query.search === "string" ? req.query.search : "",
    limit: req.query.limit
  }));
}));

router.get("/users", requireRole("admin"), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT id, username, role, active, created_at AS "createdAt"
      FROM app_users
     ORDER BY active, username
  `);
  res.json(result.rows);
}));

router.patch("/users/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator konta.");
  if (String(req.params.id) === String(req.session.user.id)) {
    return res.status(400).json({ error: "Nie można zmieniać własnego konta." });
  }
  const { role, active } = req.body || {};
  if (!["admin", "warehouse", "viewer"].includes(role) || typeof active !== "boolean") {
    return res.status(400).json({ error: "Wybierz poprawną rolę i status konta." });
  }

  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(730422)");
    const target = await client.query(
      "SELECT id, username, role, active FROM app_users WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (!target.rowCount) {
      const error = new Error("Nie znaleziono konta.");
      error.status = 404;
      throw error;
    }
    const current = target.rows[0];
    if (current.role === "admin" && current.active && (role !== "admin" || !active)) {
      const admins = await client.query(
        "SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active AND id <> $1",
        [current.id]
      );
      if (Number(admins.rows[0].count) === 0) {
        const error = new Error("Nie można dezaktywować ani odebrać roli ostatniemu aktywnemu administratorowi.");
        error.status = 400;
        throw error;
      }
    }
    const updated = await client.query(`
      UPDATE app_users
         SET role = $2, active = $3
       WHERE id = $1
       RETURNING id, username, role, active, created_at AS "createdAt"
    `, [current.id, role, active]);
    user = updated.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await recordAudit({
    userId: req.session.user.id,
    username: req.session.user.username,
    action: "Zmiana uprawnień konta",
    method: "PATCH",
    path: `/admin/users/${user.id}`,
    entity: "Konto",
    entityId: user.id,
    statusCode: 200,
    details: { username: user.username, role: user.role, active: user.active }
  });
  res.json(user);
}));

router.delete("/users/:id", requireRole("admin"), asyncRoute(async (req, res) => {
  requireValidId(req.params.id, "Nieprawidłowy identyfikator konta.");
  if (String(req.params.id) === String(req.session.user.id)) {
    return res.status(400).json({ error: "Nie można usunąć własnego konta." });
  }

  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(730422)");
    const target = await client.query(
      "SELECT id, username, role, active FROM app_users WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (!target.rowCount) {
      const error = new Error("Nie znaleziono konta.");
      error.status = 404;
      throw error;
    }
    user = target.rows[0];
    if (user.role === "admin" && user.active) {
      const admins = await client.query(
        "SELECT COUNT(*) FROM app_users WHERE role = 'admin' AND active AND id <> $1",
        [user.id]
      );
      if (Number(admins.rows[0].count) === 0) {
        const error = new Error("Nie można usunąć ostatniego aktywnego administratora.");
        error.status = 400;
        throw error;
      }
    }
    await client.query("DELETE FROM app_users WHERE id = $1", [user.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await recordAudit({
    userId: req.session.user.id,
    username: req.session.user.username,
    action: "Usunięcie konta",
    method: "DELETE",
    path: `/admin/users/${user.id}`,
    entity: "Konto",
    entityId: user.id,
    statusCode: 204,
    details: { username: user.username }
  });
  res.status(204).end();
}));

module.exports = router;
