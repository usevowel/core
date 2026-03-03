import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_dashboard/token")({
  component: TokenPage,
});

function TokenPage() {
  const [provider, setProvider] = useState<string>("vowel-prime");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/vowel/api/generateToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: "default",
          origin: window.location.origin,
          config: { provider },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate token");
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
            Generate an ephemeral token for testing. Requires a valid API key.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token generator
            </CardTitle>
            <CardDescription>
              Select a provider and generate a token. The token is consumed programmatically by the client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vowel-prime">Vowel Engine</SelectItem>
                  <SelectItem value="openai">OpenAI Realtime</SelectItem>
                  <SelectItem value="grok">Grok Realtime</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm text-muted-foreground">
              Note: Token generation requires Authorization: Bearer with a valid API key.
              Configure keys in API Providers.
            </p>

            <Button onClick={handleGenerate} disabled={loading} className="w-full">
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
