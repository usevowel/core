import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Layers,
  Key,
  Settings,
  ArrowRight,
  CheckCircle,
  XCircle,
  Bot,
  Cpu,
  Mic,
} from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Provider status from API
 */
interface ProviderStatus {
  configured: boolean;
}

interface StatusResponse {
  providers?: Record<string, ProviderStatus>;
}

export const Route = createFileRoute("/_dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({}));
  }, []);

  const providers = status?.providers ?? {
    "vowel-prime": { configured: false },
    openai: { configured: false },
    grok: { configured: false },
  };

  const providerIcons: Record<string, React.ElementType> = {
    "vowel-prime": Bot,
    openai: Cpu,
    grok: Zap,
  };

  const providerLabels: Record<string, string> = {
    "vowel-prime": "vowel-prime (sndbrd)",
    openai: "OpenAI Realtime",
    grok: "Grok Realtime",
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Self-hosted voice AI token service. Manage apps, API keys, and providers.
          </p>
        </div>

        {/* Provider status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Provider status
            </CardTitle>
            <CardDescription>
              Configure API keys in the Providers section or via environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(providers).map(([key, { configured }]) => {
                const Icon = providerIcons[key] ?? Zap;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{providerLabels[key] ?? key}</p>
                        <Badge
                          variant={configured ? "success" : "secondary"}
                          className="mt-1"
                        >
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

        {/* Quick links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/apps">
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/5">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">Apps</CardTitle>
                <CardDescription>
                  Create and manage apps. Each app can have API keys.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full justify-between">
                  Manage apps
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/token">
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/5">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Key className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">Token</CardTitle>
                <CardDescription>
                  Generate ephemeral tokens for testing your integration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full justify-between">
                  Generate token
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/providers">
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/5">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">API Providers</CardTitle>
                <CardDescription>
                  Configure API keys for vowel-prime, OpenAI, and Grok.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="w-full justify-between">
                  Configure keys
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
