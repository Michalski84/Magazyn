const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeShipment } = require("../server/validation");
const { formatRegisterNumber, parseRegisterNumber } = require("../server/shipment-numbers");

const validShipment = {
  firma: "Kurier",
  numerListu: "ABC123",
  data: "2026-10-06",
  odbiorca: "Magazyn",
  nadawca: "Dostawca",
  rodzaj: "Paczka",
  iloscPrzesylek: 3,
  zawartosc: [{ nazwa: "Część", ilosc: 2, jednostka: "szt.", serial: "SN-1" }]
};

test("normalizes shipment text and applies legacy-compatible defaults", () => {
  const shipment = normalizeShipment({
    ...validShipment,
    firma: "  Kurier  ",
    nazwaSpolki: "  Maxto ITS  "
  });

  assert.equal(shipment.firma, "Kurier");
  assert.equal(shipment.nazwaSpolki, "Maxto ITS");
  assert.equal(shipment.status, "na magazynie");
  assert.equal(shipment.notatki, "");
  assert.equal(shipment.iloscPrzesylek, 3);
  assert.equal(shipment.zawartosc[0].ilosc, 2);
});

test("defaults the company name for legacy shipments and trims custom names", () => {
  assert.equal(normalizeShipment(validShipment).nazwaSpolki, "");
  assert.equal(normalizeShipment({ ...validShipment, nazwaSpolki: "  Własna spółka  " }).nazwaSpolki, "Własna spółka");
});

test("defaults shipment quantity for legacy records and rejects invalid quantities", () => {
  assert.equal(normalizeShipment({ ...validShipment, iloscPrzesylek: undefined }).iloscPrzesylek, 1);
  for (const iloscPrzesylek of [0, -1, 1.5, "abc", 2_147_483_648]) {
    assert.throws(() => normalizeShipment({ ...validShipment, iloscPrzesylek }), {
      status: 400,
      message: "Ilość przesyłek musi być dodatnią liczbą całkowitą."
    });
  }
});

test("rejects missing required values and impossible dates", () => {
  assert.throws(() => normalizeShipment({ ...validShipment, firma: "" }), {
    status: 400,
    message: "Pole firma jest wymagane."
  });
  assert.throws(() => normalizeShipment({ ...validShipment, data: "2026-02-31" }), {
    status: 400,
    message: /poprawną datą/
  });
});

test("rejects unsupported statuses and invalid item quantities", () => {
  assert.throws(() => normalizeShipment({ ...validShipment, status: "nieznany" }), {
    status: 400,
    message: "Nieprawidłowy status przesyłki."
  });
  assert.throws(() => normalizeShipment({
    ...validShipment,
    zawartosc: [{ nazwa: "Część", ilosc: 0, jednostka: "szt." }]
  }), {
    status: 400,
    message: /pozycji nr 1/
  });
});

test("formats annual shipment numbers with at least three digits", () => {
  assert.equal(formatRegisterNumber("1", 2026), "001/2026");
  assert.equal(formatRegisterNumber("12", 2026), "012/2026");
  assert.equal(formatRegisterNumber("123", 2026), "123/2026");
  assert.equal(formatRegisterNumber("1233", 2026), "1233/2026");
});

test("parses and canonicalizes imported shipment numbers", () => {
  assert.deepEqual(parseRegisterNumber(" 0001/2026 "), {
    sequence: "1",
    year: 2026,
    value: "001/2026"
  });
  assert.throws(() => parseRegisterNumber("0/2026"), /dodatni numer/);
  assert.throws(() => parseRegisterNumber("1-2026"), /format numer\/rocznik/);
});
