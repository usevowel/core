/**
 * Provider Keys tRPC router
 * CRUD operations for provider API keys
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  createProviderKey,
  listProviderKeys,
  deleteProviderKey,
  type ProviderType,
} from "../../../db/provider-keys";

const providerSchema = z.enum(["engine", "openai", "grok"]);

export const providerKeysRouter = router({
  list: publicProcedure
    .input(z.object({ appId: z.string() }))
    .query(({ input }) => {
      return listProviderKeys(input.appId);
    }),

  create: publicProcedure
    .input(
      z.object({
        appId: z.string(),
        provider: providerSchema,
        apiKey: z.string().min(1),
        label: z.string().optional(),
        vowelPrimeEnvironment: z.string().optional(),
        vowelPrimeWorkerUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createProviderKey({
        appId: input.appId,
        provider: input.provider as ProviderType,
        apiKey: input.apiKey,
        label: input.label,
        vowelPrimeEnvironment: input.vowelPrimeEnvironment,
        vowelPrimeWorkerUrl: input.vowelPrimeWorkerUrl,
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string(), appId: z.string() }))
    .mutation(({ input }) => {
      const deleted = deleteProviderKey(input.id, input.appId);
      if (!deleted) {
        throw new Error("Provider key not found");
      }
      return { ok: true };
    }),
});
