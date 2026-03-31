/**
 * Status and configuration summary routes.
 */

import { Elysia } from "elysia";
import { getEngineHealth } from "../engine-config";

export const statusRoutes = new Elysia({ prefix: "/api" }).get("/status", async () => {
  const providers = {
    "vowel-core": {
      configured: Boolean(process.env.VOWEL_ENGINE_API_KEY),
      secretEnv: "VOWEL_ENGINE_API_KEY",
    },
    "vowel-prime": {
      configured: Boolean(process.env.VOWEL_ENGINE_API_KEY),
      secretEnv: "VOWEL_ENGINE_API_KEY",
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

  let engine: {
    reachable: boolean;
    url: string | null;
    configPath?: string;
    configLastUpdated?: string;
    error?: string;
  } = {
    reachable: false,
    url: process.env.VOWEL_ENGINE_URL ?? null,
  };

  try {
    const health = await getEngineHealth();
    engine = {
      reachable: true,
      url: process.env.VOWEL_ENGINE_URL ?? null,
      configPath: health.configPath,
      configLastUpdated: health.configLastUpdated,
    };
  } catch (error) {
    engine = {
      reachable: false,
      url: process.env.VOWEL_ENGINE_URL ?? null,
      error: error instanceof Error ? error.message : "Engine health request failed",
    };
  }

  return {
    providers,
    engine,
  };
});
