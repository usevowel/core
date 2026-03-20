/**
 * Vowel Core - Elysia + tRPC app
 * Hybrid: REST for generateToken (SDK compatibility), tRPC for everything else
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "fs";
import { join } from "path";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import {
  handleGenerateToken,
  TokenRequestError,
  type TokenRequestBody,
} from "./token";
import { initDb } from "../db/init";
import { bootstrapCoreDataFromEnv } from "../db/bootstrap";
import { statusRoutes } from "./routes/status";
import { appsRoutes } from "./routes/apps";
import { apiKeysRoutes } from "./routes/api-keys";
import { endpointPresetRoutes } from "./routes/endpoint-presets";
import { engineConfigRoutes } from "./routes/engine-config";

/** API port when running alongside vinext (Docker). */
const API_PORT = parseInt(process.env.API_PORT ?? "3001", 10);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const TRPC_PATH = "/trpc";
const isApiOnly = process.env.API_ONLY === "1";
const REQUEST_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

type RequestTrace = {
  id: string;
  startedAt: number;
  method: string;
  path: string;
};

const requestTraces = new WeakMap<Request, RequestTrace>();
const requestPath = (request: Request) => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
};

const nextRequestId = () => {
  const randomSuffix = Array.from({ length: 8 })
    .map(() => REQUEST_ID_CHARS[Math.floor(Math.random() * REQUEST_ID_CHARS.length)])
    .join("");
  return `${Date.now()}-${randomSuffix}`;
};

const logRequestStart = ({
  request,
  requestId,
}: {
  request: Request;
  requestId: string;
}) => {
  const method = request.method.toUpperCase();
  const path = requestPath(request);
  const startedAt = Date.now();

  requestTraces.set(request, {
    id: requestId,
    startedAt,
    method,
    path,
  });

  console.log(`[core] [${requestId}] ${method} ${path} -> start`);
};

const logRequestEnd = ({
  request,
  status,
}: {
  request: Request;
  status: number;
}) => {
  const trace = requestTraces.get(request);
  if (!trace) {
    return;
  }

  const elapsed = Date.now() - trace.startedAt;
  console.log(
    `[core] [${trace.id}] ${trace.method} ${trace.path} -> ${status} (${elapsed}ms)`
  );
  requestTraces.delete(request);
};

const logRequestError = ({
  request,
  status,
  error,
}: {
  request: Request;
  status: number;
  error: unknown;
}) => {
  const trace = requestTraces.get(request);
  const requestId = trace?.id ?? "unknown";
  const path = trace?.path ?? requestPath(request);
  const method = trace?.method ?? request.method.toUpperCase();
  const elapsed = trace ? Date.now() - trace.startedAt : 0;

  console.error(
    `[core] [${requestId}] ${method} ${path} -> ${status} (${elapsed}ms)`,
    error instanceof Error ? error.stack ?? error.message : error
  );

  if (trace) {
    requestTraces.delete(request);
  }
};

// Prefer an actual UI build (index.html + assets) when serving static files.
const uiDistCandidates = [
  join(import.meta.dir, "../../dist"),
  join(import.meta.dir, "../../ui/dist"),
];

const distPath =
  uiDistCandidates.find((candidate) => {
    return (
      existsSync(join(candidate, "index.html")) &&
      existsSync(join(candidate, "assets"))
    );
  }) ?? null;
const hasDist = distPath !== null;

initDb();
await bootstrapCoreDataFromEnv();

// tRPC handler wrapper
const trpcHandler = async (request: Request): Promise<Response> => {
  return fetchRequestHandler({
    endpoint: TRPC_PATH,
    req: request,
    router: appRouter,
    createContext: async () => createContext({ req: request }),
  });
};

// Token endpoint handler with Bearer auth
const tokenHandler = async (request: Request): Promise<Response> => {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ message: "Unauthorized: Bearer token required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = authHeader.slice(7);
    const body = (await request.json()) as TokenRequestBody;
    
    const result = await handleGenerateToken(body, apiKey);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[core] Token generation error:", error);
    const status = error instanceof TokenRequestError ? error.status : 500;
    return new Response(
      JSON.stringify({ 
        message: error instanceof Error ? error.message : "Token generation failed" 
      }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Build Elysia app
let app = new Elysia()
  .use(cors())
  .onRequest(({ request }) => {
    const requestId = nextRequestId();
    logRequestStart({ request, requestId });
  })
  .onAfterResponse(({ request, set }) => {
    if (request) {
      logRequestEnd({
        request,
        status: typeof set?.status === "number" ? set.status : 200,
      });
    }
  })
  .onError(({ request, set, error }) => {
    if (request) {
      logRequestError({
        request,
        status: typeof set?.status === "number" ? set.status : 500,
        error,
      });
    }
    console.error(
      `[core] request error context`,
      request ? `path=${requestPath(request)}` : "path=unknown"
    );
  })
  .get("/health", () => ({ status: "ok" }))
  // REST token endpoint (SDK compatibility)
  .post("/vowel/api/generateToken", ({ request }) => tokenHandler(request))
  .use(statusRoutes)
  .use(engineConfigRoutes)
  .use(appsRoutes)
  .use(apiKeysRoutes)
  .use(endpointPresetRoutes)
  .get("/trpc/*", ({ request }) => trpcHandler(request))
  .post("/trpc/*", ({ request }) => trpcHandler(request))
  .all("/trpc/*", ({ request }) => trpcHandler(request));

// Add static file serving if UI is built
if (hasDist && !isApiOnly && distPath) {
  // Serve static assets from ui/dist/assets (Vite outputs JS/CSS there)
  const assetsPath = join(distPath, "assets");
  app = app.use(
    staticPlugin({ assets: assetsPath, prefix: "/assets" })
  );
  
  // Serve index.html only for root path
  app = app.get("/", () => {
    const indexPath = join(distPath, "index.html");
    return new Response(Bun.file(indexPath));
  });

  app = app.get("/*", ({ request }) => {
    const pathname = new URL(request.url).pathname;
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/trpc") ||
      pathname.startsWith("/vowel") ||
      pathname.startsWith("/health") ||
      pathname.startsWith("/assets")
    ) {
      return new Response("NOT_FOUND", { status: 404 });
    }

    const indexPath = join(distPath, "index.html");
    return new Response(Bun.file(indexPath));
  });
}



const listenPort = isApiOnly ? API_PORT : PORT;

export { app, listenPort, TRPC_PATH };
