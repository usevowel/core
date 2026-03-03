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
  type ApiKeyScope,
} from "../../../db/api-keys";

const scopeSchema = z.enum(["mint_ephemeral", "direct_ws"]);

export const apiKeysRouter = router({
  list: publicProcedure
    .input(z.object({ appId: z.string() }))
    .query(({ input }) => {
      return listApiKeys(input.appId);
    }),

  create: publicProcedure
    .input(
      z.object({
        appId: z.string(),
        scopes: z.array(scopeSchema),
        label: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createApiKey({
        appId: input.appId,
        scopes: input.scopes as ApiKeyScope[],
        label: input.label,
      });
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
