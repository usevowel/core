/**
 * Vowel Core API tests.
 */

import { describe, test, expect } from "bun:test";
import { app } from "./app.js";

describe("Vowel Core API", () => {
  describe("GET /health", () => {
    test("returns status ok", async () => {
      const res = await app.fetch(new Request("http://localhost/health"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ status: "ok" });
    });
  });

  describe("GET /api/status", () => {
    test("returns provider status", async () => {
      const res = await app.fetch(new Request("http://localhost/api/status"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("providers");
      expect(json.providers).toHaveProperty("vowel-prime");
      expect(json.providers).toHaveProperty("openai");
      expect(json.providers).toHaveProperty("grok");
      expect(typeof json.providers["vowel-prime"].configured).toBe("boolean");
    });

    test("reflects SNDBRD_API_KEY when set", async () => {
      const orig = process.env.SNDBRD_API_KEY;
      process.env.SNDBRD_API_KEY = "test-key";
      try {
        const res = await app.fetch(new Request("http://localhost/api/status"));
        const json = await res.json();
        expect(json.providers["vowel-prime"].configured).toBe(true);
      } finally {
        if (orig !== undefined) process.env.SNDBRD_API_KEY = orig;
        else delete process.env.SNDBRD_API_KEY;
      }
    });
  });

  describe("GET /api/apps", () => {
    test("returns empty array", async () => {
      const res = await app.fetch(new Request("http://localhost/api/apps"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json).toHaveLength(0);
    });
  });

  describe("POST /api/apps", () => {
    test("returns placeholder with body", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test App", description: "A test" }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("id", "placeholder");
      expect(json).toHaveProperty("name", "Test App");
      expect(json).toHaveProperty("description", "A test");
    });
  });

  describe("POST /vowel/api/generateToken", () => {
    const baseTokenRequest = (overrides: Record<string, unknown> = {}) => {
      return JSON.stringify(
        {
          appId: "core-test-app",
          origin: "https://local.test",
          ...overrides,
        },
        null,
        0
      );
    };

    const setEnv = (env: Record<string, string | undefined>) => {
      const previous = new Map<string, string | undefined>();
      for (const [key, value] of Object.entries(env)) {
        previous.set(key, process.env[key]);
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }

      return () => {
        for (const [key, value] of previous) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      };
    };

    const postGenerateToken = async (body: string) => {
      return app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer core-test-token",
          },
          body,
        })
      );
    };

    test.skip("issues a vowel-prime token using default provider resolution", async () => {
      const restoreEnv = setEnv({
        CORE_DEFAULT_PROVIDER: undefined,
        SNDBRD_API_KEY: "dev-test-sndbrd-key",
        SNDBRD_WS_URL: "ws://localhost:8787/v1/realtime",
        OPENAI_API_KEY: undefined,
        XAI_API_KEY: undefined,
      });

      try {
        const res = await postGenerateToken(
          baseTokenRequest({
            config: { model: "moonshotai/kimi-k2-instruct-0905" },
          })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          provider: "vowel-prime",
          model: "moonshotai/kimi-k2-instruct-0905",
          metadata: {
            baseUrl: "ws://localhost:8787/v1/realtime",
            audioFormat: "pcm16",
            sampleRate: 24000,
          },
        });
        expect(typeof json.tokenName).toBe("string");
        expect(json.token).toBe(json.tokenName);
        expect(json.tokenName).toContain("vowel-prime");
        expect(json.tokenName).toMatch(/moonshotaikimi-k2-instruct-0905/i);
      } finally {
        restoreEnv();
      }
    });

    test.skip("uses config.provider to select OpenAI connection settings", async () => {
      const restoreEnv = setEnv({
        OPENAI_API_KEY: "dev-openai-key",
        CORE_DEFAULT_PROVIDER: "openai",
        SNDBRD_API_KEY: undefined,
        XAI_API_KEY: undefined,
      });

      try {
        const res = await postGenerateToken(
          baseTokenRequest({
            config: {
              provider: "openai",
              model: "gpt-4o-mini",
              voiceConfig: {
                model: "gpt-4o-realtime-preview",
                voice: "alloy",
              },
            },
          })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          provider: "openai",
          model: "gpt-4o-mini",
          metadata: {
            baseUrl: "wss://api.openai.com/v1/realtime",
            voice: "alloy",
            audioFormat: "pcm16",
            sampleRate: 24000,
          },
        });
      } finally {
        restoreEnv();
      }
    });

    test.skip("uses config.voiceConfig.provider for sidecar-style provider overrides", async () => {
      const restoreEnv = setEnv({
        XAI_API_KEY: "dev-grok-key",
        CORE_DEFAULT_PROVIDER: "grok",
        SNDBRD_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
      });

      try {
        const res = await postGenerateToken(
          baseTokenRequest({
            config: {
              provider: "unsupported-provider",
              voiceConfig: {
                provider: "grok",
                model: "grok-beta",
                voice: "alloy",
              },
            },
          })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          provider: "grok",
          model: "grok-beta",
          metadata: {
            baseUrl: "wss://api.x.ai/v1/realtime",
            voice: "alloy",
            audioFormat: "pcm16",
            sampleRate: 24000,
          },
        });
      } finally {
        restoreEnv();
      }
    });

    test("returns 400 when selected provider credentials are missing", async () => {
      const restoreEnv = setEnv({
        SNDBRD_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        XAI_API_KEY: undefined,
        CORE_DEFAULT_PROVIDER: "vowel-prime",
      });

      try {
        const res = await postGenerateToken(baseTokenRequest());
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.message).toContain(
          "No API key for vowel-prime"
        );
      } finally {
        restoreEnv();
      }
    });

    test("returns a CORS-friendly preflight response", async () => {
      const res = await app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
          },
        })
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).not.toBeNull();
      const allowedMethods = res.headers.get("Access-Control-Allow-Methods");
      expect(allowedMethods).toBe("POST");
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
    });
  });
});
