// Веб-сервер PlayPos без Vercel: раздаёт интерфейс из папки и направляет /api/rpc в ту же функцию,
// что работает на Vercel. Используется для локального запуска и в настольном приложении.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import handler from "../api/rpc.js";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export function createServer(webRoot) {
  const ROOT = path.resolve(webRoot);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/rpc") return handler(req, res);
    let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    if (url.pathname === "/") p = path.join(ROOT, "index.html");
    else if (!path.extname(p)) p += ".html"; // как cleanUrls на Vercel
    try {
      const data = await fs.readFile(p);
      res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(data);
    } catch { res.statusCode = 404; res.end("Not found"); }
  });
}
