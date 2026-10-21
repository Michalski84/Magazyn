// Dziennik zmian (audit log): zapis zdarzeń i odczyt dla administratora.
const { pool } = require("./database");
const logger = require("./logger");

// Nazwy modułów rozpoznawane z adresu API (do kolumny „obiekt” w dzienniku).
const ENTITY_LABELS = {
  shipments: "Przesyłka",
  catalogs: "Kartoteka",
  warehouse: "Magazyn"
};

// Zapisuje zdarzenie; błąd zapisu nie przerywa obsługi żądania.
async function recordAudit(entry) {
  try {
    await pool.query(`
      INSERT INTO audit_log (user_id, username, action, method, path, entity, entity_id, status_code, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      entry.userId ?? null,
      entry.username || "",
      entry.action,
      entry.method || "",
      entry.path || "",
      entry.entity || "",
      entry.entityId === undefined || entry.entityId === null ? "" : String(entry.entityId),
      entry.statusCode ?? null,
      JSON.stringify(entry.details || {})
    ]);
  } catch (error) {
    logger.error("Nie udało się zapisać dziennika zmian", { message: error.message });
  }
}

// Middleware: po udanym zapisie (POST/PUT/PATCH/DELETE) dopisuje wpis do dziennika.
function auditWrites(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  let body;
  const originalJson = res.json.bind(res);
  res.json = payload => {
    body = payload;
    return originalJson(payload);
  };
  res.once("finish", () => {
    if (res.statusCode >= 400 || !req.session?.user) return;
    const segments = req.originalUrl.split("?")[0].split("/").filter(Boolean).slice(1);
    const module = segments[0] || "";
    recordAudit({
      userId: req.session.user.id,
      username: req.session.user.username,
      action: `${req.method} ${segments.join("/")}`,
      method: req.method,
      path: `/${segments.join("/")}`,
      entity: ENTITY_LABELS[module] || module,
      entityId: body?.documentNo || body?.id || segments.find((part, index) => index > 0 && /^\d+$/.test(part)),
      statusCode: res.statusCode
    });
  });
  next();
}

// Zwraca najnowsze wpisy dziennika (filtr po użytkowniku i tekście, limit do 500).
async function listAudit({ username = "", search = "", limit = 200 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), 500);
  const result = await pool.query(`
    SELECT id, occurred_at AS "occurredAt", username, action, entity,
           entity_id AS "entityId", status_code AS "statusCode"
      FROM audit_log
     WHERE ($1 = '' OR username = $1)
       AND ($2 = '' OR action ILIKE '%' || $2 || '%' OR entity_id ILIKE '%' || $2 || '%')
     ORDER BY occurred_at DESC, id DESC
     LIMIT $3
  `, [String(username), String(search), safeLimit]);
  return result.rows;
}

module.exports = { recordAudit, auditWrites, listAudit };
