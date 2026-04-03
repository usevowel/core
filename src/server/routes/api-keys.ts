/**
 * API keys REST routes.
 * App-scoped publishable key management and policy controls.
 */

import { Elysia } from "elysia";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  revealApiKeyPlaintext,
  revokeApiKey,
  updateApiKey,
  type ApiKeyScope,
  type ApiKeyProvider,
} from "../../db/api-keys";
import { normalizeCoreProvider, type CoreProviderInput } from "../../lib/provider-identity";

const VALID_SCOPES: ApiKeyScope[] = ["mint_ephemeral", "direct_ws"];

export const apiKeysRoutes = new Elysia({ prefix: "/api" })
  .get("/apps/:appId/api-keys", async ({ params }) => {
    return await listApiKeys(params.appId);
  })
  .post("/apps/:appId/api-keys", async ({ params, body }) => {
    const payload = body as Record<string, unknown>;
    const scopes = Array.isArray(payload.scopes) ? payload.scopes : ["mint_ephemeral"];
    const parsedScopes = scopes.filter((scope): scope is ApiKeyScope =>
      VALID_SCOPES.includes(scope)
    );
    if (parsedScopes.length === 0) {
      return new Response(
        JSON.stringify({ message: "At least one valid scope is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const allowedProviders = Array.isArray(payload.allowedProviders)
      ? payload.allowedProviders
          .map((provider) => normalizeCoreProvider(provider as CoreProviderInput))
          .filter((provider): provider is ApiKeyProvider => Boolean(provider))
      : undefined;

    const key = await createApiKey({
      appId: params.appId,
      scopes: parsedScopes,
      label: typeof payload.label === "string" ? payload.label : undefined,
      allowedProviders,
    });

    return key;
  })
  .get("/apps/:appId/api-keys/:id/reveal", async ({ params }) => {
    const plaintext = await revealApiKeyPlaintext(params.id, params.appId);
    if (!plaintext) {
      return new Response(
        JSON.stringify({ message: "API key not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { plaintext };
  })
  .patch("/apps/:appId/api-keys/:id", ({ params, body }) => {
    const payload = body as Record<string, unknown>;
    const scopes = Array.isArray(payload.scopes)
      ? payload.scopes.filter((scope): scope is ApiKeyScope =>
          VALID_SCOPES.includes(scope)
        )
      : undefined;
    if (Array.isArray(payload.scopes) && scopes && scopes.length === 0) {
      return new Response(
        JSON.stringify({ message: "Invalid scopes payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const allowedProviders = Array.isArray(payload.allowedProviders)
      ? payload.allowedProviders
          .map((provider) => normalizeCoreProvider(provider as CoreProviderInput))
          .filter((provider): provider is ApiKeyProvider => Boolean(provider))
      : undefined;

    const updated = updateApiKey(params.id, params.appId, {
      scopes,
      label: typeof payload.label === "string" ? payload.label : undefined,
      allowedProviders,
    });
    if (!updated) {
      return new Response(
        JSON.stringify({ message: "API key not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return updated;
  })
  .post("/apps/:appId/api-keys/:id/revoke", ({ params }) => {
    const revoked = revokeApiKey(params.id, params.appId);
    if (!revoked) {
      return new Response(
        JSON.stringify({ message: "API key not found or already revoked" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true };
  })
  .delete("/apps/:appId/api-keys/:id", ({ params }) => {
    const deleted = deleteApiKey(params.id, params.appId);
    if (!deleted) {
      return new Response(
        JSON.stringify({ message: "API key not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return { ok: true };
  });
