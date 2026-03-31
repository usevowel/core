import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Layers, Plus, RefreshCw, ArrowRight, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface App {
  id: string;
  name: string;
  description?: string;
  defaultProvider?: string;
  createdAt?: number;
}

export const Route = createFileRoute("/_dashboard/apps/")({
  component: AppsListPage,
});

function AppsListPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createAppOpen, setCreateAppOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppDescription, setNewAppDescription] = useState("");

  const loadApps = async () => {
    const res = await fetch("/api/apps");
    if (!res.ok) {
      throw new Error(`Failed to load apps (${res.status})`);
    }
    const data = (await res.json()) as App[];
    setApps(data);
    return data;
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadApps();
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
              <div className="space-y-3">
                {apps.map((app) => (
                  <Link
                    key={app.id}
                    to="/apps/$appId"
                    params={{ appId: app.id }}
                    className="block"
                  >
                    <div className="rounded-lg border border-border p-4 transition-colors hover:border-primary/50 hover:bg-accent/5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-medium">{app.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {app.description || "No description"}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{app.id}</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          Manage keys
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
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
