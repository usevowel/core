/**
 * Apps tRPC router
 * CRUD operations for apps
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  createApp,
  listApps,
  getApp,
  updateApp,
  deleteApp,
} from "../../../db/apps";

export const appsRouter = router({
  list: publicProcedure.query(() => {
    return listApps();
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const app = getApp(input.id);
      if (!app) {
        throw new Error("App not found");
      }
      return app;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        defaultProvider: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      return createApp(input);
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        defaultProvider: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      const app = updateApp(id, data);
      if (!app) {
        throw new Error("App not found");
      }
      return app;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const deleted = deleteApp(input.id);
      if (!deleted) {
        throw new Error("App not found");
      }
      return { ok: true };
    }),
});
