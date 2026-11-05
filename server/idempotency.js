// Idempotentność zapisów: powtórzone żądanie z tym samym nagłówkiem Idempotency-Key
// (podwójne kliknięcie, ponowienie po utracie łączności) nie wykonuje operacji drugi raz,
// tylko zwraca odpowiedź z pierwszego wykonania. Rozstrzyga klucz główny w bazie.
const crypto = require("node:crypto");
const { pool } = require("./database");
const logger = require("./logger");

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const STALE_IN_PROGRESS_SECONDS = 120;
const RETENTION_HOURS = 24;

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function hashRequest(req) {
  return crypto.createHash("sha256")
    .update(`${req.method} ${req.originalUrl.split("?")[0]}\n${JSON.stringify(req.body ?? null)}`)
    .digest("hex");
}

// Zajmuje klucz; zwraca true, gdy to żądanie ma wykonać operację.
async function claimKey(userId, key, requestHash) {
  const inserted = await pool.query(`
    INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, key) DO NOTHING
    RETURNING 1
  `, [userId, key, requestHash]);
  return inserted.rowCount === 1;
}

// Przejmuje klucz porzuconego żądania (np. po przerwaniu pracy serwera).
async function takeOverStaleKey(userId, key) {
  const result = await pool.query(`
    UPDATE idempotency_keys SET created_at = now()
     WHERE user_id = $1 AND key = $2 AND response_status IS NULL
       AND created_at < now() - make_interval(secs => $3)
    RETURNING 1
  `, [userId, key, STALE_IN_PROGRESS_SECONDS]);
  return result.rowCount === 1;
}

// Zapamiętuje wynik udanej operacji lub zwalnia klucz po błędzie (użytkownik może ponowić).
async function settleKey(userId, key, status, body) {
  try {
    if (status >= 200 && status < 300) {
      await pool.query(`
        UPDATE idempotency_keys SET response_status = $3, response_body = $4
         WHERE user_id = $1 AND key = $2
      `, [userId, key, status, body === undefined ? null : JSON.stringify(body)]);
    } else {
      await pool.query("DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2", [userId, key]);
    }
  } catch (error) {
    logger.error("Nie udało się zapisać klucza idempotentności", { message: error.message });
  }
}

// Zapisuje wynik zanim odpowiedź trafi do klienta, więc kolejne ponowienie zawsze go zobaczy.
function captureResponse(res, userId, key) {
  let body;
  let settled = false;
  const originalJson = res.json.bind(res);
  const originalEnd = res.end.bind(res);
  res.json = payload => {
    body = payload;
    return originalJson(payload);
  };
  res.end = (...args) => {
    if (settled) return originalEnd(...args);
    settled = true;
    settleKey(userId, key, res.statusCode, body).finally(() => originalEnd(...args));
    return res;
  };
}

function cleanupOldKeys() {
  pool.query("DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => $1)", [RETENTION_HOURS])
    .catch(error => logger.warn("Czyszczenie kluczy idempotentności nie powiodło się", { message: error.message }));
}

// Middleware dla zapisów (POST/PUT/PATCH/DELETE) wysyłanych z nagłówkiem Idempotency-Key.
async function idempotency(req, res, next) {
  try {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const key = req.get("idempotency-key");
    if (key === undefined) return next();
    if (!KEY_PATTERN.test(key)) return sendError(res, 400, "Nieprawidłowy nagłówek Idempotency-Key.");

    const userId = req.session.user.id;
    const requestHash = hashRequest(req);
    if (Math.random() < 0.02) cleanupOldKeys();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await claimKey(userId, key, requestHash)) {
        captureResponse(res, userId, key);
        return next();
      }
      const existing = (await pool.query(`
        SELECT request_hash, response_status, response_body FROM idempotency_keys
         WHERE user_id = $1 AND key = $2
      `, [userId, key])).rows[0];
      if (!existing) continue;
      if (existing.request_hash !== requestHash) {
        return sendError(res, 422, "Ten klucz Idempotency-Key został użyty w innym żądaniu.");
      }
      if (existing.response_status !== null) {
        res.set("Idempotency-Replayed", "true");
        return existing.response_body === null
          ? res.status(existing.response_status).end()
          : res.status(existing.response_status).json(existing.response_body);
      }
      if (await takeOverStaleKey(userId, key)) {
        captureResponse(res, userId, key);
        return next();
      }
      return sendError(res, 409, "To samo żądanie jest właśnie przetwarzane. Poczekaj na wynik.");
    }
    return sendError(res, 409, "To samo żądanie jest właśnie przetwarzane. Poczekaj na wynik.");
  } catch (error) {
    next(error);
  }
}

module.exports = { idempotency };
