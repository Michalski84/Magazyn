const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeShipment } = require("../server/validation");

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
  const shipment = normalizeShipment({ ...validShipment, firma: "  Kurier  " });

  assert.equal(shipment.firma, "Kurier");
  assert.equal(shipment.status, "na magazynie");
  assert.equal(shipment.notatki, "");
  assert.equal(shipment.iloscPrzesylek, 3);
  assert.equal(shipment.zawartosc[0].ilosc, 2);
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
