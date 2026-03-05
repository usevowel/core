/**
 * Status and configuration summary routes.
 */

import { Elysia } from "elysia";
import { listEndpointPresets } from "../../db/endpoint-presets";

export const statusRoutes = new Elysia({ prefix: "/api" }).get("/status", () => {
  const providers = {
    "vowel-prime": {
      configured: Boolean(process.env.SNDBRD_API_KEY),
      secretEnv: "SNDBRD_API_KEY",
    },
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      secretEnv: "OPENAI_API_KEY",
    },
    grok: {
      configured: Boolean(process.env.XAI_API_KEY),
      secretEnv: "XAI_API_KEY",
    },
  };

  const presets = listEndpointPresets();
  const byProvider = presets.reduce<Record<string, number>>((acc, preset) => {
    acc[preset.provider] = (acc[preset.provider] ?? 0) + 1;
    return acc;
  }, {});

  return {
    providers,
    endpointPresets: {
      total: presets.length,
      enabled: presets.filter((preset) => preset.enabled).length,
      system: presets.filter((preset) => preset.isSystem).length,
      byProvider,
    },
  };
});
