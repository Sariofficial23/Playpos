// Платформа PlayPos (только на Vercel): админ-панель владельца PlayPos и выдача лицензий программам клиентов.
// Лицензия — подписанный (Ed25519) документ со сроком подписки; программа проверяет подпись без интернета.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, fail } from "./db.js";
import { str, int, idOf, sha, readCookie, cookieHeader } from "./ops.js";

const DAY = 86400000;
const ADMIN_HOURS = 12;
const PERIODS = [1, 3, 6, 12];

/* ---------- Ключ подписи лицензий (создаётся один раз и хранится в базе) ---------- */
async function signingKeys(t = db()) {
  const [k] = await t`select public_pem, private_pem from platform_keys where id = 1`;
  if (k) return k;
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const row = { public_pem: publicKey.export({ type: "spki", format: "pem" }), private_pem: privateKey.export({ type: "pkcs8", format: "pem" }) };
  await t`insert into platform_keys (id, public_pem, private_pem) values (1, ${row.public_pem}, ${row.private_pem}) on conflict (id) do nothing`;
  const [again] = await t`select public_pem, private_pem from platform_keys where id = 1`;
  return again;
}
async function issueLicense(c) {
  const keys = await signingKeys();
  const payload = { v: 1, clientId: String(c.id), venue: c.venue, lifetime: c.lifetime, until: c.paid_until ? new Date(c.paid_until).getTime() : null, active: c.active, deviceId: c.device_id, issuedAt: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.sign(null, Buffer.from(body), keys.private_pem).toString("base64url");
  return { token: `${body}.${sig}`, publicKey: keys.public_pem };
}

/* ---------- Сессия администратора ---------- */
async function currentAdmin(req) {
  const token = readCookie(req, "pp_admin");
  if (!token) return null;
  const [a] = await db()`select a.id, a.email from admin_sessions s join platform_admins a on a.id = s.admin_id
    where s.token_hash = ${sha(token)} and s.expires_at > now()`;
  return a || null;
}
async function startAdminSession(t, req, res, adminId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await t`insert into admin_sessions (token_hash, admin_id, expires_at) values (${sha(token)}, ${adminId}, now() + ${ADMIN_HOURS + " hours"}::interval)`;
  res.setHeader("Set-Cookie", cookieHeader(req, "pp_admin", token, ADMIN_HOURS * 3600));
}
// Защита входа от перебора: 5 ошибок — пауза 10 минут
async function guardAttempts(key, ok) {
  const sql = db();
  const [att] = await sql`select locked_until from login_attempts where key = ${key}`;
  if (att?.locked_until && new Date(att.locked_until) > new Date()) fail(429, "Слишком много попыток. Подождите 10 минут");
  if (await ok()) { await sql`delete from login_attempts where key = ${key}`; return true; }
  await sql`insert into login_attempts (key, fails) values (${key}, 1)
    on conflict (key) do update set fails = case when login_attempts.fails + 1 >= 5 then 0 else login_attempts.fails + 1 end,
      locked_until = case when login_attempts.fails + 1 >= 5 then now() + interval '10 minutes' else null end`;
  return false;
}

const loginOf = (v) => {
  const login = str(v, 30, "Логин", 3).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(login)) fail(400, "Логин: латинские буквы, цифры, точка, дефис");
  return login;
};
const ms = (d) => (d ? new Date(d).getTime() : null);

/* ---------- Операции ---------- */
const OPS = {
  async "admin.info"() {
    const [{ n }] = await db()`select count(*)::int as n from platform_admins`;
    return { needsSetup: n === 0 };
  },

  // Первый администратор создаётся с кодом SETUP_TOKEN (из настроек Vercel)
  async "admin.setup"({ req, res, body }) {
    const token = process.env.SETUP_TOKEN || "";
    if (token.length < 8 || body.token !== token) fail(403, "Неверный код установки");
    const email = str(body.email, 120, "Почта").toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Проверьте почту");
    const password = str(body.password, 100, "Пароль", 8);
    return db().begin(async (t) => {
      await t`select pg_advisory_xact_lock(7710003)`;
      const [{ n }] = await t`select count(*)::int as n from platform_admins`;
      if (n > 0) fail(409, "Администратор уже создан — войдите");
      const [a] = await t`insert into platform_admins (email, pass_hash) values (${email}, ${await bcrypt.hash(password, 10)}) returning id`;
      await startAdminSession(t, req, res, a.id);
      return { ok: true };
    });
  },

  async "admin.login"({ req, res, body }) {
    const email = str(body.email, 120, "Почта").toLowerCase();
    const password = str(body.password, 100, "Пароль");
    let admin = null;
    const ok = await guardAttempts("admin:" + email, async () => {
      [admin] = await db()`select id, pass_hash from platform_admins where lower(email) = ${email}`;
      return !!admin && (await bcrypt.compare(password, admin.pass_hash));
    });
    if (!ok) fail(401, "Неверная почта или пароль");
    await db().begin((t) => startAdminSession(t, req, res, admin.id));
    return { ok: true };
  },

  async "admin.logout"({ req, res }) {
    const token = readCookie(req, "pp_admin");
    if (token) await db()`delete from admin_sessions where token_hash = ${sha(token)}`;
    res.setHeader("Set-Cookie", cookieHeader(req, "pp_admin", "", 0));
    return { ok: true };
  },

  async "admin.state"({ admin }) {
    const sql = db();
    const clients = await sql`select * from clients order by created_at desc`;
    const payments = await sql`select * from client_payments order by at desc limit 500`;
    const leads = await sql`select id, name, phone, venue, message, done, created_at from leads order by created_at desc limit 300`;
    return {
      serverNow: Date.now(),
      email: admin.email,
      clients: clients.map((c) => ({
        id: String(c.id), venue: c.venue, contact: c.contact, phone: c.phone, login: c.login, until: ms(c.paid_until), lifetime: c.lifetime,
        active: c.active, deviceBound: !!c.device_id, activatedAt: ms(c.activated_at), lastSeen: ms(c.last_seen_at), appVersion: c.app_version, note: c.note, createdAt: ms(c.created_at),
      })),
      leads: leads.map((l) => ({ id: String(l.id), name: l.name, phone: l.phone, venue: l.venue, message: l.message, done: l.done, at: ms(l.created_at) })),
      payments: payments.map((p) => ({ id: String(p.id), clientId: String(p.client_id), at: ms(p.at), months: p.months, amount: p.amount, comment: p.comment, prevUntil: ms(p.prev_until), newUntil: ms(p.new_until) })),
    };
  },

  async "admin.clientCreate"({ admin, body }) {
    const venue = str(body.venue, 80, "Название площадки");
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 60) : "";
    const phone = str(body.phone, 30, "Телефон", 5);
    const login = loginOf(body.login);
    const password = str(body.password, 100, "Пароль", 6);
    const lifetime = body.period === "lifetime";
    const months = lifetime ? 0 : int(body.period, 1, 12, "Срок");
    if (!lifetime && !PERIODS.includes(months)) fail(400, "Срок: 1, 3, 6 или 12 месяцев");
    const amount = int(body.amount ?? 0, 0, 1e12, "Сумма");
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 200) : "";
    return db().begin(async (t) => {
      const [taken] = await t`select 1 from clients where lower(login) = ${login}`;
      if (taken) fail(409, "Такой логин уже есть");
      // Срок считается с момента создания; календарные месяцы (31 янв + 1 мес = последний день февраля)
      const [c] = await t`insert into clients (venue, contact, phone, login, pass_hash, lifetime, paid_until)
        values (${venue}, ${contact}, ${phone}, ${login}, ${await bcrypt.hash(password, 10)}, ${lifetime},
          ${lifetime ? null : t`(now() at time zone 'Asia/Tashkent' + ${months + " months"}::interval) at time zone 'Asia/Tashkent'`}) returning id, paid_until`;
      await t`insert into client_payments (client_id, months, amount, comment, prev_until, new_until, admin_id)
        values (${c.id}, ${months}, ${amount}, ${comment || (lifetime ? "Бессрочная лицензия" : "Первая оплата")}, null, ${c.paid_until}, ${admin.id})`;
      return { id: String(c.id) };
    });
  },

  async "admin.clientExtend"({ admin, body }) {
    const id = idOf(body.id);
    const lifetime = body.period === "lifetime";
    const months = lifetime ? 0 : int(body.period, 1, 12, "Срок");
    if (!lifetime && !PERIODS.includes(months)) fail(400, "Срок: 1, 3, 6 или 12 месяцев");
    const amount = int(body.amount ?? 0, 0, 1e12, "Сумма");
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 200) : "";
    return db().begin(async (t) => {
      const [c] = await t`select * from clients where id = ${id} for update`;
      if (!c) fail(404, "Клиент не найден");
      // Новый срок — от более позднего: текущего окончания или текущего момента
      const [n] = lifetime
        ? await t`update clients set lifetime = true, paid_until = null where id = ${id} returning paid_until`
        : await t`update clients set lifetime = false, paid_until =
            (greatest(coalesce(paid_until, now()), now()) at time zone 'Asia/Tashkent' + ${months + " months"}::interval) at time zone 'Asia/Tashkent'
            where id = ${id} returning paid_until`;
      await t`insert into client_payments (client_id, months, amount, comment, prev_until, new_until, admin_id)
        values (${id}, ${months}, ${amount}, ${comment || (lifetime ? "Бессрочная лицензия" : `+${months} мес.`)}, ${c.paid_until}, ${n.paid_until}, ${admin.id})`;
      return { until: ms(n.paid_until) };
    });
  },

  async "admin.clientUpdate"({ body }) {
    const id = idOf(body.id);
    const venue = str(body.venue, 80, "Название площадки");
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 60) : "";
    const phone = str(body.phone, 30, "Телефон", 5);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const password = typeof body.password === "string" && body.password.trim() ? str(body.password, 100, "Пароль", 6) : null;
    const r = await db()`update clients set venue = ${venue}, contact = ${contact}, phone = ${phone}, note = ${note},
      pass_hash = ${password ? await bcrypt.hash(password, 10) : db()`pass_hash`} where id = ${id} returning id`;
    if (!r.length) fail(404, "Клиент не найден");
    return { ok: true };
  },

  async "admin.clientActive"({ body }) {
    const r = await db()`update clients set active = ${!!body.active} where id = ${idOf(body.id)} returning id`;
    if (!r.length) fail(404, "Клиент не найден");
    return { ok: true };
  },

  // Клиент поменял компьютер: отвязать, чтобы активировать на новом
  async "admin.clientUnbind"({ body }) {
    const r = await db()`update clients set device_id = null, device_key_hash = null where id = ${idOf(body.id)} returning id`;
    if (!r.length) fail(404, "Клиент не найден");
    return { ok: true };
  },

  async "admin.leadDone"({ body }) {
    const r = await db()`update leads set done = ${!!body.done} where id = ${idOf(body.id)} returning id`;
    if (!r.length) fail(404, "Заявка не найдена");
    return { ok: true };
  },

  /* ---------- Заявка с сайта (форма «Оставьте телефон») ---------- */
  async "lead.create"({ req, body }) {
    if (body.website) return { ok: true }; // скрытое поле-ловушка для спам-ботов
    const name = str(body.name, 60, "Имя", 2);
    const phone = str(body.phone, 30, "Телефон", 7);
    if (!/^[+\d\s()-]{7,30}$/.test(phone) || (phone.match(/\d/g) || []).length < 7) fail(400, "Проверьте номер телефона");
    const venue = typeof body.venue === "string" ? body.venue.trim().slice(0, 80) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 300) : "";
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    const ipHash = sha("lead:" + ip);
    const [{ n }] = await db()`select count(*)::int as n from leads where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'`;
    if (n >= 5) fail(429, "Слишком много заявок. Попробуйте позже или позвоните нам");
    await db()`insert into leads (name, phone, venue, message, ip_hash) values (${name}, ${phone}, ${venue}, ${message}, ${ipHash})`;
    return { ok: true };
  },

  /* ---------- Для программы клиента ---------- */
  async "license.activate"({ body }) {
    const login = loginOf(body.login);
    const password = str(body.password, 100, "Пароль");
    const deviceId = str(body.deviceId, 80, "Устройство", 8);
    let c = null;
    const ok = await guardAttempts("client:" + login, async () => {
      [c] = await db()`select * from clients where lower(login) = ${login}`;
      return !!c && (await bcrypt.compare(password, c.pass_hash));
    });
    if (!ok) fail(401, "Неверный логин или пароль");
    if (!c.active) fail(403, "Доступ отключён. Обратитесь в PlayPos");
    if (c.device_id && c.device_id !== deviceId) fail(409, "Этот логин уже активирован на другом компьютере. Обратитесь в PlayPos");
    const deviceKey = crypto.randomBytes(32).toString("base64url");
    const [u] = await db()`update clients set device_id = ${deviceId}, device_key_hash = ${sha(deviceKey)},
      activated_at = coalesce(activated_at, now()), last_seen_at = now(), app_version = ${String(body.appVersion || "").slice(0, 20)}
      where id = ${c.id} returning *`;
    return { ...(await issueLicense(u)), deviceKey };
  },

  async "license.refresh"({ body }) {
    const id = idOf(body.clientId);
    const deviceId = str(body.deviceId, 80, "Устройство", 8);
    const deviceKey = str(body.deviceKey, 100, "Ключ устройства", 8);
    const [c] = await db()`update clients set last_seen_at = now(), app_version = ${String(body.appVersion || "").slice(0, 20)}
      where id = ${id} and device_id = ${deviceId} and device_key_hash = ${sha(deviceKey)} returning *`;
    if (!c) fail(403, "Программа отвязана от этого компьютера. Обратитесь в PlayPos");
    return issueLicense(c); // отключённый клиент получает лицензию с active: false
  },
};

const PUBLIC = new Set(["admin.info", "admin.setup", "admin.login", "admin.logout", "license.activate", "license.refresh", "lead.create"]);

export const isPlatformOp = (op) => op.startsWith("admin.") || op.startsWith("license.") || op.startsWith("lead.");

export async function runPlatform(op, ctx) {
  if (process.env.PLAYPOS_DESKTOP === "1") fail(404, "Неизвестная операция"); // на компьютере клиента панели нет
  const fn = OPS[op];
  if (!fn) fail(404, "Неизвестная операция");
  const admin = PUBLIC.has(op) ? null : await currentAdmin(ctx.req);
  if (!PUBLIC.has(op) && !admin) fail(401, "Войдите в админ-панель");
  return fn({ ...ctx, admin });
}
