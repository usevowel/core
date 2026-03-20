import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle,
  Cpu,
  Database,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Wand2,
  XCircle,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProviderStatus {
  configured: boolean;
  secretEnv: string;
}

interface EngineStatus {
  reachable: boolean;
  url: string | null;
  configPath?: string;
  configLastUpdated?: string;
  error?: string;
}

interface StatusResponse {
  providers: Record<string, ProviderStatus>;
  engine?: EngineStatus;
}

interface EngineConfigResponse {
  version: number;
  lastUpdated: string;
  path: string;
  config: Record<string, unknown>;
}

interface EnginePreset {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

const PROVIDER_OPTIONS = [
  { value: "vowel-prime", label: "Vowel Engine", icon: Bot },
  { value: "openai", label: "OpenAI Realtime", icon: Cpu },
  { value: "grok", label: "Grok Realtime", icon: Zap },
] as const;

export const Route = createFileRoute("/_dashboard/providers")({
  component: ProvidersPage,
});

function ProvidersPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [engineConfig, setEngineConfig] = useState<EngineConfigResponse | null>(null);
  const [presets, setPresets] = useState<EnginePreset[]>([]);
  const [editorValue, setEditorValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerStatus = status?.providers ?? {
    "vowel-prime": { configured: false, secretEnv: "SNDBRD_API_KEY" },
    openai: { configured: false, secretEnv: "OPENAI_API_KEY" },
    grok: { configured: false, secretEnv: "XAI_API_KEY" },
  };

  const engineStatus = status?.engine;

  const normalizedEditorValue = useMemo(() => editorValue.trim(), [editorValue]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const [statusRes, configRes, presetsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/engine/config"),
        fetch("/api/engine/presets"),
      ]);

      if (!statusRes.ok) {
        throw new Error(`Failed to load status (${statusRes.status})`);
      }

      const statusData = (await statusRes.json()) as StatusResponse;
      setStatus(statusData);

      if (!configRes.ok) {
        const configError = await configRes.json().catch(() => ({ message: "Request failed" }));
        throw new Error(configError.message || `Failed to load engine config (${configRes.status})`);
      }

      const configData = (await configRes.json()) as EngineConfigResponse;
      setEngineConfig(configData);
      setEditorValue(JSON.stringify(configData.config, null, 2));

      if (presetsRes.ok) {
        setPresets((await presetsRes.json()) as EnginePreset[]);
      } else {
        setPresets([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider settings");
      setStatus(null);
      setEngineConfig(null);
      setPresets([]);
      setEditorValue("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const parseEditorConfig = (): Record<string, unknown> => {
    if (!normalizedEditorValue) {
      throw new Error("Engine config JSON cannot be empty.");
    }

    const parsed = JSON.parse(normalizedEditorValue) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Engine config must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  };

  const validateConfig = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const config = parseEditorConfig();
      const res = await fetch("/api/engine/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      const data = await res.json().catch(() => ({ message: "Validation failed" }));
      if (!res.ok) {
        throw new Error(data.message || `Validation failed (${res.status})`);
      }

      setMessage("Engine config is valid.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate engine config");
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const config = parseEditorConfig();
      const res = await fetch("/api/engine/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      const data = await res.json().catch(() => ({ message: "Save failed" }));
      if (!res.ok) {
        throw new Error(data.message || `Save failed (${res.status})`);
      }

      const response = data as EngineConfigResponse;
      setEngineConfig(response);
      setEditorValue(JSON.stringify(response.config, null, 2));
      setMessage("Engine config saved.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save engine config");
    } finally {
      setSaving(false);
    }
  };

  const reloadConfig = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/engine/config/reload", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({ message: "Reload failed" }));
      if (!res.ok) {
        throw new Error(data.message || `Reload failed (${res.status})`);
      }

      const response = data as EngineConfigResponse;
      setEngineConfig(response);
      setEditorValue(JSON.stringify(response.config, null, 2));
      setMessage("Engine config reloaded from disk.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload engine config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Engine Config</h1>
            <p className="mt-1 text-muted-foreground">
              Core acts as a client of the self-hosted engine config API. The engine persists the canonical YAML on its Docker volume.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Provider secret status
              </CardTitle>
              <CardDescription>
                Provider secrets still come from environment variables. The engine runtime config is edited separately below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {PROVIDER_OPTIONS.map(({ value, label, icon: Icon }) => {
                  const state = providerStatus[value];
                  const configured = state?.configured ?? false;
                  return (
                    <div key={value} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">Env: {state?.secretEnv ?? "N/A"}</p>
                          <Badge variant={configured ? "success" : "secondary"} className="w-fit">
                            {configured ? (
                              <>
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Configured
                              </>
                            ) : (
                              <>
                                <XCircle className="mr-1 h-3 w-3" />
                                Not set
                              </>
                            )}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Engine status
              </CardTitle>
              <CardDescription>
                Connectivity and persisted config metadata for the self-hosted engine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={engineStatus?.reachable ? "success" : "secondary"}>
                  {engineStatus?.reachable ? "Reachable" : "Unavailable"}
                </Badge>
                <span className="text-muted-foreground">{engineStatus?.url ?? "No engine URL configured"}</span>
              </div>
              <div>
                <p className="font-medium">Config path</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {engineStatus?.configPath ?? engineConfig?.path ?? "Unavailable"}
                </p>
              </div>
              <div>
                <p className="font-medium">Last updated</p>
                <p className="text-muted-foreground">
                  {engineStatus?.configLastUpdated ?? engineConfig?.lastUpdated ?? "Unavailable"}
                </p>
              </div>
              {engineStatus?.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  {engineStatus.error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Engine presets
            </CardTitle>
            <CardDescription>
              Built-in preset templates come from the engine config API and are intended as starting points for the runtime JSON editor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading presets…</p>
            ) : presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engine presets available.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {presets.map((preset) => (
                  <div key={preset.id} className="rounded-lg border border-border p-4">
                    <div className="space-y-2">
                      <p className="font-medium">{preset.name}</p>
                      <p className="text-sm text-muted-foreground">{preset.description}</p>
                      <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                        {JSON.stringify(preset.config, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Runtime config editor
            </CardTitle>
            <CardDescription>
              Edit engine runtime config as JSON here. The engine persists YAML on disk, but the Core control plane edits the same config through the engine API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="min-h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void validateConfig()} disabled={saving || !editorValue.trim()}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Validate
              </Button>
              <Button onClick={() => void saveConfig()} disabled={saving || !editorValue.trim()}>
                <Save className="mr-2 h-4 w-4" />
                Save to engine
              </Button>
              <Button variant="outline" onClick={() => void reloadConfig()} disabled={saving}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload from engine
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
