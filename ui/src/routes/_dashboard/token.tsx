/**
 * Token generation page.
 * Uses stored provider keys on the server to mint ephemeral tokens.
 */

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
import { useState, useEffect, useMemo } from "react";

interface VowelPrimeOption {
  value: string;
  label: string;
  wsUrl: string;
}

interface StatusResponse {
  vowelPrime?: {
    environments: VowelPrimeOption[];
    defaultEnvironment: string;
    selfHostedWsUrl?: string;
  };
}

function ensureRealtimePath(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  if (!v) return v;
  if (/\/v1\/realtime$/i.test(v)) return v;
  return `${v}/v1/realtime`;
}

function normalizeVowelPrimeHost(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const withProto = /^[a-z][a-z\d+\-.]*:\/\//i.test(t) ? t : `ws://${t}`;
  return ensureRealtimePath(withProto);
}

export const Route = createFileRoute("/_dashboard/token")({
  component: TokenPage,
});

function TokenPage() {
  const [provider, setProvider] = useState<string>("vowel-prime");
  const [vowelPrimeEnvironment, setVowelPrimeEnvironment] = useState("staging");
  const [customVowelPrimeHost, setCustomVowelPrimeHost] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse>({});

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: StatusResponse) => {
        setStatus(d);
        if (d.vowelPrime?.defaultEnvironment) {
          setVowelPrimeEnvironment(d.vowelPrime.defaultEnvironment);
        }
      })
      .catch(() => {});
  }, []);

  const vowelPrimeOptions = useMemo(() => {
    const base = status.vowelPrime?.environments ?? [];
    const envs = [...base];
    if (status.vowelPrime?.selfHostedWsUrl && !envs.some((e) => e.value === "self-hosted")) {
      envs.unshift({
        value: "self-hosted",
        label: "self-hosted (docker-compose)",
        wsUrl: ensureRealtimePath(status.vowelPrime.selfHostedWsUrl),
      });
    }
    return [...envs, { value: "custom", label: "Custom host", wsUrl: "" }];
  }, [status]);

  const selectedOption = useMemo(
    () => vowelPrimeOptions.find((o) => o.value === vowelPrimeEnvironment),
    [vowelPrimeOptions, vowelPrimeEnvironment]
  );

  const normalizedCustomHost = normalizeVowelPrimeHost(customVowelPrimeHost);
  const isCustomHost = selectedOption?.value === "custom";

  const config = useMemo(() => {
    const base: Record<string, unknown> = { provider };
    if (provider === "vowel-prime") {
      base.voiceConfig = {
        vowelPrimeConfig: isCustomHost
          ? { workerUrl: normalizedCustomHost }
          : { environment: vowelPrimeEnvironment },
      };
    }
    return base;
  }, [provider, vowelPrimeEnvironment, isCustomHost, normalizedCustomHost]);

  const generateDisabled =
    loading ||
    (provider === "vowel-prime" && isCustomHost && !normalizedCustomHost);

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
          config,
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
            Generate an ephemeral token for testing. Uses provider keys configured in API Providers.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Token generator
            </CardTitle>
            <CardDescription>
              Select a provider and target. The server uses stored API keys to mint the token.
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
                  <SelectItem value="vowel-prime">vowel-prime (sndbrd)</SelectItem>
                  <SelectItem value="openai">OpenAI Realtime</SelectItem>
                  <SelectItem value="grok">Grok Realtime</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "vowel-prime" && (
              <div className="space-y-2">
                <Label>Vowel Prime environment / host</Label>
                <Select value={vowelPrimeEnvironment} onValueChange={setVowelPrimeEnvironment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target" />
                  </SelectTrigger>
                  <SelectContent>
                    {vowelPrimeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCustomHost ? (
                  <Input
                    placeholder="engine:8787 or ws://engine:8787"
                    value={customVowelPrimeHost}
                    onChange={(e) => setCustomVowelPrimeHost(e.target.value)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Endpoint: <span className="font-mono">{selectedOption?.wsUrl ?? "—"}</span>
                  </p>
                )}
                {isCustomHost && normalizedCustomHost && (
                  <p className="text-xs text-muted-foreground">
                    Normalized: <span className="font-mono">{normalizedCustomHost}</span>
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Configure API keys in API Providers. The server uses stored keys to mint tokens.
            </p>

            <Button
              onClick={handleGenerate}
              disabled={generateDisabled}
              className="w-full"
            >
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
