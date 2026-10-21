// Konfiguracja współdzielona przez aplikację HTTP.
const SESSION_COOKIE = "magazyn.sid";

// Opcje ciasteczka sesji (używane przy tworzeniu sesji i jej czyszczeniu przy wylogowaniu).
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true"
  };
}

module.exports = { SESSION_COOKIE, cookieOptions };
