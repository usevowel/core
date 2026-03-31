/**
 * Apps API routes.
 * CRUD for apps.
 */

import { Elysia } from "elysia";
import {
  createApp,
  listApps,
  getApp,
  updateApp,
  deleteApp,
  type CreateAppInput,
  type UpdateAppInput,
} from "../../db/apps";

export const appsRoutes = new Elysia({ prefix: "/api" })
  .get("/apps", () => {
    return listApps();
  })
  .post("/apps", ({ body }) => {
    const input = body as CreateAppInput;
    if (!input.name?.trim()) {
      return new Response(
        JSON.stringify({ message: "name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (
      input.runtimeConfig !== undefined &&
      (typeof input.runtimeConfig !== "object" ||
        input.runtimeConfig === null ||
        Array.isArray(input.runtimeConfig))
    ) {
      return new Response(
        JSON.stringify({ message: "runtimeConfig must be a JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return createApp(input);
  })
  .get("/apps/:appId", ({ params }) => {
    const app = getApp(params.appId);
    if (!app) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return app;
  })
  .patch("/apps/:appId", ({ params, body }) => {
    const input = body as UpdateAppInput;
    if (
      input.runtimeConfig !== undefined &&
      (typeof input.runtimeConfig !== "object" ||
        input.runtimeConfig === null ||
        Array.isArray(input.runtimeConfig))
    ) {
      return new Response(
        JSON.stringify({ message: "runtimeConfig must be a JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const app = updateApp(params.appId, input);
    if (!app) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return app;
  })
  .delete("/apps/:appId", ({ params }) => {
    const deleted = deleteApp(params.appId);
    if (!deleted) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true };
  });
