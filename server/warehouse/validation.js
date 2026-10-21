// Walidacja i normalizacja danych wejściowych modułu magazynu.
// Rzuca błąd walidacji (HTTP 400).
function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

// Wymusza, aby dane wejściowe były obiektem.
function requireObject(input, name) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid(`${name} musi być obiektem.`);
  }
}

// Waliduje wymagane pole tekstowe.
function requiredText(value, field, maxLength = 500) {
  if (typeof value !== "string") invalid(`Pole ${field} jest wymagane.`);
  const result = value.trim();
  if (!result || result.length > maxLength) invalid(`Nieprawidłowa wartość pola ${field}.`);
  return result;
}

// Waliduje identyfikator rekordu.
function requiredId(value, field) {
  const id = requiredText(String(value || ""), field, 19);
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n) {
    invalid(`Nieprawidłowy identyfikator pola ${field}.`);
  }
  return id;
}

// Waliduje opcjonalne pole tekstowe.
function optionalText(value, field, maxLength = 2000) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > maxLength) invalid(`Nieprawidłowa wartość pola ${field}.`);
  return value.trim();
}

// Waliduje dodatnią ilość.
function positiveQuantity(value, field = "ilość") {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99_999_999_999.999) {
    invalid(`Pole ${field} musi być większe od zera.`);
  }
  const rounded = Math.round(quantity * 1000) / 1000;
  if (rounded <= 0) invalid(`Pole ${field} musi być większe od zera.`);
  return rounded;
}

// Waliduje datę w formacie RRRR-MM-DD.
function validDate(value, field) {
  const date = requiredText(value, field, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    invalid(`Pole ${field} musi zawierać poprawną datę w formacie RRRR-MM-DD.`);
  }
  return date;
}

module.exports = { invalid, requireObject, requiredText, requiredId, optionalText, positiveQuantity, validDate };
