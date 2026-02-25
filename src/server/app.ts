/**
 * Vowel Core - Elysia app (exported for testing).
 * Token API, apps, API keys, provider keys, static UI.
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "fs";
import { join } from "path";
import { listProviderKeys } from "../db/provider-keys";
import { providerKeysRoutes } from "./routes/provider-keys";
import { handleGenerateToken } from "./token";

/** API port when running alongside vinext (Docker). */
const API_PORT = parseInt(process.env.API_PORT ?? "3001", 10);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const isApiOnly = process.env.API_ONLY === "1";

// Docker: dist at /app/dist. Local: ui/dist (vinext build output)
const distPath = existsSync(join(import.meta.dir, "../../dist"))
  ? join(import.meta.dir, "../../dist")
  : join(import.meta.dir, "../../ui/dist");
const hasDist = existsSync(distPath);

function getProviderStatus() {
  const defaultKeys = listProviderKeys("default");
  const hasKey = (p: string) => defaultKeys.some((k) => k.provider === p);
  return {
    "vowel-prime": {
      configured: !!process.env.SNDBRD_API_KEY || hasKey("vowel-prime"),
    },
    openai: {
      configured: !!process.env.OPENAI_API_KEY || hasKey("openai"),
    },
    grok: {
      configured: !!process.env.XAI_API_KEY || hasKey("grok"),
    },
  };
}

function getVowelPrimeStatus() {
  const selfHostedWs =
    process.env.SNDBRD_WS_URL?.trim() ||
    (process.env.SNDBRD_URL?.trim()
      ? process.env.SNDBRD_URL.replace(/^https:/, "wss:")
          .replace(/^http:/, "ws:")
          .replace(/\/?$/, "") + "/v1/realtime"
      : undefined);
  return {
    environments: [
      { value: "testing", label: "testing (testing-prime.vowel.to)", wsUrl: "wss://testing-prime.vowel.to/v1/realtime" },
      { value: "dev", label: "dev (dev-prime.vowel.to)", wsUrl: "wss://dev-prime.vowel.to/v1/realtime" },
      { value: "staging", label: "staging (staging.prime.vowel.to)", wsUrl: "wss://staging.prime.vowel.to/v1/realtime" },
      { value: "production", label: "production (prime.vowel.to)", wsUrl: "wss://prime.vowel.to/v1/realtime" },
      { value: "billing-test", label: "billing-test (billing-test.vowel.to)", wsUrl: "wss://billing-test.vowel.to/v1/realtime" },
    ],
    defaultEnvironment: selfHostedWs ? "self-hosted" : "staging",
    selfHostedWsUrl: selfHostedWs,
  };
}

let app = new Elysia()
  .use(cors())
  .get("/health", () => ({ status: "ok" }))
  .get("/api/status", () => ({
    providers: getProviderStatus(),
    vowelPrime: getVowelPrimeStatus(),
  }))
  .use(providerKeysRoutes)
  .group("/api", (app) =>
    app
      .get("/apps", () => [])
      .post("/apps", ({ body }) => ({ id: "placeholder", ...body }))
  )
  .post("/vowel/api/generateToken", async ({ body }) => {
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const result = await handleGenerateToken(parsed);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Token generation failed";
      return new Response(JSON.stringify({ message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

if (hasDist && !isApiOnly) {
  app = app.use(
    staticPlugin({ assets: distPath, prefix: "/", indexHTML: true })
  );
}

const listenPort = isApiOnly ? API_PORT : PORT;

export { app, listenPort };
