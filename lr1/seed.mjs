// Початкові дані: створює ігри й видачі через POST власного API з токеном ADMIN_TOKEN з .dev.vars,
// тож записи проходять ті самі перевірки, що й будь-який запит.
// node --env-file=.dev.vars seed.mjs <адреса API> <кількість ігор>
const base = process.argv[2];                     // перший аргумент після назви скрипту
const count = Number(process.argv[3] ?? 20);      // другий аргумент; без нього 20
const LEVELS = ["легка", "середня", "складна", "експертна"];
const two = (n) => String(n).padStart(2, "0");    // 3 → "03"

// POST з токеном з .dev.vars; будь-яка відповідь, крім 201, зупиняє скрипт з текстом помилки.
async function post(path, body) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status !== 201) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();                                // створений запис разом з id
}

// Значення обчислюються з номера запису i (% дає остачу від ділення), тож дані щоразу однакові.
for (let i = 1; i <= count; i++) {
  const game = await post("/api/games", {
    title: `Гра ${i}`,
    complexity: LEVELS[i % 4],                    // складності по колу
    players_max: 2 + (i % 11),                    // 2…12
    price_day: 10 + ((i * 37) % 491),             // 10…500
    released_on: `${2024 + (i % 3)}-${two(1 + (i % 12))}-15`,
    complete: i % 3 !== 0,                        // кожна третя гра без повного комплекту
  });
  for (let k = 0; k < 3; k++) {                   // три видачі на гру
    await post(`/api/games/${game.id}/checkouts`, {
      taken_at: `2026-${two(1 + ((i + k) % 12))}-15T10:00:00Z`,
      days: 1 + ((i * 5 + k) % 14),               // 1…14
      damaged: (i + k) % 4 === 0,
    });
  }
}
console.log(`створено ${count} ігор і ${count * 3} видач`);
