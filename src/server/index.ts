/**
 * Vowel Core - Elysia server
 * Token API, apps, API keys, static UI
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "fs";
import { join } from "path";

// Docker: dist at /app/dist. Local: ui/dist
const distPath = existsSync(join(import.meta.dir, "../../dist"))
  ? join(import.meta.dir, "../../dist")
  : join(import.meta.dir, "../../ui/dist");
const hasDist = existsSync(distPath);

let app = new Elysia()
  .use(cors())
  .get("/health", () => ({ status: "ok" }))
  .get("/api/status", () => ({
    providers: {
      "vowel-prime": { configured: !!process.env.SNDBRD_API_KEY },
      openai: { configured: !!process.env.OPENAI_API_KEY },
      grok: { configured: !!process.env.XAI_API_KEY },
    },
  }))
  .group("/api", (app) =>
    app
      .get("/apps", () => [])
      .post("/apps", ({ body }) => ({ id: "placeholder", ...body }))
  );

if (hasDist) {
  app = app.use(
    staticPlugin({ assets: distPath, prefix: "/", indexHTML: true })
  );
}

app = app.listen(process.env.PORT || 3000);

console.log(
  `Vowel Core running at http://${app.server?.hostname}:${app.server?.port}`
);
