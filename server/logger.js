const fs = require("node:fs/promises");
const path = require("node:path");

const logDirectory = path.join(__dirname, "..", "logs");
let writeQueue = Promise.resolve();
let pruned = false;

function write(level, message, details) {
  const timestamp = new Date().toISOString();
  const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  const output = `[${timestamp}] ${level.padEnd(5)} ${message}${suffix}`;
  if (level === "ERROR") console.error(output);
  else console.log(output);

  const date = timestamp.slice(0, 10);
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(logDirectory, { recursive: true });
      if (!pruned) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const files = await fs.readdir(logDirectory);
        for (const file of files) {
          if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
          const filePath = path.join(logDirectory, file);
          const info = await fs.stat(filePath);
          if (info.mtimeMs < cutoff) await fs.unlink(filePath);
        }
        pruned = true;
      }
      await fs.appendFile(path.join(logDirectory, `app-${date}.log`), `${output}\n`, "utf8");
    })
    .catch(error => {
      console.error(`[${new Date().toISOString()}] ERROR Nie udało się zapisać logu do pliku: ${error.message}`);
    });
}

module.exports = {
  flush: () => writeQueue,
  info: (message, details) => write("INFO", message, details),
  warn: (message, details) => write("WARN", message, details),
  error: (message, details) => write("ERROR", message, details)
};
