/**
 * Endpoint presets REST routes.
 */

import { Elysia } from "elysia";
import {
  createEndpointPreset,
  deleteEndpointPreset,
  listEndpointPresets,
  updateEndpointPreset,
  type EndpointProvider,
} from "../../db/endpoint-presets";

const VALID_PROVIDERS: EndpointProvider[] = ["vowel-prime", "openai", "grok"];

export const endpointPresetRoutes = new Elysia({ prefix: "/api" })
  .get("/endpoint-presets", ({ query }) => {
    const providerParam = typeof query.provider === "string" ? query.provider : undefined;
    const provider = providerParam && VALID_PROVIDERS.includes(providerParam as EndpointProvider)
      ? (providerParam as EndpointProvider)
      : undefined;
    return listEndpointPresets(provider);
  })
  .post("/endpoint-presets", ({ body }) => {
    const provider = body.provider as EndpointProvider;
    if (!VALID_PROVIDERS.includes(provider)) {
      return new Response(
        JSON.stringify({ message: "Invalid provider" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!body.name?.trim()) {
      return new Response(
        JSON.stringify({ message: "name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const preset = createEndpointPreset({
        name: body.name,
        provider,
        httpUrl: body.httpUrl,
        wsUrl: body.wsUrl,
        enabled: body.enabled !== false,
        isSystem: false,
      });
      return preset;
    } catch (error) {
      return new Response(
        JSON.stringify({
          message: error instanceof Error ? error.message : "Failed to create endpoint preset",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  })
  .patch("/endpoint-presets/:id", ({ params, body }) => {
    try {
      const preset = updateEndpointPreset(params.id, {
        name: body.name,
        httpUrl: body.httpUrl,
        wsUrl: body.wsUrl,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      });
      if (!preset) {
        return new Response(
          JSON.stringify({ message: "Endpoint preset not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return preset;
    } catch (error) {
      return new Response(
        JSON.stringify({
          message: error instanceof Error ? error.message : "Failed to update endpoint preset",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  })
  .delete("/endpoint-presets/:id", ({ params }) => {
    try {
      const deleted = deleteEndpointPreset(params.id);
      if (!deleted) {
        return new Response(
          JSON.stringify({ message: "Endpoint preset not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return { ok: true };
    } catch (error) {
      return new Response(
        JSON.stringify({
          message: error instanceof Error ? error.message : "Failed to delete endpoint preset",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  });
