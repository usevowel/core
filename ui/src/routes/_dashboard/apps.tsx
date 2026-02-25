import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Plus, Key, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface App {
  id: string;
  name: string;
  description?: string;
  defaultProvider?: string;
  createdAt?: number;
}

export const Route = createFileRoute("/_dashboard/apps")({
  component: AppsPage,
});

function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
            <p className="mt-1 text-muted-foreground">
              Create and manage apps. Each app can have API keys for token generation.
            </p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Create app
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Your apps
            </CardTitle>
            <CardDescription>
              Apps are used to scope API keys and token generation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apps.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Layers className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No apps yet</h3>
                <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                  Create your first app to get started. Each app can have multiple API keys.
                </p>
                <Button className="mt-4" disabled>
                  <Plus className="mr-2 h-4 w-4" />
                  Create app
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {apps.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent/5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Layers className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{app.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {app.description || "No description"}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {app.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled>
                        <Key className="mr-1 h-4 w-4" />
                        Keys
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        <Settings className="h-4 w-4" />
                      </Button>
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
