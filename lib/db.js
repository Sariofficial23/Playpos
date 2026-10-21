import postgres from "postgres";
import { SCHEMA } from "./schema.js";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

let sql = null;
let ready = null;

export function db() {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) fail(500, "База данных не подключена (нет DATABASE_URL)");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    sql = postgres(url, {
      max: 3,
      prepare: false, // совместимо с пулом соединений (Neon / PgBouncer)
      idle_timeout: 20,
      ssl: local ? false : "require",
      // bigint → number: суммы в сумах и id помещаются в Number без потерь
      types: { bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) } },
    });
  }
  return sql;
}

// Схема применяется один раз на процесс, под advisory-lock, чтобы параллельные запуски не мешали друг другу
export function ensureSchema() {
  if (!ready) {
    ready = db().begin(async (t) => {
      await t`select pg_advisory_xact_lock(7710001)`;
      await t.unsafe(SCHEMA);
    }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
