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

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zbyt wiele prób utworzenia konta. Spróbuj ponownie za godzinę." }
});

function validUsername(username) {
  return /^[\p{L}\p{N}_.-]{2,80}$/u.test(username);
}

router.post("/auth/register", registrationLimiter, requireSameOrigin, asyncRoute(async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const confirmation = typeof req.body?.passwordConfirmation === "string" ? req.body.passwordConfirmation : "";
  if (!validUsername(username)) {
    return res.status(400).json({ error: "Nazwa użytkownika musi mieć 2–80 znaków: litery, cyfry, kropki, myślniki lub podkreślenia." });
  }
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Hasło musi mieć co najmniej 12 znaków i nie może przekraczać 72 bajtów UTF-8." });
  }
  if (password !== confirmation) {
    return res.status(400).json({ error: "Podane hasła różnią się." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(`
      INSERT INTO app_users (username, password_hash, role, active)
      VALUES ($1, $2, 'viewer', FALSE)
      RETURNING id, username
    `, [username, passwordHash]);
    const user = result.rows[0];
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: "Utworzenie konta oczekującego na aktywację",
      method: "POST",
      path: "/auth/register",
      entity: "Konto",
      entityId: user.id,
      statusCode: 201
    });
    res.status(201).json({ message: "Konto utworzono. Zalogujesz się po zatwierdzeniu przez administratora." });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ta nazwa użytkownika jest już zajęta." });
    }
    throw error;
  }
}));

router.get("/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

router.get("/auth/session", asyncRoute(async (req, res) => {
  if (req.session.user) {
    const result = await pool.query("SELECT username, role, active FROM app_users WHERE id = $1", [req.session.user.id]);
    const account = result.rows[0];
    if (!account?.active) {
      await new Promise((resolve, reject) => {
        req.session.destroy(error => error ? reject(error) : resolve());
      });
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return res.json({ user: null });
    }
    req.session.user.username = account.username;
    req.session.user.role = account.role;
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
    "SELECT id, username, password_hash, role, active FROM app_users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordAudit({ username, action: "Nieudane logowanie", method: "POST", path: "/auth/login", entity: "Sesja", statusCode: 401 });
    return res.status(401).json({ error: "Nieprawidłowa nazwa użytkownika lub hasło." });
  }
  if (!user.active) {
    return res.status(403).json({ error: "Konto oczekuje na aktywację przez administratora." });
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
