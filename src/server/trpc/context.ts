/**
 * tRPC context
 * Handles Bearer token extraction and validation
 */

import { validateApiKey, type ApiKeyScope } from "../../db/api-keys";

export interface Context {
  apiKey: {
    id: string;
    appId: string;
    scopes: ApiKeyScope[];
  } | null;
}

/**
 * Create tRPC context from request
 * Extracts Bearer token and validates it
 */
export async function createContext({ req }: { req: Request }): Promise<Context> {
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { apiKey: null };
  }

  const token = authHeader.slice(7);
  const validation = await validateApiKey(token);

  if (!validation) {
    return { apiKey: null };
  }

  return {
    apiKey: {
      id: validation.id,
      appId: validation.appId,
      scopes: validation.scopes,
    },
  };
}
