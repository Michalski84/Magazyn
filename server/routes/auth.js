// Trasy publiczne: stan aplikacji oraz logowanie, sprawdzanie sesji i wylogowanie (/api).
const express = require("express");
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");
const { pool } = require("../database");
const { recordAudit } = require("../audit");
const { SESSION_COOKIE, cookieOptions } = require("../http/config");
const { asyncRoute, requireSameOrigin, requireAuthentication } = require("../http/middleware");

const router = express.Router();

// Ogranicza liczbę prób logowania, aby utrudnić zgadywanie haseł.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut." }
});

router.get("/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

router.get("/auth/session", asyncRoute(async (req, res) => {
  if (req.session.user && !req.session.user.role) {
    const result = await pool.query("SELECT role FROM app_users WHERE id = $1", [req.session.user.id]);
    req.session.user.role = result.rows[0]?.role || "viewer";
  }
  res.json({ user: req.session.user || null });
}));

router.post("/auth/login", loginLimiter, requireSameOrigin, asyncRoute(async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password || username.length > 80 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Podaj poprawną nazwę użytkownika i hasło." });
  }
  const result = await pool.query(
    "SELECT id, username, password_hash, role FROM app_users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordAudit({ username, action: "Nieudane logowanie", method: "POST", path: "/auth/login", entity: "Sesja", statusCode: 401 });
    return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
  }
  // Nowy identyfikator sesji po zalogowaniu chroni przed przejęciem sesji.
  await new Promise((resolve, reject) => {
    req.session.regenerate(error => error ? reject(error) : resolve());
  });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  recordAudit({ userId: user.id, username: user.username, action: "Logowanie", method: "POST", path: "/auth/login", entity: "Sesja", statusCode: 200 });
  res.json({ user: req.session.user });
}));

router.post("/auth/logout", requireSameOrigin, requireAuthentication, (req, res, next) => {
  const { id, username } = req.session.user;
  recordAudit({ userId: id, username, action: "Wylogowanie", method: "POST", path: "/auth/logout", entity: "Sesja", statusCode: 204 });
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  });
});

module.exports = router;
