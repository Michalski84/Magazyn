require("dotenv").config();

const path = require("node:path");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { pool, runMigrations, closeDatabase } = require("./server/database");
const shipments = require("./server/shipments");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_COOKIE = "magazyn.sid";

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET musi mieć co najmniej 32 znaki.");
}

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(express.json({ limit: "10mb" }));
app.use(session({
  name: SESSION_COOKIE,
  store: new (connectPgSimple(session))({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut." }
});

function requireAuthentication(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Wymagane logowanie." });
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin !== expectedOrigin) {
    return res.status(403).json({ error: "Żądanie pochodzi z niedozwolonego źródła." });
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validId(value) {
  return value.length <= 19 && /^\d+$/.test(value) &&
    BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n;
}

function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    const error = new Error("Brak poprawnej wersji przesyłki. Odśwież listę i spróbuj ponownie.");
    error.status = 400;
    throw error;
  }
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

app.get("/api/auth/session", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/auth/login", loginLimiter, requireSameOrigin, asyncRoute(async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password || username.length > 80 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Podaj poprawną nazwę użytkownika i hasło." });
  }
  const result = await pool.query(
    "SELECT id, username, password_hash FROM app_users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
  }
  await new Promise((resolve, reject) => {
    req.session.regenerate(error => error ? reject(error) : resolve());
  });
  req.session.user = { id: user.id, username: user.username };
  res.json({ user: req.session.user });
}));

app.post("/api/auth/logout", requireSameOrigin, requireAuthentication, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true"
    });
    res.status(204).end();
  });
});

app.use("/api", requireSameOrigin, requireAuthentication);

app.get("/api/shipments", asyncRoute(async (_req, res) => {
  res.json(await shipments.getShipments());
}));

app.post("/api/shipments", asyncRoute(async (req, res) => {
  const shipment = await shipments.createShipment(req.body);
  res.status(201).json(shipment);
}));

app.post("/api/shipments/import", asyncRoute(async (req, res) => {
  res.json(await shipments.importShipments(req.body?.shipments));
}));

app.put("/api/shipments/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  res.json(await shipments.replaceShipment(req.params.id, req.body));
}));

app.patch("/api/shipments/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  res.json(await shipments.patchShipment(req.params.id, req.body));
}));

app.delete("/api/shipments/:id", asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator przesyłki." });
  requireVersion(req.body?.version);
  await shipments.deleteShipment(req.params.id, req.body?.version);
  res.status(204).end();
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Nie znaleziono endpointu API." }));

app.use("/src", express.static(path.join(__dirname, "src"), {
  dotfiles: "deny",
  index: false,
  fallthrough: false,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("/sw.js", (_req, res) => res.sendFile(path.join(__dirname, "sw.js")));
app.get(["/", "/index.htm"], (_req, res) => res.sendFile(path.join(__dirname, "index.htm")));

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? "Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z administratorem." : error.message
  });
});

let server;

async function start() {
  await runMigrations();
  server = app.listen(PORT, HOST, () => {
    console.log(`Aplikacja działa pod adresem http://${HOST}:${PORT}`);
  });
}

async function stop() {
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  await closeDatabase();
}

if (require.main === module) {
  start().catch(error => {
    console.error("Nie udało się uruchomić aplikacji:", error);
    process.exitCode = 1;
  });
  process.once("SIGINT", () => stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => stop().then(() => process.exit(0)));
}

module.exports = { app, start, stop };
