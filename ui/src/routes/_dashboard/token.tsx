import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key } from "lucide-react";
import { useEffect, useState } from "react";

interface App {
  id: string;
  name: string;
}

export const Route = createFileRoute("/_dashboard/token")({
  component: TokenPage,
});

function TokenPage() {
  const [apiKey, setApiKey] = useState("");
  const [appId, setAppId] = useState("");

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const appsRes = await fetch("/api/apps");
        if (appsRes.ok) {
          const appData = (await appsRes.json()) as App[];
          setApps(appData);
          if (appData[0] && !appId) {
            setAppId(appData[0].id);
          }
        }
      } catch {
        // Keep UI usable even if helper data fails to load.
      }
    };

    void load();
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (!apiKey.trim()) {
        throw new Error("Publishable API key is required.");
      }

      const payload: Record<string, unknown> = {
        appId: appId || undefined,
        origin: window.location.origin,
      };

      const res = await fetch("/vowel/api/generateToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Failed to generate token (${res.status})`);
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate token</h1>
          <p className="mt-1 text-muted-foreground">
            Mint an ephemeral token against the paired self-hosted engine. Core owns provider routing — no policy selection needed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token generator
            </CardTitle>
            <CardDescription>
              Uses `Authorization: Bearer vkey_*` to authenticate. Core routes to the paired engine automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Publishable key (vkey_*)</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="vkey_xxxxxxxxx..."
              />
            </div>

            <div className="space-y-2">
              <Label>App (optional)</Label>
              {apps.length === 0 ? (
                <Input value="No apps found" disabled />
              ) : (
                <Select value={appId} onValueChange={setAppId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select app" />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name} · {app.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={loading || !apiKey.trim()} className="w-full">
              {loading ? "Generating…" : "Generate token"}
            </Button>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">Token generated</p>
                <pre className="overflow-x-auto text-xs text-muted-foreground">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
