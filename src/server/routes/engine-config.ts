import { Elysia } from "elysia";
import {
  getEngineConfig,
  listEnginePresets,
  reloadEngineConfig,
  saveEngineConfig,
  validateEngineConfig,
} from "../engine-config";

function toErrorResponse(error: unknown, fallback: string, status = 502): Response {
  return new Response(
    JSON.stringify({
      message: error instanceof Error ? error.message : fallback,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export const engineConfigRoutes = new Elysia({ prefix: "/api/engine" })
  .get("/config", async () => {
    try {
      return await getEngineConfig();
    } catch (error) {
      return toErrorResponse(error, "Failed to load engine config");
    }
  })
  .put("/config", async ({ body }) => {
    try {
      const config =
        body && typeof body === "object" && "config" in body
          ? (body.config as Record<string, unknown>)
          : (body as Record<string, unknown>);
      return await saveEngineConfig(config);
    } catch (error) {
      return toErrorResponse(error, "Failed to save engine config", 400);
    }
  })
  .post("/config/validate", async ({ body }) => {
    try {
      const config =
        body && typeof body === "object" && "config" in body
          ? (body.config as Record<string, unknown>)
          : (body as Record<string, unknown>);
      return await validateEngineConfig(config);
    } catch (error) {
      return toErrorResponse(error, "Failed to validate engine config", 400);
    }
  })
  .post("/config/reload", async () => {
    try {
      return await reloadEngineConfig();
    } catch (error) {
      return toErrorResponse(error, "Failed to reload engine config");
    }
  })
  .get("/presets", async () => {
    try {
      return await listEnginePresets();
    } catch (error) {
      return toErrorResponse(error, "Failed to load engine presets");
    }
  });
