/**
 * tRPC initialization
 * Sets up the tRPC router with context
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure that requires Bearer auth
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.apiKey) {
    throw new Error("Unauthorized: Bearer token required");
  }
  return next({
    ctx: {
      ...ctx,
      apiKey: ctx.apiKey,
    },
  });
});
