import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Settings,
  Plus,
  Bot,
  Cpu,
  Zap,
  CheckCircle,
  XCircle,
  Globe,
  Trash2,
  Pencil,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface ProviderStatus {
  configured: boolean;
  secretEnv: string;
}

interface StatusResponse {
  providers: Record<string, ProviderStatus>;
  endpointPresets?: {
    total: number;
    enabled: number;
    system: number;
    byProvider: Record<string, number>;
  };
}

interface EndpointPreset {
  id: string;
  name: string;
  provider: "vowel-prime" | "openai" | "grok";
  httpUrl: string;
  wsUrl: string;
  isSystem: boolean;
  enabled: boolean;
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
  const [presets, setPresets] = useState<EndpointPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const [provider, setProvider] = useState<EndpointPreset["provider"]>("vowel-prime");
  const [name, setName] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [wsUrl, setWsUrl] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, presetsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/endpoint-presets"),
      ]);

      if (!statusRes.ok) {
        throw new Error(`Failed to load status (${statusRes.status})`);
      }
      if (!presetsRes.ok) {
        throw new Error(`Failed to load endpoint presets (${presetsRes.status})`);
      }

      setStatus(await statusRes.json());
      setPresets(await presetsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider settings");
      setStatus(null);
      setPresets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const providerStatus = status?.providers ?? {
    "vowel-prime": { configured: false, secretEnv: "SNDBRD_API_KEY" },
    openai: { configured: false, secretEnv: "OPENAI_API_KEY" },
    grok: { configured: false, secretEnv: "XAI_API_KEY" },
  };

  const groupedPresets = useMemo(() => {
    return presets.reduce<Record<string, EndpointPreset[]>>((acc, preset) => {
      if (!acc[preset.provider]) {
        acc[preset.provider] = [];
      }
      acc[preset.provider].push(preset);
      return acc;
    }, {});
  }, [presets]);

  const resetForm = () => {
    setEditPresetId(null);
    setProvider("vowel-prime");
    setName("");
    setHttpUrl("");
    setWsUrl("");
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (preset: EndpointPreset) => {
    setEditPresetId(preset.id);
    setProvider(preset.provider);
    setName(preset.name);
    setHttpUrl(preset.httpUrl);
    setWsUrl(preset.wsUrl);
    setDialogOpen(true);
  };

  const submitPreset = async () => {
    setError(null);
    const payload = {
      provider,
      name,
      httpUrl,
      wsUrl,
      enabled: true,
    };

    try {
      const res = await fetch(
        editPresetId ? `/api/endpoint-presets/${editPresetId}` : "/api/endpoint-presets",
        {
          method: editPresetId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      setDialogOpen(false);
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save endpoint preset");
    }
  };

  const deletePreset = async (preset: EndpointPreset) => {
    if (preset.isSystem) return;
    setError(null);
    try {
      const res = await fetch(`/api/endpoint-presets/${preset.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Delete failed" }));
        throw new Error(data.message || `Delete failed (${res.status})`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete endpoint preset");
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Providers</h1>
            <p className="mt-1 text-muted-foreground">
              Provider secrets are environment-only in Core. Manage endpoint presets used by publishable API keys.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add endpoint preset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editPresetId ? "Edit endpoint preset" : "Add endpoint preset"}</DialogTitle>
                <DialogDescription>
                  Endpoint presets define where Core mints and connects realtime sessions.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as EndpointPreset["provider"])}
                    disabled={Boolean(editPresetId)}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. staging"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>HTTP URL</Label>
                  <Input
                    placeholder="https://staging.prime.vowel.to"
                    value={httpUrl}
                    onChange={(event) => setHttpUrl(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>WebSocket URL</Label>
                  <Input
                    placeholder="wss://staging.prime.vowel.to/v1/realtime"
                    value={wsUrl}
                    onChange={(event) => setWsUrl(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void submitPreset()}
                  disabled={!name.trim() || !httpUrl.trim() || !wsUrl.trim()}
                >
                  {editPresetId ? "Save changes" : "Create preset"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Provider secret status
            </CardTitle>
            <CardDescription>
              Configure provider API secrets in `core/.env` (or deployment environment), not in the UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Globe className="h-5 w-5" />
              Endpoint presets
            </CardTitle>
            <CardDescription>
              System presets are seeded from env/defaults. Custom presets can be managed here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading presets…</p>
            ) : presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No endpoint presets found.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedPresets).map(([providerKey, providerPresets]) => (
                  <div key={providerKey} className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {providerKey}
                    </h3>
                    <div className="space-y-2">
                      {providerPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{preset.name}</p>
                              {preset.isSystem && <Badge variant="outline">System</Badge>}
                              {!preset.enabled && <Badge variant="warning">Disabled</Badge>}
                            </div>
                            <p className="font-mono text-xs text-muted-foreground">HTTP: {preset.httpUrl}</p>
                            <p className="font-mono text-xs text-muted-foreground">WS: {preset.wsUrl}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(preset)}
                              disabled={preset.isSystem}
                              title={preset.isSystem ? "System presets are read-only" : "Edit preset"}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void deletePreset(preset)}
                              disabled={preset.isSystem}
                              title={preset.isSystem ? "System presets cannot be deleted" : "Delete preset"}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
