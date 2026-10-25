// Konfiguracja aplikacji Express: zabezpieczenia, sesje, trasy API i pliki statyczne.
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const helmet = require("helmet");
const { pool } = require("./database");
const { SESSION_COOKIE, cookieOptions } = require("./http/config");
const {
  requireSameOrigin,
  requireAuthentication,
  ensureRole,
  enforceRolePolicy,
  logApiRequests,
  apiNotFound,
  errorHandler
} = require("./http/middleware");
const { auditWrites } = require("./audit");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const shipmentRoutes = require("./routes/shipments");
const catalogRoutes = require("./routes/catalogs");
const warehouseRoutes = require("./routes/warehouse");
const orderRoutes = require("./routes/orders");

const ROOT_DIR = path.join(__dirname, "..");

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET musi mieć co najmniej 32 znaki.");
}

const app = express();

// --- Zabezpieczenia i sesja ---
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: null
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
  cookie: { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 }
}));

// --- API: trasy publiczne, następnie chronione logowaniem ---
app.use("/api", authRoutes);
app.use("/api", requireSameOrigin, requireAuthentication, ensureRole, logApiRequests, auditWrites);
app.use("/api/admin", adminRoutes);
app.use("/api/shipments", enforceRolePolicy, shipmentRoutes);
app.use("/api/catalogs", enforceRolePolicy, catalogRoutes);
app.use("/api/warehouse", enforceRolePolicy, warehouseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api", apiNotFound);

// --- Pliki statyczne aplikacji ---
app.use("/src", express.static(path.join(ROOT_DIR, "src"), {
  dotfiles: "deny",
  index: false,
  fallthrough: false,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));
app.get("/sw.js", (_req, res) => res.sendFile(path.join(ROOT_DIR, "sw.js")));
app.get(["/", "/index.htm"], (_req, res) => res.sendFile(path.join(ROOT_DIR, "index.htm")));

app.use(errorHandler);

module.exports = app;
