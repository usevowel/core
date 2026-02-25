/**
 * Provider keys API routes.
 * CRUD for encrypted provider API keys per app.
 */

import { Elysia } from "elysia";
import {
  createProviderKey,
  listProviderKeys,
  deleteProviderKey,
  type CreateProviderKeyInput,
} from "../../db/provider-keys";

export const providerKeysRoutes = new Elysia({ prefix: "/api" })
  .get("/apps/:appId/provider-keys", ({ params }) => {
    const keys = listProviderKeys(params.appId);
    return keys;
  })
  .post("/apps/:appId/provider-keys", async ({ params, body }) => {
    const input: CreateProviderKeyInput = {
      appId: params.appId,
      provider: body.provider as CreateProviderKeyInput["provider"],
      label: body.label,
      apiKey: body.apiKey,
      vowelPrimeEnvironment: body.vowelPrimeEnvironment,
      vowelPrimeWorkerUrl: body.vowelPrimeWorkerUrl,
    };
    if (!input.apiKey?.trim()) {
      return new Response(
        JSON.stringify({ message: "apiKey is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!["vowel-prime", "openai", "grok"].includes(input.provider)) {
      return new Response(
        JSON.stringify({ message: "Invalid provider" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const meta = await createProviderKey(input);
    return meta;
  })
  .delete("/provider-keys/:id", ({ params, query }) => {
    const appId = query.appId as string;
    if (!appId) {
      return new Response(
        JSON.stringify({ message: "appId query param required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const deleted = deleteProviderKey(params.id, appId);
    if (!deleted) {
      return new Response(
        JSON.stringify({ message: "Provider key not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true };
  });
