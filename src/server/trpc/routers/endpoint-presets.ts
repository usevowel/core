/**
 * Endpoint preset tRPC router
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  createEndpointPreset,
  deleteEndpointPreset,
  listEndpointPresets,
  updateEndpointPreset,
  type EndpointProvider,
} from "../../../db/endpoint-presets";

const providerSchema = z.enum(["vowel-prime", "openai", "grok"]);

export const endpointPresetsRouter = router({
  list: publicProcedure
    .input(z.object({ provider: providerSchema.optional() }).optional())
    .query(({ input }) => {
      return listEndpointPresets(input?.provider as EndpointProvider | undefined);
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        provider: providerSchema,
        httpUrl: z.string().min(1),
        wsUrl: z.string().min(1),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      return createEndpointPreset({
        ...input,
        provider: input.provider as EndpointProvider,
        isSystem: false,
      });
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        httpUrl: z.string().optional(),
        wsUrl: z.string().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const updated = updateEndpointPreset(input.id, {
        name: input.name,
        httpUrl: input.httpUrl,
        wsUrl: input.wsUrl,
        enabled: input.enabled,
      });
      if (!updated) {
        throw new Error("Endpoint preset not found");
      }
      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const deleted = deleteEndpointPreset(input.id);
      if (!deleted) {
        throw new Error("Endpoint preset not found");
      }
      return { ok: true };
    }),
});
