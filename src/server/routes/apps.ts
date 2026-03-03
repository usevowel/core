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
    return createApp(input);
  })
  .get("/apps/:id", ({ params }) => {
    const app = getApp(params.id);
    if (!app) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return app;
  })
  .patch("/apps/:id", ({ params, body }) => {
    const input = body as UpdateAppInput;
    const app = updateApp(params.id, input);
    if (!app) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return app;
  })
  .delete("/apps/:id", ({ params }) => {
    const deleted = deleteApp(params.id);
    if (!deleted) {
      return new Response(
        JSON.stringify({ message: "App not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true };
  });
