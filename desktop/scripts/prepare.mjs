// Копирует общий код PlayPos (сервер и интерфейс) из корня репозитория в desktop/app перед запуском и сборкой
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.resolve(here, "../app");

await fs.rm(out, { recursive: true, force: true });
for (const dir of ["lib", "api"]) await fs.cp(path.join(root, dir), path.join(out, dir), { recursive: true });
await fs.cp(path.join(root, "demo"), path.join(out, "web"), { recursive: true });
// Админ-панель платформы нужна только на сайте, в программу клиента её не кладём
for (const f of ["admin.html", "admin.js"]) await fs.rm(path.join(out, "web", f), { force: true });
// В приложении не нужны лендинг-презентации; сайт открывается сразу на кассе
console.log("prepared", out);
