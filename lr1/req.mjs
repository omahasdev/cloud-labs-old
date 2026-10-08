// Перевірка API з консолі: один запит, на виході код відповіді, заголовки кешу й читань і тіло відповіді.
// node req.mjs <метод> <адреса> [поле=значення …]; з --env-file=.dev.vars запит несе токен ADMIN_TOKEN.
const [method, url, ...fields] = process.argv.slice(2);   // аргументи після назви скрипту

// Тіло JSON з пар поле=значення: true/false стають логічними значеннями, числа числами, решта рядками.
const body = {};
for (const field of fields) {
  const [name, text] = field.split(/=(.*)/s);             // поділ на першому «=»
  body[name] = text === "true" || text === "false" ? text === "true" : text !== "" && !isNaN(text) ? Number(text) : text;
}

const headers = { "content-type": "application/json" };
if (process.env.ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.ADMIN_TOKEN}`;   // лише з --env-file=.dev.vars
const r = await fetch(url, { method, headers, body: fields.length ? JSON.stringify(body) : undefined });   // кирилицю в адресі Node.js кодує сам
const h = (name) => r.headers.get(name) ?? "-";             // значення заголовка або "-", якщо його немає
console.log(`${r.status} cache-control: ${h("cache-control")} x-read-count: ${h("x-read-count")}`);
console.log(await r.text());                                // тіло відповіді
