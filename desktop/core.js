// Ядро настольного PlayPos: встроенная PostgreSQL (PGlite) + веб-сервер кассы + резервные копии.
// Не зависит от Electron, поэтому его можно запустить и проверить обычным node.
import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const KEEP_BACKUPS = 30;

export async function startCore({ dataDir, backupDir, webRoot, port = 3700, host = "127.0.0.1" }) {
  await fs.mkdir(dataDir, { recursive: true });
  const pg = await PGlite.create(path.join(dataDir, "pgdata"));
  const pgServer = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await pgServer.start();

  // Серверный код PlayPos (тот же, что на Vercel) подключается к встроенной базе как к обычной PostgreSQL
  process.env.DATABASE_URL = `postgres://postgres:postgres@${pgServer.getServerConn()}/postgres`;
  process.env.PG_MAX = "1";
  process.env.PLAYPOS_DESKTOP = "1";
  const { createServer } = await import("./app/lib/server.js");
  const { db } = await import("./app/lib/db.js");

  const http = createServer(webRoot);
  await new Promise((ok, bad) => { http.once("error", bad); http.listen(port, host, ok); });
  const url = `http://127.0.0.1:${port}`;

  // Резервная копия: полный архив базы в папку backups, храним последние 30
  async function backup(reason = "auto") {
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const file = path.join(backupDir, `playpos-${stamp}-${reason}.tar.gz`);
    const blob = await pg.dumpDataDir("gzip");
    await fs.writeFile(file, Buffer.from(await blob.arrayBuffer()));
    const all = (await fs.readdir(backupDir)).filter((f) => /^playpos-.*\.tar\.gz$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fs.rm(path.join(backupDir, old), { force: true });
    return file;
  }
  // Копия при запуске (если сегодня ещё не было) и затем раз в сутки
  async function dailyBackup() {
    const today = new Date().toISOString().slice(0, 10);
    const done = (await fs.readdir(backupDir).catch(() => [])).some((f) => f.startsWith(`playpos-${today}`));
    if (!done) await backup("daily");
  }
  const timer = setInterval(() => dailyBackup().catch((e) => console.error("backup", e)), 6 * 3600 * 1000);
  dailyBackup().catch((e) => console.error("backup", e));

  async function stop() {
    clearInterval(timer);
    await new Promise((ok) => http.close(ok));
    try { await db().end({ timeout: 2 }); } catch (e) {}
    await pgServer.stop();
    await pg.close();
  }
  return { url, backup, stop };
}
