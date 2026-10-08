const ALLOWED_STATUSES = new Set(["na magazynie", "odebrane", "częściowo odebrane"]);
const REQUIRED_TEXT_FIELDS = ["firma", "numerListu", "odbiorca", "nadawca", "rodzaj"];
const MAX_TEXT_LENGTH = 500;

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalizeShipment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid("Dane przesyłki muszą być obiektem.");
  }

  const text = (value, field) => {
    if (value == null) return "";
    if (typeof value !== "string" && typeof value !== "number") {
      invalid(`Nieprawidłowa wartość pola: ${field}.`);
    }
    const normalized = String(value).trim();
    const maxLength = field === "notatki" ? 20_000 : MAX_TEXT_LENGTH;
    if (normalized.length > maxLength) {
      invalid(`Pole ${field} przekracza limit ${maxLength} znaków.`);
    }
    return normalized;
  };

  const shipment = {
    firma: text(input.firma, "firma"),
    numerListu: text(input.numerListu, "numerListu"),
    data: text(input.data, "data"),
    odbiorca: text(input.odbiorca, "odbiorca"),
    nadawca: text(input.nadawca, "nadawca"),
    rodzaj: text(input.rodzaj, "rodzaj"),
    iloscPrzesylek: input.iloscPrzesylek == null ? 1 : Number(input.iloscPrzesylek),
    zamowienie: text(input.zamowienie, "zamowienie"),
    projekt: text(input.projekt, "projekt"),
    status: text(input.status || "na magazynie", "status"),
    odbiorcaPodpis: text(input.odbiorcaPodpis, "odbiorcaPodpis"),
    notatki: text(input.notatki, "notatki"),
    zawartosc: input.zawartosc
  };

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!shipment[field]) invalid(`Pole ${field} jest wymagane.`);
  }
  if (!Number.isSafeInteger(shipment.iloscPrzesylek) ||
      shipment.iloscPrzesylek < 1 ||
      shipment.iloscPrzesylek > 2_147_483_647) {
    invalid("Ilość przesyłek musi być dodatnią liczbą całkowitą.");
  }
  const parsedDate = new Date(`${shipment.data}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shipment.data) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== shipment.data) {
    invalid("Data przyjęcia musi być poprawną datą w formacie RRRR-MM-DD.");
  }
  if (!ALLOWED_STATUSES.has(shipment.status)) invalid("Nieprawidłowy status przesyłki.");
  if (!Array.isArray(shipment.zawartosc) || shipment.zawartosc.length > 500) {
    invalid("Zawartość przesyłki musi zawierać maksymalnie 500 pozycji.");
  }

  shipment.zawartosc = shipment.zawartosc.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      invalid(`Nieprawidłowa pozycja nr ${index + 1}.`);
    }
    const nazwa = text(item.nazwa, `zawartosc[${index}].nazwa`);
    const jednostka = text(item.jednostka, `zawartosc[${index}].jednostka`);
    const serial = text(item.serial, `zawartosc[${index}].serial`);
    const ilosc = Number(item.ilosc);
    if (!nazwa || !jednostka || !Number.isSafeInteger(ilosc) || ilosc < 1) {
      invalid(`Nieprawidłowa nazwa, jednostka lub ilość w pozycji nr ${index + 1}.`);
    }
    return { nazwa, ilosc, jednostka, serial };
  });

  return shipment;
}

module.exports = { ALLOWED_STATUSES, normalizeShipment };
