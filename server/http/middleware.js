// Wspólne middleware HTTP: autoryzacja, ochrona przed CSRF, walidacja identyfikatorów,
// logowanie żądań API oraz globalna obsługa błędów.
const logger = require("../logger");
const { pool } = require("../database");

// Odrzuca żądania od niezalogowanych użytkowników.
function requireAuthentication(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Wymagane logowanie." });
  next();
}

// Dopuszcza wyłącznie żądania z tego samego źródła (ochrona przed CSRF).
function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin !== expectedOrigin) {
    return res.status(403).json({ error: "Żądanie pochodzi z niedozwolonego źródła." });
  }
  next();
}

// Przekazuje błędy z asynchronicznych handlerów do globalnej obsługi błędów.
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Sprawdza, czy wartość jest dodatnim identyfikatorem mieszczącym się w BIGINT.
function validId(value) {
  return value.length <= 19 && /^\d+$/.test(value) &&
    BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n;
}

// Wymaga numeru wersji przesyłki (optymistyczna blokada edycji).
function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    const error = new Error("Brak poprawnej wersji przesyłki. Odśwież listę i spróbuj ponownie.");
    error.status = 400;
    throw error;
  }
}

// Rzuca błąd 400, jeśli identyfikator jest nieprawidłowy.
function requireValidId(value, message = "Nieprawidłowy identyfikator.") {
  if (!validId(value)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

// Sesje utworzone przed wprowadzeniem ról nie mają roli – dociąga ją z bazy.
async function ensureRole(req, _res, next) {
  try {
    const user = req.session.user;
    if (user && !user.role) {
      const result = await pool.query("SELECT role FROM app_users WHERE id = $1", [user.id]);
      user.role = result.rows[0]?.role || "viewer";
    }
    next();
  } catch (error) {
    next(error);
  }
}

// Wymaga jednej z podanych ról użytkownika.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.user?.role)) {
      return res.status(403).json({ error: "Brak uprawnień do tej operacji." });
    }
    next();
  };
}

// Polityka ról: viewer tylko czyta; zapisy w kartotekach (/catalogs) tylko admin.
function enforceRolePolicy(req, res, next) {
  const role = req.session.user?.role;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || role === "admin") return next();
  if (role === "warehouse" && !req.baseUrl.endsWith("/catalogs")) return next();
  res.status(403).json({ error: "Twoja rola nie pozwala na wykonanie tej operacji." });
}

// Loguje udane żądania API wraz z czasem obsługi i nazwą użytkownika.
function logApiRequests(req, res, next) {
  const startedAt = Date.now();
  res.once("finish", () => {
    if (res.statusCode < 400) {
      logger.info("Żądanie API", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        user: req.session.user.username
      });
    }
  });
  next();
}

// Odpowiedź 404 dla nieznanych endpointów API.
function apiNotFound(_req, res) {
  res.status(404).json({ error: "Nie znaleziono endpointu API." });
}

// Globalna obsługa błędów: ukrywa szczegóły błędów serwera przed klientem.
function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) logger.error("Błąd żądania", { message: error.message, stack: error.stack });
  else if (status >= 400) logger.warn("Żądanie odrzucone", { status, message: error.message });
  res.status(status).json({
    error: status >= 500 ? "Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z administratorem." : error.message
  });
}

module.exports = {
  requireAuthentication,
  requireRole,
  ensureRole,
  enforceRolePolicy,
  requireSameOrigin,
  asyncRoute,
  validId,
  requireVersion,
  requireValidId,
  logApiRequests,
  apiNotFound,
  errorHandler
};
