// Лицензия программы PlayPos на компьютере клиента.
// Активация: логин и пароль, выданные в админ-панели PlayPos → сервер возвращает подписанную лицензию.
// Проверка подписи и срока работает без интернета; при наличии интернета лицензия обновляется каждые 6 часов.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DAY = 86400000;
const REFRESH_MS = 6 * 3600 * 1000;

export async function createLicense({ dir, serverUrl, appVersion }) {
  const file = path.join(dir, "license.json");
  let st = {};
  try { st = JSON.parse(await fs.readFile(file, "utf8")); } catch (e) {}
  if (!st.deviceId) st.deviceId = crypto.randomUUID(); // постоянный номер этого компьютера
  const save = () => fs.writeFile(file, JSON.stringify(st, null, 2)).catch((e) => console.error("license save", e));
  await save();

  // Подпись проверяется ключом, полученным при активации; изменить срок в файле нельзя
  function payload() {
    if (!st.token || !st.publicKey) return null;
    const [body, sig] = st.token.split(".");
    try {
      if (!crypto.verify(null, Buffer.from(body), st.publicKey, Buffer.from(sig, "base64url"))) return null;
      const p = JSON.parse(Buffer.from(body, "base64url").toString());
      return p.deviceId === st.deviceId ? p : null;
    } catch (e) { return null; }
  }

  function status() {
    const p = payload();
    if (!p) return { ok: false, activated: false, reason: "Программа не активирована" };
    const now = Date.now();
    // Защита от перевода часов назад: время не может быть раньше последнего, что видела программа
    if (st.lastSeen && now < st.lastSeen - DAY) return { ok: false, activated: true, venue: p.venue, reason: "Проверьте дату и время на компьютере" };
    if (!st.lastSeen || now > st.lastSeen) st.lastSeen = now;
    const base = { activated: true, venue: p.venue, lifetime: !!p.lifetime, until: p.until, checkedAt: st.checkedAt || p.issuedAt };
    if (p.active === false) return { ...base, ok: false, reason: "Доступ отключён. Обратитесь в PlayPos" };
    if (p.lifetime) return { ...base, ok: true, daysLeft: null };
    const daysLeft = Math.ceil((p.until - now) / DAY);
    if (now >= p.until) return { ...base, ok: false, daysLeft, reason: "Подписка закончилась. Продлите её в PlayPos — данные сохранены" };
    return { ...base, ok: true, daysLeft };
  }

  async function remote(op, data) {
    const r = await fetch(serverUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-PlayPos": "1" }, body: JSON.stringify({ op, ...data, appVersion }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(out.error || "Ошибка сервера PlayPos"), { status: r.status });
    return out;
  }

  async function activate(login, password) {
    let out;
    try { out = await remote("license.activate", { login, password, deviceId: st.deviceId }); }
    catch (e) { if (!e.status) throw new Error("Нет связи с сервером PlayPos. Для активации нужен интернет"); throw e; }
    Object.assign(st, { token: out.token, publicKey: out.publicKey, deviceKey: out.deviceKey, checkedAt: Date.now() });
    if (!payload()) throw new Error("Лицензия не прошла проверку");
    await save();
    return status();
  }

  async function refresh() {
    const p = payload();
    if (!p || !st.deviceKey) return;
    try {
      const out = await remote("license.refresh", { clientId: p.clientId, deviceId: st.deviceId, deviceKey: st.deviceKey });
      if (out.token) { Object.assign(st, { token: out.token, publicKey: out.publicKey || st.publicKey, checkedAt: Date.now() }); }
    } catch (e) {
      // 403 — программу отвязали от компьютера в админ-панели: нужна новая активация
      if (e.status === 403) { delete st.token; delete st.deviceKey; }
    }
    status();
    await save();
  }

  // Код сброса пароля владельца из админ-панели PlayPos: проверяется на сервере, нужен интернет
  async function ownerReset(code) {
    const p = payload();
    if (!p || !st.deviceKey) throw new Error("Программа не активирована");
    try { return await remote("license.ownerReset", { clientId: p.clientId, deviceId: st.deviceId, deviceKey: st.deviceKey, code }); }
    catch (e) { if (!e.status) throw new Error("Нет связи с сервером PlayPos. Для сброса пароля нужен интернет"); throw e; }
  }

  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  return { status, activate, refresh, ownerReset, deviceId: st.deviceId, stop: () => clearInterval(timer) };
}
