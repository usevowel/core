/**
 * Vowel Core - Elysia + tRPC server entrypoint
 */

import { app, listenPort } from "./app.js";

app.listen(listenPort);

const isApiOnlyMode = process.env.API_ONLY === "1";

console.log(`[core] Server running on http://localhost:${listenPort}`);
console.log(
  `[core] Backend config: MODE=${isApiOnlyMode ? "api-only" : "api+ui"}, apiUrl=http://localhost:${listenPort}`
);
console.log(`[core] tRPC endpoint: http://localhost:${listenPort}/trpc`);
console.log(`[core] REST token endpoint: http://localhost:${listenPort}/vowel/api/generateToken`);
