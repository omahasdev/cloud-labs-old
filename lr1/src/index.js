// Worker перевірки етапу 1: один запит до Firestore доводить, що ключ і роль сервісного акаунта працюють.
import { firestore } from "./firestore.js";

// Cloudflare викликає fetch на кожен HTTP-запит; env містить секрет GCP_SA_KEY.
export default {
  async fetch(request, env) {
    // Не більше одного документа колекції games: запит доводить, що ключ і роль сервісного акаунта працюють.
    const res = await firestore(env, "/games?pageSize=1");
    return Response.json({ ok: true, documents: res.documents?.length ?? 0 });   // порожня колекція: documents немає
  },
};
