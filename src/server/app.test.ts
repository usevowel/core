/**
 * Vowel Core API tests.
 */

import { describe, test, expect } from "bun:test";
import { createApp } from "../db/apps";
import { createApiKey } from "../db/api-keys";
import { DEFAULT_TEST_MODEL } from "../test/default-model";

process.env.DB_PATH ??= "./data/core.test.db";

const { app } = await import("./app.js");

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

    test("reflects VOWEL_ENGINE_API_KEY when set", async () => {
      const orig = process.env.VOWEL_ENGINE_API_KEY;
      process.env.VOWEL_ENGINE_API_KEY = "test-key";
      try {
        const res = await app.fetch(new Request("http://localhost/api/status"));
        const json = await res.json();
        expect(json.providers["vowel-prime"].configured).toBe(true);
      } finally {
        if (orig !== undefined) process.env.VOWEL_ENGINE_API_KEY = orig;
        else delete process.env.VOWEL_ENGINE_API_KEY;
      }
    });
  });

  describe("GET /api/apps", () => {
    test("returns an array", async () => {
      const res = await app.fetch(new Request("http://localhost/api/apps"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
    });
  });

  describe("POST /api/apps", () => {
    test("creates an app record", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test App", description: "A test" }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(typeof json.id).toBe("string");
      expect(json).toHaveProperty("name", "Test App");
      expect(json).toHaveProperty("description", "A test");
    });
  });

  describe("POST /vowel/api/generateToken", () => {
    const baseTokenRequest = (overrides: Record<string, unknown> = {}) => {
      return JSON.stringify(
        {
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

    const createBearerApiKey = async () => {
      const createdApp = createApp({
        name: "Token Test App",
        description: "Token route test app",
      });
      const key = await createApiKey({
        appId: createdApp.id,
        scopes: ["mint_ephemeral"],
      });
      return { appId: createdApp.id, plaintext: key.plaintext };
    };

    const postGenerateToken = async (body: string, bearer: string) => {
      return app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearer}`,
          },
          body,
        })
      );
    };

    test.skip("issues a vowel-prime token using default provider resolution", async () => {
      const restoreEnv = setEnv({
        CORE_DEFAULT_PROVIDER: undefined,
        VOWEL_ENGINE_API_KEY: "dev-test-vowel-engine-key",
        VOWEL_ENGINE_WS_URL: "ws://localhost:8787/v1/realtime",
        OPENAI_API_KEY: undefined,
        XAI_API_KEY: undefined,
      });

      try {
        const bearer = await createBearerApiKey();
        const res = await postGenerateToken(
          baseTokenRequest({
            appId: bearer.appId,
            config: { model: DEFAULT_TEST_MODEL },
          }),
          bearer.plaintext
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          provider: "vowel-prime",
          model: DEFAULT_TEST_MODEL,
          metadata: {
            baseUrl: "ws://localhost:8787/v1/realtime",
            audioFormat: "pcm16",
            sampleRate: 24000,
          },
        });
        expect(typeof json.tokenName).toBe("string");
        expect(json.token).toBe(json.tokenName);
        expect(json.tokenName).toMatch(/^ek_/);
      } finally {
        restoreEnv();
      }
    });

    test.skip("uses config.provider to select OpenAI connection settings", async () => {
      const restoreEnv = setEnv({
        OPENAI_API_KEY: "dev-openai-key",
        CORE_DEFAULT_PROVIDER: "openai",
        VOWEL_ENGINE_API_KEY: undefined,
        XAI_API_KEY: undefined,
      });

      try {
        const bearer = await createBearerApiKey();
        const res = await postGenerateToken(
          baseTokenRequest({
            appId: bearer.appId,
            config: {
              provider: "openai",
              model: "gpt-4o-mini",
              voiceConfig: {
                model: "gpt-4o-realtime-preview",
                voice: "alloy",
              },
            },
          }),
          bearer.plaintext
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
        VOWEL_ENGINE_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
      });

      try {
        const bearer = await createBearerApiKey();
        const res = await postGenerateToken(
          baseTokenRequest({
            appId: bearer.appId,
            config: {
              provider: "unsupported-provider",
              voiceConfig: {
                provider: "grok",
                model: "grok-beta",
                voice: "alloy",
              },
            },
          }),
          bearer.plaintext
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
        VOWEL_ENGINE_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        XAI_API_KEY: undefined,
        CORE_DEFAULT_PROVIDER: "vowel-prime",
      });

      try {
        const bearer = await createBearerApiKey();
        const res = await postGenerateToken(
          baseTokenRequest({ appId: bearer.appId }),
          bearer.plaintext
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.message).toContain(
          "No API key for vowel-prime"
        );
      } finally {
        restoreEnv();
      }
    });

    test("keeps browser session config out of the vowel-prime token payload", async () => {
      const restoreEnv = setEnv({
        VOWEL_ENGINE_API_KEY: "dev-test-vowel-engine-key",
        OPENAI_API_KEY: undefined,
        XAI_API_KEY: undefined,
      });

      const bearer = await createBearerApiKey();
      const originalFetch = globalThis.fetch;
      let capturedRequestBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (_input, init) => {
        capturedRequestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            client_secret: {
              value: "test-vowel-prime-secret",
              expires_at: Math.floor(Date.now() / 1000) + 300,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }) as typeof fetch;

      try {
        const res = await postGenerateToken(
          baseTokenRequest({
            config: {
              provider: "vowel-prime",
              routes: [
                { path: "/products", description: "Browse products" },
              ],
              actions: {
                navigate: {
                  description: "Navigate to a route",
                  parameters: {
                    path: {
                      type: "string",
                      description: "The path to navigate to",
                    },
                  },
                },
                addToCart: {
                  description: "Add a product to cart",
                  parameters: {
                    productId: {
                      type: "string",
                      description: "The product identifier",
                    },
                  },
                },
              },
              systemInstructionOverride: "Custom instructions from client",
              voiceConfig: {
                provider: "vowel-prime",
                model: "openai/gpt-oss-120b",
                voice: "Timothy",
                llmProvider: "groq",
                turnDetection: {
                  mode: "server_vad",
                  serverVAD: {
                    threshold: 0.5,
                    silenceDurationMs: 550,
                  },
                },
              },
            },
          }),
          bearer.plaintext
        );

        expect(res.status).toBe(200);
        expect(capturedRequestBody).toBeDefined();
        expect(capturedRequestBody).toMatchObject({
          model: "openai/gpt-oss-120b",
          voice: "Timothy",
          llmProvider: "groq",
          turnDetection: {
            mode: "server_vad",
            serverVAD: {
              threshold: 0.5,
              silenceDurationMs: 550,
            },
          },
        });
        expect(capturedRequestBody?.instructions).toBeUndefined();
        expect(capturedRequestBody?.tools).toBeUndefined();

        const json = await res.json();
        expect(json).toMatchObject({
          tokenName: "test-vowel-prime-secret",
          model: "openai/gpt-oss-120b",
          provider: "vowel-prime",
          systemInstructions: "Custom instructions from client",
        });
        expect(json.metadata?.sessionConfigDeliveredViaClient).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
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

  describe("API key policy + preset management", () => {
    test("creates and revokes app-scoped publishable keys", async () => {
      const appRes = await app.fetch(
        new Request("http://localhost/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Policy App", description: "policy tests" }),
        })
      );
      expect(appRes.status).toBe(200);
      const appJson = await appRes.json();

      const createKeyRes = await app.fetch(
        new Request(`http://localhost/api/apps/${appJson.id}/api-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: "Policy key",
            scopes: ["mint_ephemeral"],
            allowedProviders: ["vowel-prime"],
            allowedEndpointPresets: ["staging"],
            defaultEndpointPreset: "staging",
          }),
        })
      );
      expect(createKeyRes.status).toBe(200);
      const keyJson = await createKeyRes.json();
      expect(typeof keyJson.plaintext).toBe("string");
      expect(keyJson.plaintext.startsWith("vkey_")).toBe(true);

      const listRes = await app.fetch(
        new Request(`http://localhost/api/apps/${appJson.id}/api-keys`)
      );
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(Array.isArray(listJson)).toBe(true);
      expect(listJson.length).toBeGreaterThan(0);

      const revealRes = await app.fetch(
        new Request(`http://localhost/api/apps/${appJson.id}/api-keys/${keyJson.id}/reveal`)
      );
      expect(revealRes.status).toBe(200);
      const revealJson = await revealRes.json();
      expect(revealJson).toEqual({ plaintext: keyJson.plaintext });

      const revokeRes = await app.fetch(
        new Request(`http://localhost/api/apps/${appJson.id}/api-keys/${keyJson.id}/revoke`, {
          method: "POST",
        })
      );
      expect(revokeRes.status).toBe(200);

      const tokenRes = await app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keyJson.plaintext}`,
          },
          body: JSON.stringify({
            appId: appJson.id,
            origin: "http://localhost",
            config: { provider: "vowel-prime" },
          }),
        })
      );
      expect(tokenRes.status).toBe(401);
    });

    test("supports custom endpoint preset CRUD and protects system presets", async () => {
      const createRes = await app.fetch(
        new Request("http://localhost/api/endpoint-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "custom-local",
            provider: "vowel-prime",
            httpUrl: "https://example.local",
            wsUrl: "wss://example.local/v1/realtime",
          }),
        })
      );
      expect(createRes.status).toBe(200);
      const created = await createRes.json();
      expect(created.name).toBe("custom-local");

      const patchRes = await app.fetch(
        new Request(`http://localhost/api/endpoint-presets/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "custom-local-2",
            httpUrl: "https://example2.local",
            wsUrl: "wss://example2.local/v1/realtime",
          }),
        })
      );
      expect(patchRes.status).toBe(200);
      const patched = await patchRes.json();
      expect(patched.name).toBe("custom-local-2");

      const listRes = await app.fetch(new Request("http://localhost/api/endpoint-presets"));
      const list = await listRes.json();
      const systemPreset = list.find((preset: any) => preset.isSystem === true);
      expect(systemPreset).toBeTruthy();

      const systemDeleteRes = await app.fetch(
        new Request(`http://localhost/api/endpoint-presets/${systemPreset.id}`, {
          method: "DELETE",
        })
      );
      expect(systemDeleteRes.status).toBe(400);

      const deleteRes = await app.fetch(
        new Request(`http://localhost/api/endpoint-presets/${created.id}`, {
          method: "DELETE",
        })
      );
      expect(deleteRes.status).toBe(200);
    });
  });

  describe("Token policy enforcement", () => {
    test("returns 403 when provider is not allowed by publishable key policy", async () => {
      const appRecord = createApp({
        name: "Provider policy app",
      });
      const key = await createApiKey({
        appId: appRecord.id,
        scopes: ["mint_ephemeral"],
        allowedProviders: ["vowel-prime"],
        allowedEndpointPresets: ["staging"],
      });

      const res = await app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.plaintext}`,
          },
          body: JSON.stringify({
            appId: appRecord.id,
            origin: "http://localhost",
            config: {
              provider: "openai",
            },
          }),
        })
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain("not allowed");
    });

    test("uses the API key app when appId is omitted", async () => {
      const appRecord = createApp({
        name: "Implicit app policy app",
      });
      const key = await createApiKey({
        appId: appRecord.id,
        scopes: ["mint_ephemeral"],
        allowedProviders: ["openai"],
      });

      const previousOpenAiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "dev-test-openai-key";

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            value: "test-client-secret",
            expires_at: Math.floor(Date.now() / 1000) + 300,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )) as typeof fetch;

      try {
        const res = await app.fetch(
          new Request("http://localhost/vowel/api/generateToken", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key.plaintext}`,
            },
            body: JSON.stringify({
              origin: "http://localhost",
              config: {
                provider: "openai",
              },
            }),
          })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({
          provider: "openai",
          tokenName: "test-client-secret",
        });
      } finally {
        globalThis.fetch = originalFetch;
        if (previousOpenAiKey === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = previousOpenAiKey;
        }
      }
    });

    test("returns 403 when endpoint preset is not allowed by publishable key policy", async () => {
      const appRecord = createApp({
        name: "Preset policy app",
      });
      const key = await createApiKey({
        appId: appRecord.id,
        scopes: ["mint_ephemeral"],
        allowedProviders: ["vowel-prime"],
        allowedEndpointPresets: ["staging"],
      });

      const res = await app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.plaintext}`,
          },
          body: JSON.stringify({
            appId: appRecord.id,
            origin: "http://localhost",
            config: {
              provider: "vowel-prime",
              voiceConfig: {
                vowelPrimeConfig: {
                  endpointPreset: "dev",
                },
              },
            },
          }),
        })
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain("not allowed");
    });

    test("returns 400 when endpoint preset does not exist", async () => {
      const appRecord = createApp({
        name: "Unknown preset app",
      });
      const key = await createApiKey({
        appId: appRecord.id,
        scopes: ["mint_ephemeral"],
        allowedProviders: ["vowel-prime"],
        allowedEndpointPresets: ["not-real-preset"],
        defaultEndpointPreset: "not-real-preset",
      });

      const res = await app.fetch(
        new Request("http://localhost/vowel/api/generateToken", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.plaintext}`,
          },
          body: JSON.stringify({
            appId: appRecord.id,
            origin: "http://localhost",
            config: {
              provider: "vowel-prime",
              voiceConfig: {
                vowelPrimeConfig: {
                  endpointPreset: "not-real-preset",
                },
              },
            },
          }),
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("Unknown endpoint preset");
    });
  });
});
