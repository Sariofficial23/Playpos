// Тесты API на реальной PostgreSQL: TEST_DATABASE_URL=postgres://... npm test
// База очищается перед запуском — не указывайте рабочую базу!
import test from "node:test";
import assert from "node:assert/strict";

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "TEST_DATABASE_URL не задан";
process.env.DATABASE_URL = URL_ || "";
process.env.SETUP_TOKEN = "test-setup-token";

// Вызов функции API так, как её вызывает Vercel
async function call(handler, cookie, body) {
  const req = { method: "POST", headers: { "x-playpos": "1", host: "localhost", cookie: cookie || "" }, body };
  let status = 0, setCookie = null, text = "";
  const res = { set statusCode(v) { status = v; }, setHeader(k, v) { if (k === "Set-Cookie") setCookie = v; }, end(t) { text = t; } };
  await handler(req, res);
  const c = setCookie ? setCookie.split(";")[0] : cookie;
  return { status, data: JSON.parse(text), cookie: c };
}

test("PlayPos API", { skip }, async (t) => {
  const { db } = await import("../lib/db.js");
  const { default: handler } = await import("../api/rpc.js");
  const sql = db();
  await sql.unsafe("drop schema public cascade; create schema public;");

  const setup = await call(handler, null, { op: "setup", token: "test-setup-token", venue: "A", name: "Owner", login: "owner", password: "secret123" });
  assert.equal(setup.status, 200);
  const owner = setup.cookie;

  await t.test("повторная установка запрещена", async () => {
    const r = await call(handler, null, { op: "setup", token: "test-setup-token", venue: "B", name: "X", login: "other", password: "secret123" });
    assert.equal(r.status, 409);
  });

  const st = (await call(handler, owner, { op: "state" })).data;
  const tariff30 = st.tariffs.find((x) => x.minutes === 30);
  const tariff10 = st.tariffs.find((x) => x.minutes === 10);

  await t.test("кассир без права на тарифы получает отказ на сервере", async () => {
    await call(handler, owner, { op: "staff.save", name: "Cash", login: "cash", password: "1234", role: "cashier" });
    const login = await call(handler, null, { op: "login", login: "cash", password: "1234" });
    assert.equal(login.status, 200);
    const r = await call(handler, login.cookie, { op: "tariff.save", name: "X", minutes: 5, price: 1, use: "both" });
    assert.equal(r.status, 403);
  });

  await t.test("оплата: только при открытой смене, без повторной оплаты; касса сходится", async () => {
    const v = (await call(handler, owner, { op: "visit.create", child: "Юсуф", tariffId: tariff30.id })).data;
    assert.equal((await call(handler, owner, { op: "bills.pay", billIds: [v.billId], method: "cash" })).status, 409);
    await call(handler, owner, { op: "shift.open", openingCash: 100000 });
    assert.equal((await call(handler, owner, { op: "bills.pay", billIds: [v.billId], method: "cash" })).status, 200);
    assert.equal((await call(handler, owner, { op: "bills.pay", billIds: [v.billId], method: "cash" })).status, 409);
    // продление оплаченного посещения создаёт новый счёт; первоначальный тариф повторно не начисляется
    const ext = (await call(handler, owner, { op: "visit.extend", visitId: v.visitId, tariffId: tariff10.id, from: "prev" })).data;
    assert.notEqual(ext.billId, v.billId);
    const out = await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: true, method: "card" });
    assert.deepEqual(out.data.paid, [ext.billId]);
    await call(handler, owner, { op: "expense.create", category: "Прочее", amount: 5000, comment: "", source: "cash" });
    const close = await call(handler, owner, { op: "shift.close", countedCash: 100000 + tariff30.price - 5000 });
    assert.equal(close.data.diff, 0); // карта не меняет наличный остаток
  });

  await t.test("поминутный тариф: сумма за каждую начатую минуту при выходе, без продления", async () => {
    assert.equal((await call(handler, owner, { op: "tariff.save", name: "VIP", price: 1000, perMinute: true })).status, 200);
    const vip = (await call(handler, owner, { op: "state" })).data.tariffs.find((x) => x.perMinute);
    assert.equal(vip.use, "base");
    const v = (await call(handler, owner, { op: "visit.create", child: "Али", tariffId: vip.id })).data;
    assert.equal(v.billId, null);
    assert.equal((await call(handler, owner, { op: "visit.extend", visitId: v.visitId, tariffId: tariff10.id, from: "prev" })).status, 409);
    assert.equal((await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: false, method: "cash" })).status, 400);
    await sql`update visits set start_at = now() - interval '30 minutes 10 seconds' where id = ${v.visitId}`;
    await call(handler, owner, { op: "shift.open", openingCash: 0 });
    const out = await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: true, method: "cash" });
    assert.equal(out.status, 200);
    const s2 = (await call(handler, owner, { op: "state" })).data;
    const bill = s2.bills.find((b) => b.id === out.data.paid[0]);
    assert.equal(bill.status, "paid");
    assert.equal(bill.items[0].amount, 31 * 1000);
    assert.equal(bill.items[0].minutes, 31);
    assert.ok(s2.visits.find((x) => x.id === v.visitId).exitAt);
  });

  await t.test("просрочка: таймер стоит до «Продолжить», потом доплата за каждую начатую минуту", async () => {
    const s0 = (await call(handler, owner, { op: "state" })).data;
    assert.ok(s0.tariffs.some((x) => x.perMinute && x.name === "По факту (поминутно)")); // поминутный тариф есть сразу
    assert.equal((await call(handler, owner, { op: "settings.save", venue: "A", warn: 5, overRate: 500 })).status, 200);
    const v = (await call(handler, owner, { op: "visit.create", child: "Сара", tariffId: tariff10.id })).data;
    await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: false, method: "cash" }); // оплатили 10 минут
    // время ещё не вышло — «Продолжить» нельзя
    assert.equal((await call(handler, owner, { op: "visit.continue", visitId: v.visitId })).status, 409);
    await sql`update visits set start_at = now() - interval '22 minutes', end_at = now() - interval '11 minutes 30 seconds' where id = ${v.visitId}`;
    // кассир ещё не нажал «Продолжить» — таймер стоит, доплаты нет
    const none = await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: false, method: "cash" });
    assert.deepEqual(none.data.paid, []);
    assert.equal((await call(handler, owner, { op: "visit.continue", visitId: v.visitId })).status, 200);
    assert.equal((await call(handler, owner, { op: "visit.extend", visitId: v.visitId, tariffId: tariff10.id, from: "now" })).status, 409);
    // «Продолжить» нажали 11,5 минут назад — доплата за 12 минут
    await sql`update visits set over_from = now() - interval '11 minutes 30 seconds' where id = ${v.visitId}`;
    const out = await call(handler, owner, { op: "visit.checkout", visitId: v.visitId, exit: true, method: "card" });
    assert.equal(out.status, 200);
    const s2 = (await call(handler, owner, { op: "state" })).data;
    const bill = s2.bills.find((b) => b.id === out.data.paid[0]);
    assert.equal(bill.items[0].amount, 12 * 500);
    assert.equal(bill.method, "card");
    // нельзя превратить фиксированный тариф в поминутный через «Изменить»
    assert.equal((await call(handler, owner, { op: "tariff.save", id: tariff10.id, name: "10 минут", price: 1000, perMinute: true })).status, 404);
    await call(handler, owner, { op: "settings.save", venue: "A", warn: 5, overRate: "" });
  });

  await t.test("скидка только с правом; оплата частями; изменение оплаты; касса смены сходится", async () => {
    const cashier = (await call(handler, null, { op: "login", login: "cash", password: "1234" })).cookie;
    await call(handler, cashier, { op: "shift.open", openingCash: 0 });
    const v = (await call(handler, cashier, { op: "visit.create", child: "Лола", tariffId: tariff30.id })).data;
    // кассир без права «Скидки» скидку дать не может
    assert.equal((await call(handler, cashier, { op: "bills.pay", billIds: [v.billId], method: "cash", discount: 5000 })).status, 403);
    // частями: 10 000 наличными, остальное картой
    assert.equal((await call(handler, cashier, { op: "bills.pay", billIds: [v.billId], method: "mixed", cash: 10000 })).status, 200);
    let b = (await call(handler, owner, { op: "state" })).data.bills.find((x) => x.id === v.billId);
    assert.deepEqual([b.method, b.cash, b.card, b.discount], ["mixed", 10000, tariff30.price - 10000, 0]);
    // кассир без права исправить оплату не может, владелец — может (скидка 5 000, всё наличными)
    assert.equal((await call(handler, cashier, { op: "bill.repay", billId: v.billId, method: "cash" })).status, 403);
    assert.equal((await call(handler, owner, { op: "bill.repay", billId: v.billId, method: "cash", discount: 5000 })).status, 200);
    b = (await call(handler, owner, { op: "state" })).data.bills.find((x) => x.id === v.billId);
    assert.deepEqual([b.method, b.cash, b.card, b.discount], ["cash", tariff30.price - 5000, 0, 5000]);
    assert.equal((await call(handler, owner, { op: "bill.repay", billId: v.billId, method: "cash", discount: tariff30.price + 1 })).status, 400);
    // в кассе смены — ровно принятые наличные
    const close = await call(handler, cashier, { op: "shift.close", countedCash: tariff30.price - 5000 });
    assert.equal(close.data.diff, 0);
    // смена закрыта — изменить оплату уже нельзя
    assert.equal((await call(handler, owner, { op: "bill.repay", billId: v.billId, method: "card" })).status, 409);
  });

  await t.test("площадки изолированы: чужие данные не видны и не меняются", async () => {
    const [tb] = await sql`insert into tenants (name) values ('B') returning id`;
    const { default: bcrypt } = await import("bcryptjs");
    await sql`insert into users (tenant_id, name, login, pass_hash, role, perms) values (${tb.id}, 'OwnerB', 'ownerb', ${await bcrypt.hash("secret123", 4)}, 'owner', '{}')`;
    const b = (await call(handler, null, { op: "login", login: "ownerb", password: "secret123" })).cookie;
    const stateB = (await call(handler, b, { op: "state" })).data;
    assert.equal(stateB.visits.length, 0);
    assert.equal(stateB.tariffs.length, 0);
    const foreignVisit = st.visits[0]?.id || (await call(handler, owner, { op: "state" })).data.visits[0].id;
    assert.equal((await call(handler, b, { op: "visit.extend", visitId: foreignVisit, tariffId: tariff10.id, from: "now" })).status, 404);
    assert.equal((await call(handler, b, { op: "tariff.archive", id: tariff10.id, archived: true })).status, 404);
  });

  await t.test("блокировка закрывает сессию; 5 неверных паролей — пауза", async () => {
    const s = (await call(handler, owner, { op: "state" })).data;
    const cashId = s.staff.find((u) => u.login === "cash").id;
    const c = (await call(handler, null, { op: "login", login: "cash", password: "1234" })).cookie;
    await call(handler, owner, { op: "staff.active", id: cashId, active: false });
    assert.equal((await call(handler, c, { op: "state" })).status, 401);
    for (let i = 0; i < 5; i++) await call(handler, null, { op: "login", login: "owner", password: "bad" });
    assert.equal((await call(handler, null, { op: "login", login: "owner", password: "secret123" })).status, 429);
  });

  await t.test("платформа: администратор, клиент, активация, продление, отключение", async () => {
    const crypto = await import("node:crypto");
    const setupA = await call(handler, null, { op: "admin.setup", token: "test-setup-token", email: "me@playpos.uz", password: "adminpass1" });
    assert.equal(setupA.status, 200);
    const adm = setupA.cookie;
    assert.equal((await call(handler, null, { op: "admin.setup", token: "test-setup-token", email: "x@y.uz", password: "adminpass1" })).status, 409);
    assert.equal((await call(handler, owner, { op: "admin.state" })).status, 401); // сессия кассы не даёт доступ к админке
    const created = await call(handler, adm, { op: "admin.clientCreate", venue: "Kids Jungle", contact: "Азиз", phone: "+998901234567", login: "kidsjungle", password: "client123", period: "1", amount: 300000 });
    assert.equal(created.status, 200);
    const clientId = created.data.id;
    // активация на компьютере A, повтор на компьютере B запрещён
    const act = await call(handler, null, { op: "license.activate", login: "kidsjungle", password: "client123", deviceId: "device-AAAA" });
    assert.equal(act.status, 200);
    const [body, sig] = act.data.token.split(".");
    assert.ok(crypto.verify(null, Buffer.from(body), act.data.publicKey, Buffer.from(sig, "base64url")));
    const lic = JSON.parse(Buffer.from(body, "base64url").toString());
    assert.equal(lic.deviceId, "device-AAAA");
    const daysLeft = (lic.until - Date.now()) / 86400000;
    assert.ok(daysLeft > 27 && daysLeft < 32, "срок около месяца");
    assert.equal((await call(handler, null, { op: "license.activate", login: "kidsjungle", password: "client123", deviceId: "device-BBBB" })).status, 409);
    // продление от текущего окончания: +3 месяца
    await sql`update clients set paid_until = '2027-01-31T12:00:00+05:00' where id = ${clientId}`;
    const ext = await call(handler, adm, { op: "admin.clientExtend", id: clientId, period: "1", amount: 300000 });
    assert.equal(new Date(ext.data.until).toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }), "2027-02-28"); // 31 янв + 1 мес = последний день февраля
    // обновление лицензии и отключение доступа
    const ref = await call(handler, null, { op: "license.refresh", clientId, deviceId: "device-AAAA", deviceKey: act.data.deviceKey });
    assert.equal(ref.status, 200);
    await call(handler, adm, { op: "admin.clientActive", id: clientId, active: false });
    const ref2 = await call(handler, null, { op: "license.refresh", clientId, deviceId: "device-AAAA", deviceKey: act.data.deviceKey });
    assert.equal(JSON.parse(Buffer.from(ref2.data.token.split(".")[0], "base64url").toString()).active, false);
    assert.equal((await call(handler, null, { op: "license.refresh", clientId, deviceId: "device-AAAA", deviceKey: "wrong-key-123" })).status, 403);
    // отвязка компьютера → можно активировать на новом
    await call(handler, adm, { op: "admin.clientActive", id: clientId, active: true });
    await call(handler, adm, { op: "admin.clientUnbind", id: clientId });
    assert.equal((await call(handler, null, { op: "license.activate", login: "kidsjungle", password: "client123", deviceId: "device-BBBB" })).status, 200);
    const st = (await call(handler, adm, { op: "admin.state" })).data;
    assert.equal(st.payments.filter((p) => p.clientId === clientId).length, 2);
  });

  await sql.end();
});
