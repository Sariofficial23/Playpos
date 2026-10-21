// Локальный запуск: DATABASE_URL=postgres://... SETUP_TOKEN=... npm run dev → http://localhost:3000
import { createServer } from "./lib/server.js";

const port = process.env.PORT || 3000;
createServer("demo").listen(port, () => console.log("PlayPos: http://localhost:" + port));
