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

  await sql.end();
});
