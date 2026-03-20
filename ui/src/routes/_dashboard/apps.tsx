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
import { Layers, Plus, Key, RefreshCw, Trash2, Ban, CheckCircle, Eye, EyeOff, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";

interface App {
  id: string;
  name: string;
  description?: string;
  defaultProvider?: string;
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

const PROVIDERS = ["vowel-prime", "openai", "grok"] as const;

export const Route = createFileRoute("/_dashboard/apps")({
  component: AppsPage,
});

function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [keysByApp, setKeysByApp] = useState<Record<string, ApiKey[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createAppOpen, setCreateAppOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppDescription, setNewAppDescription] = useState("");

  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [targetAppId, setTargetAppId] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [scopeMintEphemeral, setScopeMintEphemeral] = useState(true);
  const [scopeDirectWs, setScopeDirectWs] = useState(false);
  const [allowedProviders, setAllowedProviders] = useState<string[]>(["vowel-prime"]);
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);
  const [revealedByKeyId, setRevealedByKeyId] = useState<Record<string, string>>({});
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const loadApps = async () => {
    const res = await fetch("/api/apps");
    if (!res.ok) {
      throw new Error(`Failed to load apps (${res.status})`);
    }
    const data = (await res.json()) as App[];
    setApps(data);
    return data;
  };

  const loadKeys = async (appId: string) => {
    const res = await fetch(`/api/apps/${appId}/api-keys`);
    if (!res.ok) {
      throw new Error(`Failed to load API keys for app ${appId} (${res.status})`);
    }
    const data = (await res.json()) as ApiKey[];
    setKeysByApp((prev) => ({ ...prev, [appId]: data }));
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const appList = await loadApps();
      await Promise.all(appList.map((app) => loadKeys(app.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load apps");
      setApps([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const submitCreateApp = async () => {
    setError(null);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAppName, description: newAppDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      setCreateAppOpen(false);
      setNewAppName("");
      setNewAppDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create app");
    }
  };

  const openCreateKeyDialog = (appId: string) => {
    setTargetAppId(appId);
    setCreatedPlaintextKey(null);
    setNewKeyLabel("");
    setScopeMintEphemeral(true);
    setScopeDirectWs(false);
    setAllowedProviders(["vowel-prime"]);
    setCreateKeyOpen(true);
  };

  const toggleAllowedProvider = (provider: string) => {
    setAllowedProviders((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider]
    );
  };

  const submitCreateKey = async () => {
    if (!targetAppId) return;
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

    const res = await fetch(`/api/apps/${targetAppId}/api-keys`, {
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
    await loadKeys(targetAppId);
  };

  const revokeKey = async (appId: string, keyId: string) => {
    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}/revoke`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to revoke key (${res.status})`);
      return;
    }
    await loadKeys(appId);
  };

  const removeKey = async (appId: string, keyId: string) => {
    setError(null);
    const res = await fetch(`/api/apps/${appId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Request failed" }));
      setError(data.message || `Failed to delete key (${res.status})`);
      return;
    }
    await loadKeys(appId);
  };

  const toggleKeyVisibility = async (appId: string, keyId: string) => {
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

  /** Fetches plaintext from server if not already revealed; returns plaintext or null. */
  const ensureRevealed = async (appId: string, keyId: string): Promise<string | null> => {
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

  const copyKeyToClipboard = async (appId: string, keyId: string) => {
    const plaintext = await ensureRevealed(appId, keyId);
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
            <p className="mt-1 text-muted-foreground">
              Create apps and manage publishable Core API keys (`vkey_*`) for token minting.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={createAppOpen} onOpenChange={setCreateAppOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create app
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create app</DialogTitle>
                  <DialogDescription>
                    Create an app to scope publishable keys and token policy.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={newAppName}
                      onChange={(event) => setNewAppName(event.target.value)}
                      placeholder="e.g. Demo App"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={newAppDescription}
                      onChange={(event) => setNewAppDescription(event.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateAppOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={!newAppName.trim()} onClick={() => void submitCreateApp()}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

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
              <Layers className="h-5 w-5" />
              Your apps
            </CardTitle>
            <CardDescription>
              Keys are app-scoped. Revoke keys to immediately block token minting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading apps…</p>
            ) : apps.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Layers className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No apps yet</h3>
                <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                  Create your first app to generate publishable keys.
                </p>
                <Button className="mt-4" onClick={() => setCreateAppOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create app
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {apps.map((app) => {
                  const keys = keysByApp[app.id] ?? [];
                  return (
                    <div key={app.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-medium">{app.name}</h4>
                          <p className="text-sm text-muted-foreground">{app.description || "No description"}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{app.id}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => void loadKeys(app.id)}>
                            <RefreshCw className="mr-1 h-4 w-4" />
                            Keys
                          </Button>
                          <Button size="sm" onClick={() => openCreateKeyDialog(app.id)}>
                            <Key className="mr-1 h-4 w-4" />
                            Create key
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {keys.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No publishable keys yet.</p>
                        ) : (
                          keys.map((key) => {
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
                                    onClick={() => void revokeKey(app.id, key.id)}
                                  >
                                    <Ban className="mr-1 h-4 w-4" />
                                    Revoke
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void removeKey(app.id, key.id)}
                                  >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Delete
                                  </Button>
                                </div>
                              </div>

                            {/* API key display with reveal and copy controls */}
                            <div className="flex items-center gap-2">
                              <code className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-muted font-mono text-xs break-all select-all border border-border">
                                {displayValue}
                              </code>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => void toggleKeyVisibility(app.id, key.id)}
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
                                  onClick={() => void copyKeyToClipboard(app.id, key.id)}
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
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            ENV provider secrets + publishable keys
          </p>
          <p className="mt-1">
            Core uses provider secrets from environment variables only. Publishable keys are scoped and policy-controlled in SQLite.
          </p>
        </div>
      </div>
    </div>
  );
}
