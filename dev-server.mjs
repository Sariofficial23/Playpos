// Локальный запуск: DATABASE_URL=postgres://... SETUP_TOKEN=... npm run dev → http://localhost:3000
// Отдаёт статические файлы из demo/ и направляет /api/rpc в ту же функцию, что работает на Vercel.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import handler from "./api/rpc.js";

const ROOT = path.resolve("demo");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/rpc") return handler(req, res);
  let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (url.pathname === "/") p = path.join(ROOT, "index.html");
  else if (!path.extname(p)) p += ".html"; // как cleanUrls на Vercel
  try {
    const data = await fs.readFile(p);
    res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
    res.end(data);
  } catch { res.statusCode = 404; res.end("Not found"); }
}).listen(process.env.PORT || 3000, () => console.log("PlayPos: http://localhost:" + (process.env.PORT || 3000)));
