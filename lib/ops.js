// Операции PlayPos. Каждая операция: проверка сессии и прав на сервере → транзакция → результат.
// Площадка (tenant) берётся только из серверной сессии, никогда из запроса клиента.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, fail } from "./db.js";

const DAY = 86400000;
const SESSION_HOURS = 14;
export const PERM_KEYS = ["sell", "extend", "pay", "finish", "print", "shift", "reports", "expenses", "refunds", "tariffs", "staff", "settings"];
const ROLE_PERMS = {
  admin: ["sell", "extend", "pay", "finish", "print", "shift", "reports", "expenses", "refunds", "tariffs"],
  cashier: ["sell", "extend", "pay", "finish", "print", "shift"],
};
const EXPENSE_CATEGORIES = ["Хозтовары", "Аренда", "Зарплата", "Ремонт", "Реклама", "Прочее"];
const DEFAULT_TARIFFS = [
  ["10 минут", 10, 10000, "both"], ["20 минут", 20, 18000, "both"], ["30 минут", 30, 25000, "both"],
  ["40 минут", 40, 32000, "both"], ["1 час", 60, 40000, "both"], ["2 часа", 120, 70000, "base"], ["Безлимит на день", 600, 120000, "base"],
];

// Доплата за просрочку, сум за минуту: из настроек, иначе цена поминутного тарифа, иначе 0 (не начислять)
async function overRate(t, u) {
  const [tn] = await t`select settings from tenants where id = ${u.tenant_id}`;
  const own = tn && tn.settings && tn.settings.overRate;
  if (Number.isInteger(own) && own >= 0) return own;
  const [pm] = await t`select min(price) as p from tariffs where tenant_id = ${u.tenant_id} and per_minute and not archived`;
  return pm && pm.p != null ? Number(pm.p) : 0;
}

/* ---------- Проверка входных данных ---------- */
export const str = (v, max, name, min = 1) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) fail(400, `Проверьте поле «${name}»`);
  return s;
};
export const int = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `Проверьте поле «${name}»`);
  return n;
};
export const oneOf = (v, list, name) => { if (!list.includes(v)) fail(400, `Проверьте поле «${name}»`); return v; };
export const idOf = (v) => int(Number(v), 1, Number.MAX_SAFE_INTEGER, "id");
export const money = (n) => Number(n).toLocaleString("ru-RU").replace(/ /g, " ") + " сум";
const permsFrom = (role, input) => {
  const base = role === "owner" ? PERM_KEYS : null;
  return Object.fromEntries(PERM_KEYS.map((k) => [k, base ? true : !!(input ? input[k] : ROLE_PERMS[role].includes(k))]));
};
export const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ---------- Сессии ---------- */
export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const DESKTOP = process.env.PLAYPOS_DESKTOP === "1";
// Запрос пришёл с этого же компьютера (для первой установки в настольном приложении)
const isLoopback = (req) => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket?.remoteAddress || "");
export function cookieHeader(req, name, token, maxAge) {
  // Secure — только когда сайт открыт по https (Vercel); по локальной сети касса работает по http
  const https = req.headers["x-forwarded-proto"] === "https" || !!req.socket?.encrypted;
  const secure = https ? "; Secure" : "";
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
const sessionCookie = (req, token, maxAge) => cookieHeader(req, "pp_session", token, maxAge);
async function currentUser(req) {
  const token = readCookie(req, "pp_session");
  if (!token) return null;
  const [u] = await db()`
    select u.id, u.tenant_id, u.name, u.role, u.perms from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha(token)} and s.expires_at > now() and u.active`;
  return u || null;
}
async function startSession(t, req, res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await t`insert into sessions (token_hash, user_id, tenant_id, expires_at)
          values (${sha(token)}, ${user.id}, ${user.tenant_id}, now() + ${SESSION_HOURS + " hours"}::interval)`;
  res.setHeader("Set-Cookie", sessionCookie(req, token, SESSION_HOURS * 3600));
}
// Лицензия настольной программы (задаётся ядром desktop/core.js). На Vercel проверки нет.
const license = () => (DESKTOP ? (globalThis.PLAYPOS_LICENSE ? globalThis.PLAYPOS_LICENSE.status() : { ok: false, activated: false, reason: "Программа не активирована" }) : null);
function needLicense() {
  const l = license();
  if (l && !l.ok) fail(402, l.reason);
}
const can = (u, p) => u.role === "owner" || u.perms?.[p] === true;
const need = (u, p) => { if (!can(u, p)) fail(403, "Нет права на это действие"); };
const log = (t, u, action, detail = "") => t`insert into audit_log (tenant_id, user_id, action, detail) values (${u.tenant_id}, ${u.id}, ${action}, ${detail})`;
// Блокировка строки площадки: операции одной площадки идут по очереди (номера, деньги)
const lockTenant = (t, u) => t`select 1 from tenants where id = ${u.tenant_id} for update`;
const nextNo = async (t, u) => (await t`update tenants set seq = seq + 1 where id = ${u.tenant_id} returning seq`)[0].seq;
async function myOpenShift(t, u) {
  const [s] = await t`select id from shifts where tenant_id = ${u.tenant_id} and user_id = ${u.id} and closed_at is null`;
  if (!s) fail(409, "Сначала откройте смену");
  return s.id;
}

/* ---------- Состояние для экрана ---------- */
async function state(u) {
  const sql = db();
  const tid = u.tenant_id;
  const since = new Date(Date.now() - 8 * DAY);
  const [tenant] = await sql`select name, settings from tenants where id = ${tid}`;
  const [tariffs, staff, visits, shifts, refunds, expenses] = await Promise.all([
    sql`select id, name, minutes, price, use, archived, per_minute from tariffs where tenant_id = ${tid} order by minutes, id`,
    sql`select id, name, login, role, active, perms from users where tenant_id = ${tid} order by id`,
    sql`select * from visits where tenant_id = ${tid} and (exit_at is null or start_at >= ${since}) order by start_at`,
    sql`select * from shifts where tenant_id = ${tid} and (closed_at is null or opened_at >= ${since}) order by opened_at`,
    sql`select * from refunds where tenant_id = ${tid} and at >= ${since}`,
    sql`select * from expenses where tenant_id = ${tid} and at >= ${since}`,
  ]);
  const vids = visits.map((v) => v.id);
  const [exts, bills] = vids.length ? await Promise.all([
    sql`select * from visit_ext where tenant_id = ${tid} and visit_id in ${sql(vids)} order by at`,
    sql`select * from bills where tenant_id = ${tid} and visit_id in ${sql(vids)} order by id`,
  ]) : [[], []];
  const bids = bills.map((b) => b.id);
  const items = bids.length ? await sql`select * from bill_items where tenant_id = ${tid} and bill_id in ${sql(bids)} order by id` : [];
  const logRows = can(u, "reports") ? await sql`select at, user_id, action, detail from audit_log where tenant_id = ${tid} order by at desc limit 100` : [];
  const ms = (d) => (d ? new Date(d).getTime() : null);
  const sid = (x) => (x == null ? null : String(x));
  return {
    serverNow: Date.now(),
    meId: String(u.id),
    license: license(),
    settings: { venue: tenant.name, warn: 5, ...tenant.settings },
    tariffs: tariffs.map((t) => ({ id: sid(t.id), name: t.name, minutes: t.minutes, price: t.price, use: t.use, archived: t.archived, perMinute: t.per_minute })),
    staff: staff.map((s) => ({ id: sid(s.id), name: s.name, login: s.login, role: s.role, active: s.active, perms: s.perms })),
    visits: visits.map((v) => ({
      id: sid(v.id), no: v.no, child: v.child, tariffName: v.tariff_name, minutes: v.minutes, start: ms(v.start_at), end: ms(v.end_at), rate: v.rate,
      exitAt: ms(v.exit_at), staffId: sid(v.user_id),
      ext: exts.filter((e) => e.visit_id === v.id).map((e) => ({ at: ms(e.at), minutes: e.minutes, price: e.price, from: e.from_mode, by: sid(e.user_id) })),
    })),
    bills: bills.map((b) => ({
      id: sid(b.id), no: b.no, visitId: sid(b.visit_id), status: b.status, method: b.method, paidAt: ms(b.paid_at), paidBy: sid(b.paid_by),
      shiftId: sid(b.shift_id), createdAt: ms(b.created_at),
      items: items.filter((i) => i.bill_id === b.id).map((i) => ({ title: i.title, amount: i.amount, kind: i.kind, minutes: i.minutes })),
    })),
    shifts: shifts.map((s, i) => ({ id: sid(s.id), no: s.no, staffId: sid(s.user_id), openedAt: ms(s.opened_at), closedAt: ms(s.closed_at), openingCash: s.opening_cash, countedCash: s.counted_cash })),
    refunds: refunds.map((r) => ({ id: sid(r.id), billId: sid(r.bill_id), amount: r.amount, reason: r.reason, at: ms(r.at), staffId: sid(r.user_id), shiftId: sid(r.shift_id), method: r.method })),
    expenses: expenses.map((e) => ({ id: sid(e.id), at: ms(e.at), category: e.category, amount: e.amount, comment: e.comment, staffId: sid(e.user_id), source: e.source, shiftId: sid(e.shift_id) })),
    log: logRows.map((l) => ({ at: ms(l.at), staffId: sid(l.user_id), action: l.action, detail: l.detail })),
  };
}

async function shiftExpected(t, shiftId) {
  const [r] = await t`
    select s.opening_cash
      + coalesce((select sum(i.amount) from bills b join bill_items i on i.bill_id = b.id where b.shift_id = s.id and b.status = 'paid' and b.method = 'cash'), 0)
      - coalesce((select sum(amount) from refunds where shift_id = s.id and method = 'cash'), 0)
      - coalesce((select sum(amount) from expenses where shift_id = s.id and source = 'cash'), 0) as expected
    from shifts s where s.id = ${shiftId}`;
  return Number(r.expected);
}

async function payOpenBills(t, u, billIds, method) {
  const shiftId = await myOpenShift(t, u);
  const paid = await t`
    update bills set status = 'paid', method = ${method}, paid_at = now(), paid_by = ${u.id}, shift_id = ${shiftId}
    where tenant_id = ${u.tenant_id} and id in ${t(billIds)} and status = 'open' returning id, no`;
  if (!paid.length) fail(409, "Счёт уже оплачен");
  for (const b of paid) {
    const [{ total }] = await t`select coalesce(sum(amount), 0) as total from bill_items where bill_id = ${b.id}`;
    await log(t, u, "Оплата", `Счёт №${b.no}: ${money(total)}, ${method === "cash" ? "наличные" : "карта"}`);
  }
  return paid.map((b) => String(b.id));
}

/* ---------- Операции ---------- */
const OPS = {
  // Нужна ли первая установка — чтобы касса сама открыла страницу установки
  async info() {
    const [{ n }] = await db()`select count(*)::int as n from tenants`;
    return { desktop: DESKTOP, needsSetup: n === 0, license: license() };
  },

  // Активация программы логином и паролем из админ-панели PlayPos (только на компьютере кассы)
  async "device.activate"({ req, body }) {
    if (!DESKTOP || !globalThis.PLAYPOS_LICENSE) fail(404, "Неизвестная операция");
    if (!isLoopback(req)) fail(403, "Активация возможна только на компьютере кассы");
    const login = str(body.login, 30, "Логин"), password = str(body.password, 100, "Пароль");
    return { license: await globalThis.PLAYPOS_LICENSE.activate(login, password) };
  },

  async setup({ req, res, body }) {
    if (DESKTOP) {
      // В настольном приложении код не нужен, но установка возможна только с самого компьютера кассы
      if (!isLoopback(req)) fail(403, "Установка возможна только на компьютере кассы");
      if (!license().activated) fail(402, "Сначала активируйте программу");
    } else {
      const token = process.env.SETUP_TOKEN || "";
      if (token.length < 8 || body.token !== token) fail(403, "Неверный код установки");
    }
    const venue = str(body.venue, 60, "Название площадки");
    const name = str(body.name, 40, "Имя владельца");
    const login = str(body.login, 30, "Логин", 2).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(login)) fail(400, "Логин: латинские буквы, цифры, точка, дефис");
    const password = str(body.password, 100, "Пароль", 6);
    return db().begin(async (t) => {
      await t`select pg_advisory_xact_lock(7710002)`;
      const [{ n }] = await t`select count(*)::int as n from tenants`;
      if (n > 0) fail(409, "Площадка уже создана — войдите под владельцем");
      const [tenant] = await t`insert into tenants (name, settings) values (${venue}, ${t.json({ warn: 5, pmSeeded: true })}) returning id`;
      const [user] = await t`insert into users (tenant_id, name, login, pass_hash, role, perms)
        values (${tenant.id}, ${name}, ${login}, ${await bcrypt.hash(password, 10)}, 'owner', ${t.json(permsFrom("owner"))}) returning id, tenant_id`;
      for (const [tn, m, p, use] of DEFAULT_TARIFFS) await t`insert into tariffs (tenant_id, name, minutes, price, use) values (${tenant.id}, ${tn}, ${m}, ${p}, ${use})`;
      await t`insert into tariffs (tenant_id, name, minutes, price, use, per_minute) values (${tenant.id}, 'По факту (поминутно)', 1, 1000, 'base', true)`;
      await t`insert into audit_log (tenant_id, user_id, action, detail) values (${tenant.id}, ${user.id}, 'Установка', ${venue})`;
      await startSession(t, req, res, user);
      return { ok: true };
    });
  },

  async login({ req, res, body }) {
    const login = str(body.login, 30, "Логин").toLowerCase();
    const password = str(body.password, 100, "Пароль");
    const key = "login:" + login;
    const sql = db();
    const [att] = await sql`select fails, locked_until from login_attempts where key = ${key}`;
    if (att?.locked_until && new Date(att.locked_until) > new Date()) fail(429, "Слишком много попыток. Подождите 10 минут");
    const [u] = await sql`select id, tenant_id, pass_hash, active from users where lower(login) = ${login}`;
    const ok = u && u.active && (await bcrypt.compare(password, u.pass_hash));
    if (!ok) {
      await sql`insert into login_attempts (key, fails) values (${key}, 1)
        on conflict (key) do update set fails = case when login_attempts.fails + 1 >= 5 then 0 else login_attempts.fails + 1 end,
          locked_until = case when login_attempts.fails + 1 >= 5 then now() + interval '10 minutes' else null end`;
      fail(401, u && !u.active ? "Сотрудник заблокирован" : "Неверный логин или пароль");
    }
    await sql`delete from login_attempts where key = ${key}`;
    await sql.begin(async (t) => {
      await t`delete from sessions where expires_at < now()`;
      await startSession(t, req, res, u);
      await log(t, { id: u.id, tenant_id: u.tenant_id }, "Вход");
    });
    return { ok: true };
  },

  async logout({ req, res, user }) {
    const token = readCookie(req, "pp_session");
    if (token) await db()`delete from sessions where token_hash = ${sha(token)}`;
    if (user) await log(db(), user, "Выход");
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
    return { ok: true };
  },

  async state({ user }) { return state(user); },

  async "visit.create"({ user: u, body }) {
    need(u, "sell");
    needLicense();
    const child = str(body.child, 60, "Имя ребёнка");
    const tariffId = idOf(body.tariffId);
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const [tr] = await t`select * from tariffs where id = ${tariffId} and tenant_id = ${u.tenant_id} and not archived and use in ('both', 'base')`;
      if (!tr) fail(404, "Тариф не найден");
      if (tr.per_minute) {
        // Поминутно: счёт создаётся при выходе, когда известно время
        const [v] = await t`insert into visits (tenant_id, no, child, tariff_name, minutes, start_at, end_at, user_id, rate)
          values (${u.tenant_id}, ${await nextNo(t, u)}, ${child}, ${tr.name}, 0, now(), now(), ${u.id}, ${tr.price}) returning id`;
        await log(t, u, "Новое посещение", `${child}, ${tr.name}, ${money(tr.price)}/мин`);
        return { visitId: String(v.id), billId: null };
      }
      const [v] = await t`insert into visits (tenant_id, no, child, tariff_name, minutes, start_at, end_at, user_id)
        values (${u.tenant_id}, ${await nextNo(t, u)}, ${child}, ${tr.name}, ${tr.minutes}, now(), now() + ${tr.minutes + " minutes"}::interval, ${u.id}) returning id`;
      const [b] = await t`insert into bills (tenant_id, no, visit_id) values (${u.tenant_id}, ${await nextNo(t, u)}, ${v.id}) returning id`;
      await t`insert into bill_items (tenant_id, bill_id, title, amount, kind, minutes) values (${u.tenant_id}, ${b.id}, ${tr.name}, ${tr.price}, 'base', ${tr.minutes})`;
      await log(t, u, "Новое посещение", `${child}, ${tr.name}, ${money(tr.price)}`);
      return { visitId: String(v.id), billId: String(b.id) };
    });
  },

  async "visit.extend"({ user: u, body }) {
    need(u, "extend");
    needLicense();
    const visitId = idOf(body.visitId), tariffId = idOf(body.tariffId);
    const from = oneOf(body.from, ["prev", "now"], "Отсчёт продления");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const [v] = await t`select * from visits where id = ${visitId} and tenant_id = ${u.tenant_id} and exit_at is null for update`;
      if (!v) fail(404, "Посещение не найдено или уже завершено");
      if (v.rate != null) fail(409, "Поминутный тариф продлевать не нужно — сумма считается при выходе");
      const [tr] = await t`select * from tariffs where id = ${tariffId} and tenant_id = ${u.tenant_id} and not archived and use in ('both', 'ext')`;
      if (!tr) fail(404, "Тариф не найден");
      const [nv] = await t`update visits set end_at = (case when ${from} = 'now' then greatest(now(), end_at) else end_at end) + ${tr.minutes + " minutes"}::interval
        where id = ${v.id} returning end_at`;
      await t`insert into visit_ext (tenant_id, visit_id, minutes, price, from_mode, user_id) values (${u.tenant_id}, ${v.id}, ${tr.minutes}, ${tr.price}, ${from}, ${u.id})`;
      let [b] = await t`select id from bills where visit_id = ${v.id} and tenant_id = ${u.tenant_id} and status = 'open' order by id limit 1 for update`;
      if (!b) [b] = await t`insert into bills (tenant_id, no, visit_id) values (${u.tenant_id}, ${await nextNo(t, u)}, ${v.id}) returning id`;
      await t`insert into bill_items (tenant_id, bill_id, title, amount, kind, minutes) values (${u.tenant_id}, ${b.id}, ${"Продление: " + tr.name}, ${tr.price}, 'ext', ${tr.minutes})`;
      await log(t, u, "Продление", `${v.child}: +${tr.minutes} мин, ${money(tr.price)}`);
      return { billId: String(b.id), end: new Date(nv.end_at).getTime() };
    });
  },

  // Оплата открытых счетов (на входе или из списка счетов)
  async "bills.pay"({ user: u, body }) {
    need(u, "pay");
    const method = oneOf(body.method, ["cash", "card"], "Способ оплаты");
    const ids = Array.isArray(body.billIds) ? body.billIds.slice(0, 20).map(idOf) : fail(400, "Нет счетов");
    return db().begin(async (t) => { await lockTenant(t, u); return { paid: await payOpenBills(t, u, ids, method) }; });
  },

  // Выход: оплатить все открытые счета посещения (если есть) и/или отметить выход — одной транзакцией
  async "visit.checkout"({ user: u, body }) {
    const visitId = idOf(body.visitId);
    const exit = !!body.exit;
    if (exit) need(u, "finish");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const [v] = await t`select * from visits where id = ${visitId} and tenant_id = ${u.tenant_id} for update`;
      if (!v) fail(404, "Посещение не найдено");
      if (exit && v.exit_at) fail(409, "Выход уже отмечен");
      if (v.rate != null && !v.exit_at) {
        if (!exit) fail(400, "Поминутный тариф оплачивается при выходе");
        // Каждая начатая минута, по времени сервера
        const [{ mins }] = await t`select greatest(1, ceil(extract(epoch from (now() - ${v.start_at}::timestamptz)) / 60))::int as mins`;
        const [b] = await t`insert into bills (tenant_id, no, visit_id) values (${u.tenant_id}, ${await nextNo(t, u)}, ${v.id}) returning id`;
        await t`insert into bill_items (tenant_id, bill_id, title, amount, kind, minutes)
          values (${u.tenant_id}, ${b.id}, ${`${v.tariff_name}: ${mins} мин × ${money(v.rate)}`}, ${mins * Number(v.rate)}, 'base', ${mins})`;
        await t`update visits set minutes = ${mins}, end_at = now() where id = ${v.id}`;
      }
      // Время вышло: доплата за каждую начатую минуту просрочки добавляется в счёт сама, как продление
      if (v.rate == null && !v.exit_at) {
        const [{ mins }] = await t`select ceil(extract(epoch from (now() - ${v.end_at}::timestamptz)) / 60)::int as mins`;
        const rate = mins > 0 ? await overRate(t, u) : 0;
        if (mins > 0 && rate > 0) {
          const price = mins * rate;
          await t`update visits set end_at = end_at + ${mins + " minutes"}::interval where id = ${v.id}`;
          await t`insert into visit_ext (tenant_id, visit_id, minutes, price, from_mode, user_id) values (${u.tenant_id}, ${v.id}, ${mins}, ${price}, 'prev', ${u.id})`;
          let [b] = await t`select id from bills where visit_id = ${v.id} and tenant_id = ${u.tenant_id} and status = 'open' order by id limit 1 for update`;
          if (!b) [b] = await t`insert into bills (tenant_id, no, visit_id) values (${u.tenant_id}, ${await nextNo(t, u)}, ${v.id}) returning id`;
          await t`insert into bill_items (tenant_id, bill_id, title, amount, kind, minutes)
            values (${u.tenant_id}, ${b.id}, ${`Просрочка: ${mins} мин × ${money(rate)}`}, ${price}, 'ext', ${mins})`;
          await log(t, u, "Просрочка", `${v.child}: +${mins} мин, ${money(price)}`);
        }
      }
      const open = await t`select id from bills where visit_id = ${v.id} and status = 'open'`;
      let paid = [];
      if (open.length) {
        need(u, "pay");
        const method = oneOf(body.method, ["cash", "card"], "Способ оплаты");
        paid = await payOpenBills(t, u, open.map((b) => b.id), method);
      }
      if (exit) {
        await t`update visits set exit_at = now() where id = ${v.id}`;
        await log(t, u, "Завершение", `${v.child}`);
      }
      return { paid };
    });
  },

  async "refund.create"({ user: u, body }) {
    need(u, "refunds");
    const billId = idOf(body.billId), amount = int(body.amount, 1, 1e12, "Сумма возврата");
    const reason = str(body.reason, 120, "Причина");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const [b] = await t`select * from bills where id = ${billId} and tenant_id = ${u.tenant_id} and status = 'paid' for update`;
      if (!b) fail(404, "Оплаченный счёт не найден");
      const [{ total }] = await t`select coalesce(sum(amount), 0) as total from bill_items where bill_id = ${b.id}`;
      const [{ back }] = await t`select coalesce(sum(amount), 0) as back from refunds where bill_id = ${b.id}`;
      if (amount > Number(total) - Number(back)) fail(400, "Сумма больше, чем можно вернуть");
      const shiftId = await myOpenShift(t, u);
      await t`insert into refunds (tenant_id, bill_id, amount, reason, user_id, shift_id, method) values (${u.tenant_id}, ${b.id}, ${amount}, ${reason}, ${u.id}, ${shiftId}, ${b.method})`;
      await log(t, u, "Возврат", `Счёт №${b.no}: ${money(amount)} — ${reason}`);
      return { ok: true };
    });
  },

  async "shift.open"({ user: u, body }) {
    need(u, "shift");
    needLicense();
    const cash = int(body.openingCash, 0, 1e12, "Начальный остаток");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const [open] = await t`select id from shifts where tenant_id = ${u.tenant_id} and user_id = ${u.id} and closed_at is null`;
      if (open) fail(409, "Смена уже открыта");
      const [{ no }] = await t`select coalesce(max(no), 0) + 1 as no from shifts where tenant_id = ${u.tenant_id}`;
      await t`insert into shifts (tenant_id, no, user_id, opening_cash) values (${u.tenant_id}, ${no}, ${u.id}, ${cash})`;
      await log(t, u, "Открытие смены", money(cash));
      return { ok: true };
    });
  },

  async "shift.close"({ user: u, body }) {
    need(u, "shift");
    const counted = int(body.countedCash, 0, 1e12, "Фактические наличные");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const shiftId = await myOpenShift(t, u);
      const expected = await shiftExpected(t, shiftId);
      const [s] = await t`update shifts set closed_at = now(), counted_cash = ${counted} where id = ${shiftId} returning no`;
      await log(t, u, "Закрытие смены", `№${s.no}, расхождение ${money(counted - expected)}`);
      return { diff: counted - expected };
    });
  },

  async "expense.create"({ user: u, body }) {
    need(u, "expenses");
    const category = oneOf(body.category, EXPENSE_CATEGORIES, "Категория");
    const amount = int(body.amount, 1, 1e12, "Сумма");
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 120) : "";
    const source = oneOf(body.source, ["cash", "other"], "Источник");
    return db().begin(async (t) => {
      await lockTenant(t, u);
      const shiftId = source === "cash" ? await myOpenShift(t, u) : null;
      await t`insert into expenses (tenant_id, category, amount, comment, user_id, source, shift_id) values (${u.tenant_id}, ${category}, ${amount}, ${comment}, ${u.id}, ${source}, ${shiftId})`;
      await log(t, u, "Расход", `${category}: ${money(amount)}`);
      return { ok: true };
    });
  },

  async "tariff.save"({ user: u, body }) {
    need(u, "tariffs");
    const perMinute = !!body.perMinute; // поминутный: price — за 1 минуту, только для входа
    const name = str(body.name, 40, "Название"), price = int(body.price, 0, 1e10, "Цена");
    const minutes = perMinute ? 1 : int(body.minutes, 1, 1440, "Минуты");
    const use = perMinute ? "base" : oneOf(body.use, ["both", "base", "ext"], "Где использовать");
    return db().begin(async (t) => {
      if (body.id) {
        // Тип тарифа (фиксированный / поминутный) после создания не меняется — иначе пропадёт привычный тариф
        const r = await t`update tariffs set name = ${name}, minutes = ${minutes}, price = ${price}, use = ${use}
          where id = ${idOf(body.id)} and tenant_id = ${u.tenant_id} and per_minute = ${perMinute} returning id`;
        if (!r.length) fail(404, "Тариф не найден");
      } else {
        await t`insert into tariffs (tenant_id, name, minutes, price, use, per_minute) values (${u.tenant_id}, ${name}, ${minutes}, ${price}, ${use}, ${perMinute})`;
      }
      await log(t, u, body.id ? "Тариф изменён" : "Тариф создан", perMinute ? `${name}: ${money(price)}/мин` : `${name}: ${minutes} мин, ${money(price)}`);
      return { ok: true };
    });
  },

  async "tariff.archive"({ user: u, body }) {
    need(u, "tariffs");
    const archived = !!body.archived;
    const r = await db()`update tariffs set archived = ${archived} where id = ${idOf(body.id)} and tenant_id = ${u.tenant_id} returning name`;
    if (!r.length) fail(404, "Тариф не найден");
    await log(db(), u, archived ? "Тариф в архиве" : "Тариф возвращён", r[0].name);
    return { ok: true };
  },

  async "tariff.addMany"({ user: u, body }) {
    need(u, "tariffs");
    const list = Array.isArray(body.items) ? body.items.slice(0, 10) : fail(400, "Нет тарифов");
    return db().begin(async (t) => {
      for (const it of list) {
        const name = str(it.name, 40, "Название"), minutes = int(it.minutes, 1, 1440, "Минуты"), price = int(it.price, 0, 1e10, "Цена");
        const use = oneOf(it.use || "both", ["both", "base", "ext"], "Где использовать");
        const [dup] = await t`select 1 from tariffs where tenant_id = ${u.tenant_id} and not archived and name = ${name} and minutes = ${minutes}`;
        if (!dup) await t`insert into tariffs (tenant_id, name, minutes, price, use) values (${u.tenant_id}, ${name}, ${minutes}, ${price}, ${use})`;
      }
      await log(t, u, "Шаблон тарифов", String(body.title || "").slice(0, 60));
      return { ok: true };
    });
  },

  async "staff.save"({ user: u, body }) {
    need(u, "staff");
    const name = str(body.name, 40, "Имя");
    const login = str(body.login, 30, "Логин", 2).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(login)) fail(400, "Логин: латинские буквы, цифры, точка, дефис");
    const password = typeof body.password === "string" && body.password.trim() ? str(body.password, 100, "PIN / пароль", 4) : null;
    return db().begin(async (t) => {
      const [taken] = await t`select id from users where lower(login) = ${login} and id <> ${body.id ? idOf(body.id) : 0}`;
      if (taken) fail(409, "Такой логин уже есть");
      if (!body.id) {
        const role = oneOf(body.role, ["admin", "cashier"], "Роль");
        if (!password) fail(400, "Укажите PIN / пароль");
        await t`insert into users (tenant_id, name, login, pass_hash, role, perms)
          values (${u.tenant_id}, ${name}, ${login}, ${await bcrypt.hash(password, 10)}, ${role}, ${t.json(permsFrom(role, body.perms))})`;
        await log(t, u, "Сотрудник создан", name);
        return { ok: true };
      }
      const [target] = await t`select * from users where id = ${idOf(body.id)} and tenant_id = ${u.tenant_id} for update`;
      if (!target) fail(404, "Сотрудник не найден");
      if (target.role === "owner" && u.role !== "owner") fail(403, "Владельца может менять только владелец");
      const role = target.role === "owner" ? "owner" : oneOf(body.role, ["admin", "cashier"], "Роль");
      const hash = password ? await bcrypt.hash(password, 10) : target.pass_hash;
      await t`update users set name = ${name}, login = ${login}, role = ${role}, perms = ${t.json(permsFrom(role, body.perms))}, pass_hash = ${hash} where id = ${target.id}`;
      if (password && target.id !== u.id) await t`delete from sessions where user_id = ${target.id}`;
      await log(t, u, "Права изменены", name);
      return { ok: true };
    });
  },

  async "staff.active"({ user: u, body }) {
    need(u, "staff");
    const id = idOf(body.id), active = !!body.active;
    if (id === u.id) fail(400, "Нельзя заблокировать себя");
    return db().begin(async (t) => {
      const r = await t`update users set active = ${active} where id = ${id} and tenant_id = ${u.tenant_id} and role <> 'owner' returning name`;
      if (!r.length) fail(404, "Сотрудник не найден");
      if (!active) await t`delete from sessions where user_id = ${id}`; // блокировка закрывает уже открытые сессии
      await log(t, u, active ? "Сотрудник разблокирован" : "Сотрудник заблокирован", r[0].name);
      return { ok: true };
    });
  },

  async "settings.save"({ user: u, body }) {
    need(u, "settings");
    const venue = str(body.venue, 60, "Название");
    const warn = int(body.warn, 1, 30, "Предупреждать за");
    const patch = { warn };
    // Пустое поле — доплата как в поминутном тарифе; 0 — не начислять
    if (body.overRate === null || body.overRate === "") patch.overRate = null;
    else if (body.overRate !== undefined) patch.overRate = int(body.overRate, 0, 1e8, "Доплата за просрочку");
    await db()`update tenants set name = ${venue}, settings = settings || ${db().json(patch)} where id = ${u.tenant_id}`;
    await log(db(), u, "Настройки", "изменены");
    return { ok: true };
  },
};

const PUBLIC = new Set(["login", "setup", "logout", "info", "device.activate"]);

export async function run(op, ctx) {
  const fn = OPS[op];
  if (!fn) fail(404, "Неизвестная операция");
  const user = await currentUser(ctx.req);
  if (!user && !PUBLIC.has(op)) fail(401, "Войдите в систему");
  return fn({ ...ctx, user });
}
