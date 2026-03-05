/**
 * Main tRPC router
 * Combines all sub-routers
 */

import { router } from "./trpc";
import { appsRouter } from "./routers/apps";
import { apiKeysRouter } from "./routers/api-keys";
import { providerKeysRouter } from "./routers/provider-keys";
import { endpointPresetsRouter } from "./routers/endpoint-presets";

export const appRouter = router({
  apps: appsRouter,
  apiKeys: apiKeysRouter,
  providerKeys: providerKeysRouter,
  endpointPresets: endpointPresetsRouter,
});

// Export type for client usage
export type AppRouter = typeof appRouter;
