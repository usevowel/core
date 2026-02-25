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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Plus,
  MoreHorizontal,
  Bot,
  Cpu,
  Zap,
  Key,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState, useEffect } from "react";

/**
 * Provider key entry (stored in localStorage for now; backend API TBD)
 */
interface ProviderKey {
  id: string;
  provider: "vowel-prime" | "openai" | "grok";
  label: string;
  masked: string; // e.g. "sk-...xyz"
  configured: boolean; // true if we have a key (we don't store plaintext in UI)
}

const PROVIDER_OPTIONS = [
  { value: "vowel-prime", label: "Vowel Engine", icon: Bot },
  { value: "openai", label: "OpenAI Realtime", icon: Cpu },
  { value: "grok", label: "Grok Realtime", icon: Zap },
] as const;

const STORAGE_KEY = "valcour-provider-keys";

function loadKeys(): ProviderKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveKeys(keys: ProviderKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export const Route = createFileRoute("/_dashboard/providers")({
  component: ProvidersPage,
});

function ProvidersPage() {
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [addProvider, setAddProvider] = useState<string>("vowel-prime");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, { configured: boolean }>>({});

  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setStatus(d.providers ?? {}))
      .catch(() => setStatus({}));
  }, []);

  const handleAddKey = () => {
    if (!newKeyValue.trim()) return;
    const masked =
      newKeyValue.length > 8
        ? newKeyValue.slice(0, 4) + "..." + newKeyValue.slice(-4)
        : "••••••••";
    const entry: ProviderKey = {
      id: crypto.randomUUID(),
      provider: addProvider as ProviderKey["provider"],
      label: newKeyLabel.trim() || `Key ${keys.filter((k) => k.provider === addProvider).length + 1}`,
      masked,
      configured: true,
    };
    const next = [...keys, entry];
    setKeys(next);
    saveKeys(next);
    setNewKeyValue("");
    setNewKeyLabel("");
    setAddDialogOpen(false);
  };

  const handleRemoveKey = (id: string) => {
    const next = keys.filter((k) => k.id !== id);
    setKeys(next);
    saveKeys(next);
  };

  const providerKeys = (provider: string) =>
    keys.filter((k) => k.provider === provider);

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Providers</h1>
            <p className="mt-1 text-muted-foreground">
              Configure API keys for voice AI providers. Add multiple keys per provider.
            </p>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add provider key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add provider key</DialogTitle>
                <DialogDescription>
                  Enter an API key for the selected provider. Keys are stored locally for now.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={addProvider} onValueChange={setAddProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input
                    placeholder="e.g. Production key"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API key</Label>
                  <Input
                    type="password"
                    placeholder="sk-... or gsk_..."
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddKey} disabled={!newKeyValue.trim()}>
                  Add key
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Provider sections */}
        {PROVIDER_OPTIONS.map(({ value, label, icon: Icon }) => {
          const items = providerKeys(value);
          const envConfigured = status[value]?.configured ?? false;
          return (
            <Card key={value}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle>{label}</CardTitle>
                      <CardDescription>
                        {items.length > 0
                          ? `${items.length} key(s) configured`
                          : envConfigured
                            ? "Configured via environment"
                            : "No keys configured"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {envConfigured && (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Env
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setAddProvider(value);
                            setAddDialogOpen(true);
                          }}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Add key for {label}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 && !envConfigured ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
                    <p className="text-sm text-muted-foreground">
                      No keys for this provider. Add one above or set env (e.g.{" "}
                      {value === "vowel-prime" && "SNDBRD_API_KEY"}
                      {value === "openai" && "OPENAI_API_KEY"}
                      {value === "grok" && "XAI_API_KEY"}).
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setAddProvider(value);
                        setAddDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add key
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.map((k) => (
                      <li
                        key={k.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{k.label}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {k.masked}
                            </p>
                          </div>
                          <Badge variant="success" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Configured
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveKey(k.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
