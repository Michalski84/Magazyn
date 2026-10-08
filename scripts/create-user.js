require("dotenv").config();

const bcrypt = require("bcryptjs");
const { pool, runMigrations, closeDatabase } = require("../server/database");

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Utwórz użytkownika z interaktywnego terminala.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(buffer) {
      for (const character of buffer.toString("utf8")) {
        if (character === "\u0003") return finish(new Error("Przerwano."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    process.stdin.on("data", onData);
  });
}

async function main() {
  await runMigrations();
  const username = process.argv[2]?.trim();
  if (!username || !/^[\p{L}\p{N}_.-]{2,80}$/u.test(username)) {
    throw new Error("Użycie: npm run create-user -- nazwa_użytkownika (2–80 liter, cyfr, kropek, myślników lub podkreśleń).");
  }
  const password = await readHidden("Hasło: ");
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Hasło musi mieć co najmniej 12 znaków i nie może przekraczać 72 bajtów UTF-8.");
  }
  const confirmation = await readHidden("Powtórz hasło: ");
  if (password !== confirmation) throw new Error("Podane hasła różnią się.");

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO app_users (username, password_hash) VALUES ($1, $2)",
    [username, passwordHash]
  );
  console.log(`Utworzono użytkownika ${username}.`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
