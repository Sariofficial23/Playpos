// Единая точка входа API: POST /api/rpc { op, ...данные }.
import { ensureSchema } from "../lib/db.js";
import { run } from "../lib/ops.js";

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw Object.assign(new Error("big"), { status: 413 }); }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "Только POST" });
    // Защита от подделки запросов с чужих сайтов: такой заголовок нельзя отправить простой формой
    if (req.headers["x-playpos"] !== "1") return send(res, 403, { error: "Запрос отклонён" });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: "Неверный запрос" }); }
    await ensureSchema();
    const out = await run(String(body.op || ""), { req, res, body });
    send(res, 200, out);
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error("rpc error", e?.code || "", e?.message);
    send(res, 500, { error: "Ошибка сервера. Попробуйте ещё раз" });
  }
}
