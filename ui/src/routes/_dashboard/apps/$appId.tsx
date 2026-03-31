import { createFileRoute, Link } from "@tanstack/react-router";
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
  Layers,
} from "lucide-react";
import { useEffect, useState } from "react";

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

const PROVIDERS = ["vowel-core", "vowel-prime", "openai", "grok"] as const;

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
  const [allowedProviders, setAllowedProviders] = useState<string[]>(["vowel-core"]);
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
    setAllowedProviders(["vowel-core"]);
    setCreateKeyOpen(true);
  };

  const toggleAllowedProvider = (provider: string) => {
    setAllowedProviders((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider]
    );
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

    const res = await fetch(`/api/apps/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtimeConfig: parsed }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to save runtime config (${res.status})`);
      return;
    }

    const updated = (await res.json()) as App;
    setApp(updated);
    setRuntimeConfigText(JSON.stringify(updated.runtimeConfig ?? {}, null, 2));
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
          <CardHeader>
            <CardTitle>Runtime config</CardTitle>
            <CardDescription>
              App-owned JSON config used by Core token generation when present.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="min-h-[260px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              value={runtimeConfigText}
              onChange={(event) => setRuntimeConfigText(event.target.value)}
              spellCheck={false}
            />
            <Button onClick={() => void saveRuntimeConfig()}>Save runtime config</Button>
          </CardContent>
        </Card>


        <Dialog open={createKeyOpen} onOpenChange={setCreateKeyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create publishable key</DialogTitle>
              <DialogDescription>
                This key is encrypted in SQLite and can be revealed again later from the app key list.
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
                    <input
                      type="checkbox"
                      checked={scopeMintEphemeral}
                      onChange={(event) => setScopeMintEphemeral(event.target.checked)}
                    />
                    mint_ephemeral
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scopeDirectWs}
                      onChange={(event) => setScopeDirectWs(event.target.checked)}
                    />
                    direct_ws
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Allowed providers</Label>
                <div className="flex flex-wrap gap-2 text-sm">
                  {PROVIDERS.map((provider) => (
                    <label key={provider} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                      <input
                        type="checkbox"
                        checked={allowedProviders.includes(provider)}
                        onChange={() => toggleAllowedProvider(provider)}
                      />
                      {provider}
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
              Publishable keys for this app. Revoke keys to immediately block token minting.
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
                  Create your first publishable key to start minting tokens.
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
                            Providers: {key.allowedProviders.join(", ")}
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
