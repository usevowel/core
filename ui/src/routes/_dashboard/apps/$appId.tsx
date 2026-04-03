import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Key,
  RefreshCw,
  Trash2,
  Ban,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowLeft,
} from "lucide-react";
import { useEffect, useState } from "react";

const PROVIDERS = ["engine", "openai", "grok"] as const;

interface App {
  id: string;
  name: string;
  description?: string;
  defaultProvider?: string;
  runtimeConfig?: Record<string, unknown> | null;
  createdAt?: number;
}

interface ApiKey {
  id: string;
  scopes: string[];
  label: string | null;
  masked: string;
  allowedProviders: string[];
  revokedAt: number | null;
  createdAt: number;
}

type CoreProvider = (typeof PROVIDERS)[number];
type TurnDetectionMode = "server_vad" | "client_vad" | "disabled";
type TurnDetectionPreset = "aggressive" | "balanced" | "conservative";

interface RuntimeConfigDraft {
  provider: CoreProvider;
  systemInstructionOverride: string;
  model: string;
  voice: string;
  language: string;
  speakingRate: string;
  llmProvider: "" | "groq" | "openrouter";
  openrouterProvider: string;
  openrouterSiteUrl: string;
  openrouterAppName: string;
  initialGreetingPrompt: string;
  turnDetectionPreset: "" | TurnDetectionPreset;
  turnDetectionMode: "" | TurnDetectionMode;
  clientVADAdapter: string;
  clientVADAutoCommit: boolean;
  serverVADThreshold: string;
  serverVADPrefixPaddingMs: string;
  serverVADSilenceDurationMs: string;
}

const DEFAULT_RUNTIME_DRAFT: RuntimeConfigDraft = {
  provider: "engine",
  systemInstructionOverride: "",
  model: "",
  voice: "",
  language: "",
  speakingRate: "",
  llmProvider: "",
  openrouterProvider: "",
  openrouterSiteUrl: "",
  openrouterAppName: "",
  initialGreetingPrompt: "",
  turnDetectionPreset: "",
  turnDetectionMode: "",
  clientVADAdapter: "silero-vad",
  clientVADAutoCommit: true,
  serverVADThreshold: "",
  serverVADPrefixPaddingMs: "",
  serverVADSilenceDurationMs: "",
};

const MANAGED_RUNTIME_KEYS = new Set(["provider", "systemInstructionOverride", "voiceConfig"]);
const MANAGED_VOICE_KEYS = new Set([
  "model",
  "voice",
  "language",
  "speakingRate",
  "llmProvider",
  "openrouterOptions",
  "initialGreetingPrompt",
  "turnDetectionPreset",
  "turnDetection",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumberString(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function normalizeProvider(value: unknown): CoreProvider {
  switch (value) {
    case "engine":
    case "openai":
    case "grok":
      return value;
    case "vowel-core":
    case "vowel-prime":
      return "engine";
    default:
      return "engine";
  }
}

function providerLabel(provider: CoreProvider): string {
  switch (provider) {
    case "engine":
      return "Vowel Engine";
    case "openai":
      return "OpenAI Realtime";
    case "grok":
      return "Grok Realtime";
  }
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => cleanValue(item))
      .filter((item) => item !== undefined);
    return items;
  }
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleaned = cleanValue(entry);
      if (cleaned !== undefined) {
        next[key] = cleaned;
      }
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }
  return value;
}

function getRuntimeConfigExtras(runtimeConfig: Record<string, unknown> | null | undefined): {
  runtimeExtras: Record<string, unknown>;
  voiceExtras: Record<string, unknown>;
} {
  if (!runtimeConfig) {
    return { runtimeExtras: {}, voiceExtras: {} };
  }

  const runtimeExtras = Object.fromEntries(
    Object.entries(runtimeConfig).filter(([key]) => !MANAGED_RUNTIME_KEYS.has(key))
  );

  const voiceConfig = isRecord(runtimeConfig.voiceConfig) ? runtimeConfig.voiceConfig : null;
  const voiceExtras = voiceConfig
    ? Object.fromEntries(Object.entries(voiceConfig).filter(([key]) => !MANAGED_VOICE_KEYS.has(key)))
    : {};

  return { runtimeExtras, voiceExtras };
}

function runtimeConfigToDraft(runtimeConfig: Record<string, unknown> | null | undefined): RuntimeConfigDraft {
  const voiceConfig = isRecord(runtimeConfig?.voiceConfig) ? runtimeConfig.voiceConfig : null;
  const openrouterOptions = isRecord(voiceConfig?.openrouterOptions) ? voiceConfig.openrouterOptions : null;
  const turnDetection = isRecord(voiceConfig?.turnDetection) ? voiceConfig.turnDetection : null;
  const clientVAD = isRecord(turnDetection?.clientVAD) ? turnDetection.clientVAD : null;
  const serverVAD = isRecord(turnDetection?.serverVAD) ? turnDetection.serverVAD : null;

  const provider = runtimeConfig?.provider;
  const turnDetectionPreset = voiceConfig?.turnDetectionPreset;
  const turnDetectionMode = turnDetection?.mode;
  const llmProvider = voiceConfig?.llmProvider;

  return {
    ...DEFAULT_RUNTIME_DRAFT,
    provider: normalizeProvider(provider),
    systemInstructionOverride: readString(runtimeConfig?.systemInstructionOverride),
    model: readString(voiceConfig?.model),
    voice: readString(voiceConfig?.voice),
    language: readString(voiceConfig?.language),
    speakingRate: readNumberString(voiceConfig?.speakingRate),
    llmProvider:
      llmProvider === "groq" || llmProvider === "openrouter"
        ? llmProvider
        : "",
    openrouterProvider: readString(openrouterOptions?.provider),
    openrouterSiteUrl: readString(openrouterOptions?.siteUrl),
    openrouterAppName: readString(openrouterOptions?.appName),
    initialGreetingPrompt: readString(voiceConfig?.initialGreetingPrompt),
    turnDetectionPreset:
      turnDetectionPreset === "aggressive" ||
      turnDetectionPreset === "balanced" ||
      turnDetectionPreset === "conservative"
        ? turnDetectionPreset
        : "",
    turnDetectionMode:
      turnDetectionMode === "server_vad" ||
      turnDetectionMode === "client_vad" ||
      turnDetectionMode === "disabled"
        ? turnDetectionMode
        : "",
    clientVADAdapter: readString(clientVAD?.adapter) || "silero-vad",
    clientVADAutoCommit:
      typeof clientVAD?.autoCommit === "boolean"
        ? clientVAD.autoCommit
        : DEFAULT_RUNTIME_DRAFT.clientVADAutoCommit,
    serverVADThreshold: readNumberString(serverVAD?.threshold),
    serverVADPrefixPaddingMs: readNumberString(serverVAD?.prefixPaddingMs),
    serverVADSilenceDurationMs: readNumberString(serverVAD?.silenceDurationMs),
  };
}

function buildRuntimeConfigPreview(
  draft: RuntimeConfigDraft,
  runtimeConfig: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const { runtimeExtras, voiceExtras } = getRuntimeConfigExtras(runtimeConfig);

  const turnDetection =
    draft.turnDetectionMode === "server_vad"
      ? cleanValue({
          mode: "server_vad",
          serverVAD: {
            threshold: parseOptionalNumber(draft.serverVADThreshold),
            prefixPaddingMs: parseOptionalNumber(draft.serverVADPrefixPaddingMs),
            silenceDurationMs: parseOptionalNumber(draft.serverVADSilenceDurationMs),
          },
        })
      : draft.turnDetectionMode === "client_vad"
        ? cleanValue({
            mode: "client_vad",
            clientVAD: {
              adapter: draft.clientVADAdapter,
              autoCommit: draft.clientVADAutoCommit,
            },
          })
        : draft.turnDetectionMode === "disabled"
          ? { mode: "disabled" }
          : undefined;

  const nextConfig = cleanValue({
    ...runtimeExtras,
    provider: draft.provider,
    systemInstructionOverride: draft.systemInstructionOverride,
    voiceConfig: {
      ...voiceExtras,
      model: draft.model,
      voice: draft.voice,
      language: draft.language,
      speakingRate: parseOptionalNumber(draft.speakingRate),
      llmProvider: draft.llmProvider || undefined,
      openrouterOptions:
        draft.llmProvider === "openrouter"
          ? {
              provider: draft.openrouterProvider,
              siteUrl: draft.openrouterSiteUrl,
              appName: draft.openrouterAppName,
            }
          : undefined,
      initialGreetingPrompt: draft.initialGreetingPrompt,
      turnDetectionPreset: draft.turnDetectionPreset || undefined,
      turnDetection,
    },
  });

  return (isRecord(nextConfig) ? nextConfig : {}) as Record<string, unknown>;
}

export const Route = createFileRoute("/_dashboard/apps/$appId")({
  component: AppDetailPage,
});

function AppDetailPage() {
  const { appId } = Route.useParams();
  const [app, setApp] = useState<App | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [scopeMintEphemeral, setScopeMintEphemeral] = useState(true);
  const [scopeDirectWs, setScopeDirectWs] = useState(false);
  const [allowedProviders, setAllowedProviders] = useState<string[]>(["engine"]);
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeConfigDraft>(DEFAULT_RUNTIME_DRAFT);
  const [runtimeConfigText, setRuntimeConfigText] = useState("{}");
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);
  const [revealedByKeyId, setRevealedByKeyId] = useState<Record<string, string>>({});
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const loadApp = async () => {
    const res = await fetch(`/api/apps/${appId}`);
    if (!res.ok) {
      throw new Error(`Failed to load app (${res.status})`);
    }
    const data = (await res.json()) as App;
    setApp(data);
    setRuntimeDraft(runtimeConfigToDraft(data.runtimeConfig));
    setRuntimeConfigText(JSON.stringify(data.runtimeConfig ?? {}, null, 2));
    return data;
  };

  const loadKeys = async () => {
    const res = await fetch(`/api/apps/${appId}/api-keys`);
    if (!res.ok) {
      throw new Error(`Failed to load API keys (${res.status})`);
    }
    const data = (await res.json()) as ApiKey[];
    setKeys(data);
    return data;
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadApp();
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load app");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [appId]);

  const openCreateKeyDialog = () => {
    setCreatedPlaintextKey(null);
    setNewKeyLabel("");
    setScopeMintEphemeral(true);
    setScopeDirectWs(false);
    setAllowedProviders(["engine"]);
    setCreateKeyOpen(true);
  };

  const toggleAllowedProvider = (provider: string) => {
    setAllowedProviders((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider]
    );
  };

  const runtimeConfigPreview = buildRuntimeConfigPreview(runtimeDraft, app?.runtimeConfig ?? null);

  const tokenPayloadPreview = {
    provider: runtimeDraft.provider,
    model: runtimeDraft.model || undefined,
    voice: runtimeDraft.voice || undefined,
    llmProvider: runtimeDraft.llmProvider || undefined,
    openrouterProvider:
      runtimeDraft.llmProvider === "openrouter" ? runtimeDraft.openrouterProvider || undefined : undefined,
    openrouterSiteUrl:
      runtimeDraft.llmProvider === "openrouter" ? runtimeDraft.openrouterSiteUrl || undefined : undefined,
    openrouterAppName:
      runtimeDraft.llmProvider === "openrouter" ? runtimeDraft.openrouterAppName || undefined : undefined,
    speakingRate: parseOptionalNumber(runtimeDraft.speakingRate),
    initialGreetingPrompt: runtimeDraft.initialGreetingPrompt || undefined,
    turnDetectionPreset: runtimeDraft.turnDetectionPreset || undefined,
    turnDetection: isRecord(runtimeConfigPreview.voiceConfig)
      ? (runtimeConfigPreview.voiceConfig.turnDetection as unknown)
      : undefined,
    systemInstructionOverride: runtimeDraft.systemInstructionOverride || undefined,
  };

  const applyDryRunToJsonEditor = () => {
    setRuntimeConfigText(JSON.stringify(runtimeConfigPreview, null, 2));
  };

  const persistRuntimeConfig = async (runtimeConfig: Record<string, unknown>) => {
    const res = await fetch(`/api/apps/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtimeConfig }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to save runtime config (${res.status})`);
      return null;
    }

    const updated = (await res.json()) as App;
    setApp(updated);
    setRuntimeDraft(runtimeConfigToDraft(updated.runtimeConfig));
    setRuntimeConfigText(JSON.stringify(updated.runtimeConfig ?? {}, null, 2));
    return updated;
  };

  const saveGuidedRuntimeConfig = async () => {
    setError(null);
    await persistRuntimeConfig(runtimeConfigPreview);
  };

  const submitCreateKey = async () => {
    setError(null);

    const scopes = [
      scopeMintEphemeral ? "mint_ephemeral" : null,
      scopeDirectWs ? "direct_ws" : null,
    ].filter(Boolean);

    if (scopes.length === 0) {
      setError("Select at least one key scope.");
      return;
    }

    if (allowedProviders.length === 0) {
      setError("Select at least one allowed provider.");
      return;
    }

    const res = await fetch(`/api/apps/${appId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newKeyLabel || undefined,
        scopes,
        allowedProviders,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to create API key (${res.status})`);
      return;
    }

    const data = await res.json();
    setCreatedPlaintextKey(data.plaintext ?? null);
    await loadKeys();
  };

  const saveRuntimeConfig = async () => {
    setError(null);

    let parsed: Record<string, unknown>;
    try {
      const value = runtimeConfigText.trim();
      if (!value) {
        throw new Error("Runtime config JSON cannot be empty.");
      }
      const json = JSON.parse(value) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Runtime config must be a JSON object.");
      }
      parsed = json as Record<string, unknown>;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid runtime config JSON");
      return;
    }

    await persistRuntimeConfig(parsed);
  };

  const revokeKey = async (keyId: string) => {
    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}/revoke`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to revoke key (${res.status})`);
      return;
    }
    await loadKeys();
  };

  const removeKey = async (keyId: string) => {
    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to delete key (${res.status})`);
      return;
    }
    await loadKeys();
  };

  const toggleKeyVisibility = async (keyId: string) => {
    if (visibleKeyIds[keyId]) {
      setVisibleKeyIds((prev) => ({ ...prev, [keyId]: false }));
      return;
    }

    if (revealedByKeyId[keyId]) {
      setVisibleKeyIds((prev) => ({ ...prev, [keyId]: true }));
      return;
    }

    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}/reveal`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to reveal key (${res.status})`);
      return;
    }
    const data = (await res.json()) as { plaintext?: string };
    if (!data.plaintext) {
      setError("No plaintext returned for this key.");
      return;
    }
    setRevealedByKeyId((prev) => ({ ...prev, [keyId]: data.plaintext as string }));
    setVisibleKeyIds((prev) => ({ ...prev, [keyId]: true }));
  };

  const ensureRevealed = async (keyId: string): Promise<string | null> => {
    if (revealedByKeyId[keyId]) return revealedByKeyId[keyId];
    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}/reveal`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to reveal key (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { plaintext?: string };
    if (!data.plaintext) {
      setError("No plaintext returned for this key.");
      return null;
    }
    setRevealedByKeyId((prev) => ({ ...prev, [keyId]: data.plaintext as string }));
    setVisibleKeyIds((prev) => ({ ...prev, [keyId]: true }));
    return data.plaintext;
  };

  const copyKeyToClipboard = async (keyId: string) => {
    const plaintext = await ensureRevealed(keyId);
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  if (loading && !app) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm text-muted-foreground">Loading app…</p>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Link to="/apps" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to apps
          </Link>
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error || "App not found"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Link to="/apps" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to apps
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{app.name}</h1>
            <p className="text-muted-foreground">{app.description || "No description"}</p>
            <p className="font-mono text-xs text-muted-foreground">{app.id}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreateKeyDialog}>
              <Key className="mr-2 h-4 w-4" />
              Create key
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Voice settings</CardTitle>
            <CardDescription>
              Choose how your assistant connects, speaks, and responds. Use the Advanced tab for direct JSON editing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="connection" className="w-full">
              <TabsList className="grid w-full grid-cols-5 sm:w-auto sm:inline-flex">
                <TabsTrigger value="connection">Connection</TabsTrigger>
                <TabsTrigger value="behavior">Behavior</TabsTrigger>
                <TabsTrigger value="detection">Turn detection</TabsTrigger>
                <TabsTrigger value="preview">Review</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="connection" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Connection</CardTitle>
                    <CardDescription>
                      Select the realtime provider, default model, and voice for this app.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select
                        value={runtimeDraft.provider}
                        onValueChange={(value) =>
                          setRuntimeDraft((prev) => ({ ...prev, provider: value as CoreProvider }))
                        }
                      >
                        <SelectTrigger className="w-full sm:w-[280px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="engine">Vowel Engine</SelectItem>
                          <SelectItem value="openai">OpenAI Realtime</SelectItem>
                          <SelectItem value="grok">Grok Realtime</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Input
                          value={runtimeDraft.model}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, model: event.target.value }))
                          }
                          placeholder="openai/gpt-oss-20b"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Voice</Label>
                        <Input
                          value={runtimeDraft.voice}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, voice: event.target.value }))
                          }
                          placeholder="Ashley"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Language model provider</Label>
                        <Select
                          value={runtimeDraft.llmProvider || "__default__"}
                          onValueChange={(value) =>
                            setRuntimeDraft((prev) => ({
                              ...prev,
                              llmProvider:
                                value === "__default__"
                                  ? ""
                                  : (value as RuntimeConfigDraft["llmProvider"]),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Use recommended default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Use recommended default</SelectItem>
                            <SelectItem value="groq">groq</SelectItem>
                            <SelectItem value="openrouter">openrouter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <Input
                          value={runtimeDraft.language}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, language: event.target.value }))
                          }
                          placeholder="en"
                        />
                      </div>
                    </div>

                    {runtimeDraft.llmProvider === "openrouter" && (
                      <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4">
                        <div className="space-y-2">
                          <Label>OpenRouter provider</Label>
                          <Input
                            value={runtimeDraft.openrouterProvider}
                            onChange={(event) =>
                              setRuntimeDraft((prev) => ({ ...prev, openrouterProvider: event.target.value }))
                            }
                            placeholder="anthropic"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>OpenRouter site URL</Label>
                            <Input
                              value={runtimeDraft.openrouterSiteUrl}
                              onChange={(event) =>
                                setRuntimeDraft((prev) => ({ ...prev, openrouterSiteUrl: event.target.value }))
                              }
                              placeholder="https://vowel.to"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>OpenRouter app name</Label>
                            <Input
                              value={runtimeDraft.openrouterAppName}
                              onChange={(event) =>
                                setRuntimeDraft((prev) => ({ ...prev, openrouterAppName: event.target.value }))
                              }
                              placeholder="vowel core"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="behavior" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Assistant behavior</CardTitle>
                      <CardDescription>
                        Control how the assistant introduces itself and how it should behave during a conversation.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>System instructions</Label>
                        <Textarea
                          className="min-h-[180px]"
                          value={runtimeDraft.systemInstructionOverride}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, systemInstructionOverride: event.target.value }))
                          }
                          placeholder="You are the voice assistant for this app..."
                          spellCheck={false}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Initial greeting prompt</Label>
                        <Textarea
                          className="min-h-[110px]"
                          value={runtimeDraft.initialGreetingPrompt}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, initialGreetingPrompt: event.target.value }))
                          }
                          placeholder="Introduce yourself as the app assistant and offer help."
                          spellCheck={false}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Speaking style</CardTitle>
                      <CardDescription>
                        Fine-tune how quickly the assistant responds and how fast it speaks.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Speaking rate</Label>
                        <Input
                          value={runtimeDraft.speakingRate}
                          onChange={(event) =>
                            setRuntimeDraft((prev) => ({ ...prev, speakingRate: event.target.value }))
                          }
                          placeholder="1.2"
                        />
                      </div>

                      <div className="space-y-2">
                          <Label>Response timing preset</Label>
                        <Select
                          value={runtimeDraft.turnDetectionPreset || "__default__"}
                          onValueChange={(value) =>
                            setRuntimeDraft((prev) => ({
                              ...prev,
                              turnDetectionPreset:
                                value === "__default__"
                                  ? ""
                                  : (value as RuntimeConfigDraft["turnDetectionPreset"]),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Use recommended default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Use recommended default</SelectItem>
                            <SelectItem value="aggressive">aggressive</SelectItem>
                            <SelectItem value="balanced">balanced</SelectItem>
                            <SelectItem value="conservative">conservative</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Tip: use a balanced turn detection preset for most experiences, then adjust only if conversations feel too fast or too slow.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="detection" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Turn detection</CardTitle>
                      <CardDescription>
                        Decide how the assistant detects when a user has finished speaking.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                            <Label>Detection mode</Label>
                        <Select
                          value={runtimeDraft.turnDetectionMode || "__default__"}
                          onValueChange={(value) =>
                            setRuntimeDraft((prev) => ({
                              ...prev,
                              turnDetectionMode:
                                value === "__default__"
                                  ? ""
                                  : (value as RuntimeConfigDraft["turnDetectionMode"]),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Use recommended default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Use recommended default</SelectItem>
                            <SelectItem value="server_vad">server_vad</SelectItem>
                            <SelectItem value="client_vad">client_vad</SelectItem>
                            <SelectItem value="disabled">disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {runtimeDraft.turnDetectionMode === "server_vad" && (
                        <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Threshold</Label>
                            <Input
                              value={runtimeDraft.serverVADThreshold}
                              onChange={(event) =>
                                setRuntimeDraft((prev) => ({ ...prev, serverVADThreshold: event.target.value }))
                              }
                              placeholder="0.5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Prefix padding ms</Label>
                            <Input
                              value={runtimeDraft.serverVADPrefixPaddingMs}
                              onChange={(event) =>
                                setRuntimeDraft((prev) => ({ ...prev, serverVADPrefixPaddingMs: event.target.value }))
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Silence duration ms</Label>
                            <Input
                              value={runtimeDraft.serverVADSilenceDurationMs}
                              onChange={(event) =>
                                setRuntimeDraft((prev) => ({ ...prev, serverVADSilenceDurationMs: event.target.value }))
                              }
                              placeholder="550"
                            />
                          </div>
                        </div>
                      )}

                      {runtimeDraft.turnDetectionMode === "client_vad" && (
                        <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Client VAD adapter</Label>
                            <Select
                              value={runtimeDraft.clientVADAdapter}
                              onValueChange={(value) =>
                                setRuntimeDraft((prev) => ({ ...prev, clientVADAdapter: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="silero-vad">silero-vad</SelectItem>
                                <SelectItem value="simple">simple</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                              <Checkbox
                                checked={runtimeDraft.clientVADAutoCommit}
                                onCheckedChange={(checked) =>
                                  setRuntimeDraft((prev) => ({
                                    ...prev,
                                    clientVADAutoCommit: checked === true,
                                  }))
                                }
                              />
                              Auto-commit client turns
                            </label>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">What these settings do</CardTitle>
                      <CardDescription>
                        Choose the mode that best matches your experience.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <div className="rounded-lg border border-border bg-muted/20 p-4">
                        <span className="font-medium text-foreground">Server VAD</span>
                        waits for the service to detect the end of speech and is a good default for most hosted voice sessions.
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-4">
                        <span className="font-medium text-foreground">Client VAD</span>
                        detects turns in the browser and can feel more immediate for interactive interfaces.
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-4">
                        <span className="font-medium text-foreground">Disabled</span>
                        gives you the most manual control and is useful when your app manages turn timing another way.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Settings preview</CardTitle>
                      <CardDescription>
                        Review the settings that will be saved for this app.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-muted/20 p-3 text-xs leading-6">
                        {JSON.stringify(runtimeConfigPreview, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Session preview</CardTitle>
                      <CardDescription>
                        Review the session values that will be used when this app starts a voice session.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-muted/20 p-3 text-xs leading-6">
                        {JSON.stringify(tokenPayloadPreview, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Advanced settings</CardTitle>
                    <CardDescription>
                      Edit the raw configuration directly if you need options that are not available in the form.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      className="min-h-[320px] font-mono text-sm"
                      value={runtimeConfigText}
                      onChange={(event) => setRuntimeConfigText(event.target.value)}
                      spellCheck={false}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void saveRuntimeConfig()}>Save advanced settings</Button>
                      <Button variant="outline" onClick={applyDryRunToJsonEditor}>
                        Reset to guided settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => void saveGuidedRuntimeConfig()}>Save changes</Button>
              <Button
                variant="outline"
                onClick={() => setRuntimeDraft(runtimeConfigToDraft(app.runtimeConfig))}
              >
                Restore saved settings
              </Button>
            </div>
          </CardContent>
        </Card>


        <Dialog open={createKeyOpen} onOpenChange={setCreateKeyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create publishable key</DialogTitle>
              <DialogDescription>
                Use publishable keys in your client app to start voice sessions securely.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={newKeyLabel}
                  onChange={(event) => setNewKeyLabel(event.target.value)}
                  placeholder="e.g. Demo key"
                />
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={scopeMintEphemeral}
                      onCheckedChange={(checked) => setScopeMintEphemeral(checked === true)}
                    />
                    Generate session tokens
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={scopeDirectWs}
                      onCheckedChange={(checked) => setScopeDirectWs(checked === true)}
                    />
                    Direct WebSocket access
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Allowed providers</Label>
                <div className="flex flex-wrap gap-2 text-sm">
                  {PROVIDERS.map((provider) => (
                    <label key={provider} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                      <Checkbox
                        checked={allowedProviders.includes(provider)}
                        onCheckedChange={() => toggleAllowedProvider(provider)}
                      />
                      {providerLabel(provider)}
                    </label>
                  ))}
                </div>
              </div>

              {createdPlaintextKey && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                  <p className="font-medium text-emerald-300">Publishable key:</p>
                  <p className="mt-1 font-mono break-all text-emerald-100">{createdPlaintextKey}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateKeyOpen(false)}>
                Close
              </Button>
              <Button onClick={() => void submitCreateKey()}>Create key</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Publishable keys for this app. Revoke a key at any time to stop new sessions from starting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading keys…</p>
            ) : keys.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Key className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No API keys yet</h3>
                <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                  Create your first publishable key to connect your client app.
                </p>
                <Button className="mt-4" onClick={openCreateKeyDialog}>
                  <Key className="mr-2 h-4 w-4" />
                  Create key
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => {
                  const isRevealed = visibleKeyIds[key.id];
                  const plaintext = revealedByKeyId[key.id];
                  const displayValue = isRevealed ? (plaintext ?? key.masked) : key.masked;
                  return (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{key.label || "Unnamed key"}</p>
                            {key.revokedAt ? (
                              <Badge variant="destructive">Revoked</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Providers: {key.allowedProviders
                              .map((provider) => normalizeProvider(provider))
                              .map((provider) => providerLabel(provider))
                              .join(", ")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={Boolean(key.revokedAt)}
                            onClick={() => void revokeKey(key.id)}
                          >
                            <Ban className="mr-1 h-4 w-4" />
                            Revoke
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void removeKey(key.id)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>


                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-muted font-mono text-xs break-all select-all border border-border">
                          {displayValue}
                        </code>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => void toggleKeyVisibility(key.id)}
                            disabled={Boolean(key.revokedAt)}
                            title={isRevealed ? "Hide key" : "Reveal key"}
                          >
                            {isRevealed ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => void copyKeyToClipboard(key.id)}
                            disabled={Boolean(key.revokedAt)}
                            title="Copy key (reveals if hidden)"
                          >
                            {copiedKeyId === key.id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
