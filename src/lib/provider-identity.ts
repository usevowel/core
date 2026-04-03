/**
 * Shared provider identity helpers for self-hosted core.
 *
 * Core models the self-hosted realtime backend as `engine` internally.
 * Legacy client-facing aliases like `vowel-core` and `vowel-prime` are
 * accepted for compatibility and normalized onto that engine target.
 */

export type CoreBackendProvider = "engine" | "openai" | "grok";
export type CoreProviderAlias = "vowel-core" | "vowel-prime";
export type CoreProviderInput = CoreBackendProvider | CoreProviderAlias;
export type ClientTokenProvider = "vowel-core" | "openai" | "grok";

export const CORE_BACKEND_PROVIDERS = ["engine", "openai", "grok"] as const;

export function normalizeCoreProvider(provider: unknown): CoreBackendProvider | undefined {
  switch (provider) {
    case "engine":
    case "openai":
    case "grok":
      return provider;
    case "vowel-core":
    case "vowel-prime":
      return "engine";
    default:
      return undefined;
  }
}

export function toClientTokenProvider(provider: CoreBackendProvider): ClientTokenProvider {
  return provider === "engine" ? "vowel-core" : provider;
}

export function getCoreProviderLabel(provider: CoreBackendProvider): string {
  switch (provider) {
    case "engine":
      return "Vowel Engine";
    case "openai":
      return "OpenAI Realtime";
    case "grok":
      return "Grok Realtime";
  }
}
