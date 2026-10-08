// API прокату ігор: Worker на Hono з маршрутами запитів 1–3, читанням гри й створенням ігор і видач.
// Параметри й тіло перевіряються за схемами zod; запис дозволено лише з токеном ADMIN_TOKEN.
// Дані зберігає Firestore, звернення до нього йдуть через модуль firestore.js.
// Сервер npx wrangler dev перезапускає Worker після кожного збереження цього файлу.
import { Hono } from "hono";                          // маршрути
import { bearerAuth } from "hono/bearer-auth";        // перевірка заголовка Authorization: Bearer
import { validator } from "hono/validator";          // перевірка параметрів і тіла
import { object, string, number, boolean, coerce } from "zod";   // опис схем
import { firestore, fromDoc, toFields, where, and } from "./firestore.js";   // модуль етапу 1

const PAGE_SIZE = 10;   // «На сторінці» з таблиці варіантів
const MAX_AGE = 60;     // «max-age» з таблиці варіантів

// Схеми тіла POST: поля й типи.
const Game = object({
  title: string(), complexity: string(), players_max: number(),
  price_day: number(), released_on: string(), complete: boolean(),
});
const Checkout = object({ taken_at: string(), days: number(), damaged: boolean() });

// Схеми параметрів адреси; coerce перетворює рядок з адреси на число, default підставляє значення без параметра.
const ListQuery = object({
  complexity: string(), released_after: string(),
  limit: coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  offset: coerce.number().int().min(0).default(0),
});
const StatsQuery = object({ game_id: string(), month: string().regex(/^\d{4}-\d{2}$/) });
const CheckoutsQuery = object({ min_days: coerce.number().default(0) });

// Перевірка за схемою; на помилку відповідь 400 з назвою першого неправильного поля.
const valid = (target, schema) => validator(target, (value, c) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return c.json({ error: `${issue.path.join(".")}: ${issue.message}` }, 400);
  }
  return result.data;                             // перевірені й перетворені значення для c.req.valid()
});

function nextMonth(month) {                       // "2026-09" → "2026-10"
  const d = new Date(`${month}-01T00:00:00Z`);    // перше число місяця в UTC
  d.setUTCMonth(d.getUTCMonth() + 1);             // для грудня Date сам переходить на січень наступного року
  return d.toISOString().slice(0, 7);             // "2026-10-01T00:00:00.000Z" → "2026-10"
}

const app = new Hono();                           // c.env у кожному маршруті містить секрети ADMIN_TOKEN і GCP_SA_KEY

// Відповіді GET з кодом 200 браузер може кешувати MAX_AGE секунд.
app.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET" && c.res.status === 200) c.res.headers.set("cache-control", `max-age=${MAX_AGE}`);
});
// Кожен POST лише з токеном; без секрету ADMIN_TOKEN запис вимкнено (401).
app.post("/api/*", bearerAuth({ verifyToken: (token, c) => !!c.env.ADMIN_TOKEN && token === c.env.ADMIN_TOKEN }));

// Запит 1: ігри заданої складності, випущені після заданої дати, з повним комплектом.
app.get("/api/games", valid("query", ListQuery), async (c) => {
  const q = c.req.valid("query");                 // параметри вже перевірено й перетворено
  const rows = await firestore(c.env, ":runQuery", {
    structuredQuery: {
      from: [{ collectionId: "games" }],          // колекція
      where: and(where("complete", "EQUAL", true), where("complexity", "EQUAL", q.complexity),
                 where("released_on", "GREATER_THAN", q.released_after)),
      // __name__ (шлях документа) упорядковує документи з однаковою датою.
      orderBy: [{ field: { fieldPath: "released_on" }, direction: "DESCENDING" },
                { field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
      offset: q.offset, limit: q.limit,
    },
    explainOptions: { analyze: true },            // лічильник прочитаних документів
  });
  // Відповідь runQuery: масив елементів з document; останній елемент містить explainMetrics.
  const items = rows.filter((r) => r.document).map((r) => fromDoc(r.document));
  c.header("x-read-count", String(rows.at(-1).explainMetrics?.executionStats?.readOperations ?? ""));
  // Повна сторінка означає, що далі можуть бути ще записи.
  return c.json({ items, next_offset: items.length === q.limit ? q.offset + q.limit : null });
});

// Кількість видач гри, що задовольняють умови; запит до адреси документа гри рахує його підколекцію.
async function count(env, id, filters) {
  const res = await firestore(env, `/games/${id}:runAggregationQuery`, {
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: "checkouts" }], where: and(...filters) },
      aggregations: [{ alias: "n", count: {} }],  // результат під назвою n
    },
  });
  return Number(res[0].result.aggregateFields.n.integerValue);
}

// Запит 2: кількість видач гри за місяць і скільки з них з пошкодженням.
app.get("/api/games/stats", valid("query", StatsQuery), async (c) => {
  const q = c.req.valid("query");
  // Рядки дат порівнюються посимвольно: "2026-09-15T…" >= "2026-09" і < "2026-10".
  const period = [where("taken_at", "GREATER_THAN_OR_EQUAL", q.month), where("taken_at", "LESS_THAN", nextMonth(q.month))];
  return c.json({
    checkouts: await count(c.env, q.game_id, period),
    damaged: await count(c.env, q.game_id, [...period, where("damaged", "EQUAL", true)]),   // друга умова, другий запит
  });
});

// Гра з :id в адресі або null.
async function getGame(c) {
  const doc = await firestore(c.env, `/games/${c.req.param("id")}`);
  return doc && fromDoc(doc);
}

app.get("/api/games/:id", async (c) => {
  const game = await getGame(c);
  return game ? c.json(game) : c.json({ error: "гри немає" }, 404);
});

// Запит 3: видачі гри довші за min_days днів (без параметра всі), від найновішої.
app.get("/api/games/:id/checkouts", valid("query", CheckoutsQuery), async (c) => {
  if (!(await getGame(c))) return c.json({ error: "гри немає" }, 404);
  const rows = await firestore(c.env, `/games/${c.req.param("id")}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: "checkouts" }],
      where: where("days", "GREATER_THAN", c.req.valid("query").min_days),
    },
  });
  const items = rows.filter((r) => r.document).map((r) => fromDoc(r.document));
  // Порядок задає код: видач однієї гри мало, а сортування в запиті потребувало б складеного індексу.
  items.sort((a, b) => b.taken_at.localeCompare(a.taken_at));
  return c.json({ items });
});

// POST на колекцію створює документ з id, який призначає Firestore.
app.post("/api/games", valid("json", Game), async (c) => {
  const doc = await firestore(c.env, "/games", { fields: toFields(c.req.valid("json")) });
  return c.json(fromDoc(doc), 201);
});

app.post("/api/games/:id/checkouts", valid("json", Checkout), async (c) => {
  if (!(await getGame(c))) return c.json({ error: "гри немає" }, 404);
  const doc = await firestore(c.env, `/games/${c.req.param("id")}/checkouts`, { fields: toFields(c.req.valid("json")) });
  return c.json(fromDoc(doc), 201);
});

// Методи, яких в API немає: 405. Невідома адреса: 404 (так відповідає Hono).
app.on(["PUT", "PATCH", "DELETE"], "/api/*", (c) => c.json({ error: "метод не підтримується" }, 405));

export default app;                               // Hono сам є обробником fetch для Cloudflare
