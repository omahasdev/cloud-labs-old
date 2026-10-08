// Модуль доступу до Firestore REST API від імені сервісного акаунта (ключ у секреті GCP_SA_KEY):
// запити з токеном Google і перетворення документів Firestore на звичайні об’єкти й назад.
import { SignJWT, importPKCS8 } from "jose";   // створення й підпис JWT

// Токен доступу Google і час (у секундах), до якого він дійсний; живе, доки працює екземпляр Worker.
let cached = { token: null, expires: 0 };

// Підписаний ключем сервісного акаунта JWT обмінюється в Google на токен доступу на 1 годину.
async function googleToken(env) {
  const now = Math.floor(Date.now() / 1000);                // поточний час у секундах
  if (cached.expires > now + 60) return cached.token;      // токен ще дійсний щонайменше хвилину
  const key = JSON.parse(env.GCP_SA_KEY);                   // вміст файлу ключа з секрету
  // JWT: хто просить токен (iss), на що (scope), кому (aud) і на який час; підпис закритим ключем з файлу ключа.
  const pk = await importPKCS8(key.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(key.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);
  const r = await fetch("https://oauth2.googleapis.com/token", {   // обмін JWT на токен доступу
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Google: ${data.error_description ?? data.error}`);
  cached = { token: data.access_token, expires: now + data.expires_in };
  return cached.token;
}

// Запит до Firestore REST API; path відраховується від кореня документів бази.
// З тілом запит іде методом POST (запис, runQuery), без тіла методом GET (читання документа).
export async function firestore(env, path, body) {
  const project = JSON.parse(env.GCP_SA_KEY).project_id;   // id проєкту з файлу ключа
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents${path}`;
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${await googleToken(env)}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (r.status === 404 && !body) return null;            // документа немає
  if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);   // текст помилки, зокрема посилання на індекс
  return r.json();
}
