// Walidacja i normalizacja danych słowników (spółki, odbiorcy, projekty).
// Każda funkcja rzuca błąd z kodem HTTP 400 przy nieprawidłowych danych.

// Rzuca błąd walidacji (HTTP 400).
function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

// Wymusza, aby dane wejściowe były zwykłym obiektem.
function requireObject(input, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid(`${label} musi być obiektem.`);
  }
}

// Waliduje pole tekstowe: typ, wymagalność i maksymalną długość; zwraca tekst bez spacji brzegowych.
function text(value, field, { required = false, max = 500 } = {}) {
  if (typeof value !== "string") invalid(`Nieprawidłowa wartość pola ${field}.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) {
    invalid(`Nieprawidłowa wartość pola ${field}.`);
  }
  return normalized;
}

// Waliduje identyfikator rekordu (dodatni BIGINT zapisany jako tekst).
function recordId(value) {
  const id = String(value || "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n) {
    invalid("Nieprawidłowy identyfikator rekordu.");
  }
  return id;
}

// Waliduje opcjonalną datę RRRR-MM-DD; pusta wartość daje null.
function validDate(value) {
  if (value === "" || value == null) return null;
  const date = text(value, "data zakończenia", { max: 10 });
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    invalid("Data zakończenia musi być poprawną datą w formacie RRRR-MM-DD.");
  }
  return date;
}

// Tworzy błąd HTTP 404 o podanej treści.
function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

// Zamienia naruszenie unikalności (23505) na błąd HTTP 409; pozostałe błędy przepuszcza.
function conflictOnDuplicate(error, message) {
  if (error.code === "23505") {
    error.status = 409;
    error.message = message;
  }
  return error;
}

module.exports = { invalid, requireObject, text, recordId, validDate, notFound, conflictOnDuplicate };
