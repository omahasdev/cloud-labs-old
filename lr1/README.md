# ЛР1: API прокату ігор

Варіант: приклад (прокат ігор). Платформа: Cloudflare Workers + Firestore, мова JavaScript.

Адреса API: https://lr1-games.omahas-edu.workers.dev

## Запити

1. Ігри заданої складності, випущені після заданої дати, з повним комплектом, від найновішої:
   `GET /api/games?complexity=складна&released_after=2024-12-31&limit=2&offset=0`
   `{"items":[{"id":"SBTqWbHkg0EJPplBmWGs","title":"Гра 2",...}],"next_offset":2}`
2. Кількість видач гри за місяць і скільки з них з пошкодженням:
   `GET /api/games/stats?game_id=<id>&month=2026-03`
   `{"checkouts":1,"damaged":0}`
3. Видачі гри довші за min_days днів, від найновішої:
   `GET /api/games/<id>/checkouts?min_days=1`
   `{"items":[{"id":"...","taken_at":"2026-05-15T10:00:00Z","days":13,"damaged":true},{"id":"...","taken_at":"2026-04-15T10:00:00Z","days":12,"damaged":false},{"id":"...","taken_at":"2026-03-15T10:00:00Z","days":11,"damaged":false}]}`

## Тлумачення

«Після заданої дати» означає строго пізніше за дату (`released_on > released_after`).
