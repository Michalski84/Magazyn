require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { runMigrations, closeDatabase } = require("../server/database");
const { normalizeShipment } = require("../server/validation");
const { importShipments } = require("../server/shipments");

function parseLegacyShipments(parsed) {
  const value = parsed?.shipments;
  const records = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(records)) {
    throw new Error('Plik nie zawiera listy przesyłek pod kluczem "shipments".');
  }
  return records.map((record, index) => {
    try {
      return normalizeShipment({
        ...record,
        status: record.status || "na magazynie",
        zawartosc: Array.isArray(record.zawartosc) ? record.zawartosc : []
      });
    } catch (error) {
      throw new Error(`Nieprawidłowe dane przesyłki nr ${index + 1}: ${error.message}`);
    }
  });
}

async function main() {
  await runMigrations();
  const source = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "storage.json"));
  const legacy = JSON.parse(await fs.readFile(source, "utf8"));
  const records = parseLegacyShipments(legacy);
  await importShipments(records, { replace: false });
  console.log(`Przeniesiono ${records.length} przesyłek z pliku ${source}.`);
}

main()
  .catch(error => {
    console.error("Nie udało się przenieść danych:", error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
