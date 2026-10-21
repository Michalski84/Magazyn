// Punkt wejścia serwera: wczytuje konfigurację, uruchamia migracje i nasłuchuje na żądania.
require("dotenv").config();

const { runMigrations, closeDatabase } = require("./server/database");
const logger = require("./server/logger");
const app = require("./server/app");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

let server;

async function start() {
  await runMigrations();
  server = app.listen(PORT, HOST, () => {
    logger.info("Aplikacja została uruchomiona", { host: HOST, port: PORT });
  });
}

async function stop() {
  logger.info("Zamykanie aplikacji");
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  await closeDatabase();
  await logger.flush();
}

if (require.main === module) {
  start().catch(error => {
    logger.error("Nie udało się uruchomić aplikacji", { message: error.message, stack: error.stack });
    process.exitCode = 1;
  });
  process.once("SIGINT", () => stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => stop().then(() => process.exit(0)));
}

module.exports = { app, start, stop };
