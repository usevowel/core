/**
 * API Keys tRPC router
 * CRUD operations for API keys (vkey_)
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  createApiKey,
  listApiKeys,
  deleteApiKey,
  revealApiKeyPlaintext,
  updateApiKey,
  revokeApiKey,
  type ApiKeyScope,
  type ApiKeyProvider,
} from "../../../db/api-keys";

const scopeSchema = z.enum(["mint_ephemeral", "direct_ws"]);
const providerSchema = z.enum(["vowel-core", "vowel-prime", "openai", "grok"]);

export const apiKeysRouter = router({
  list: publicProcedure
    .input(z.object({ appId: z.string() }))
    .query(async ({ input }) => {
      return await listApiKeys(input.appId);
    }),

  create: publicProcedure
    .input(
      z.object({
        appId: z.string(),
        scopes: z.array(scopeSchema),
        label: z.string().optional(),
        allowedProviders: z.array(providerSchema).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createApiKey({
        appId: input.appId,
        scopes: input.scopes as ApiKeyScope[],
        label: input.label,
        allowedProviders: input.allowedProviders as ApiKeyProvider[] | undefined,
      });
    }),

  reveal: publicProcedure
    .input(z.object({ id: z.string(), appId: z.string() }))
    .query(async ({ input }) => {
      const plaintext = await revealApiKeyPlaintext(input.id, input.appId);
      if (!plaintext) {
        throw new Error("API key not found");
      }
      return { plaintext };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        appId: z.string(),
        scopes: z.array(scopeSchema).optional(),
        label: z.string().optional(),
        allowedProviders: z.array(providerSchema).optional(),
      })
    )
    .mutation(({ input }) => {
      const updated = updateApiKey(input.id, input.appId, {
        scopes: input.scopes as ApiKeyScope[] | undefined,
        label: input.label,
        allowedProviders: input.allowedProviders as ApiKeyProvider[] | undefined,
      });
      if (!updated) {
        throw new Error("API key not found");
      }
      return updated;
    }),

  revoke: publicProcedure
    .input(z.object({ id: z.string(), appId: z.string() }))
    .mutation(({ input }) => {
      const revoked = revokeApiKey(input.id, input.appId);
      if (!revoked) {
        throw new Error("API key not found or already revoked");
      }
      return { ok: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string(), appId: z.string() }))
    .mutation(({ input }) => {
      const deleted = deleteApiKey(input.id, input.appId);
      if (!deleted) {
        throw new Error("API key not found");
      }
      return { ok: true };
    }),
});
