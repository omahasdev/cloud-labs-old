// Створює файл секретів .dev.vars: випадковий токен запису ADMIN_TOKEN і, для Firestore, ключ сервісного акаунта GCP_SA_KEY.
// node secrets.mjs [файл ключа .json]; файл ключа потім видаляється, бо його вміст уже в .dev.vars.
// Повторний запуск створює новий токен, тож після нього секрети розгорнутого Worker оновлюються (крок 3).
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const keyFile = process.argv[2];
let text = `ADMIN_TOKEN=${randomBytes(32).toString("base64url")}\n`;   // 32 випадкові байти: 43 символи
if (keyFile) {
  const key = JSON.parse(readFileSync(keyFile, "utf8"));              // помилка, якщо файл не є ключем JSON
  text += `GCP_SA_KEY='${JSON.stringify(key)}'\n`;                     // увесь ключ одним рядком
  rmSync(keyFile);
}
writeFileSync(".dev.vars", text);
// Лише назви секретів: значення не мають з’являтися на екрані.
console.log(".dev.vars:", text.trim().split("\n").map((line) => line.split("=")[0]).join(", "));
