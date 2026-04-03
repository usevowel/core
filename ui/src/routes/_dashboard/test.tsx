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
import { Vowel, type VowelAction, type VoiceSessionState, type VowelTranscript } from "@vowel.to/client";
import { FloatingMicButton } from "@vowel.to/client/react";
import { FlaskConical, Key, RotateCcw, TestTube2, Wrench, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface App {
  id: string;
  name: string;
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

interface TokenResponse {
  tokenName: string;
  token?: string;
  model: string;
  provider: "gemini" | "openai" | "grok" | "vowel-core";
  expiresAt: string;
  metadata?: Record<string, unknown>;
  systemInstructions?: string;
}

interface ToolEvent {
  id: number;
  label: string;
  timestamp: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are the core test lab validation agent.

Use the provided tools to prove that the configured stack is working end to end.
Always prefer calling a tool over guessing local page state.
Keep responses brief and conversational, and summarize tool results in plain language.`;

const DEFAULT_GREETING = "Introduce yourself as the core validation agent and say you can test the configured stack with the sample tools.";

const SAMPLE_ROUTES = [
  {
    path: "/_dashboard/test",
    description: "Core test lab with token inspection, live agent controls, and scenario state.",
  },
];

const SAMPLE_ACTIONS: Record<string, VowelAction> = {
  getHarnessState: {
    description: "Read the current test-lab scenario state before taking further action.",
    parameters: {},
  },
  setHarnessNote: {
    description: "Update the scenario note shown in the test-lab state panel.",
    parameters: {
      note: {
        type: "string",
        description: "The new note to display in the scenario state.",
      },
    },
  },
  incrementHarnessCounter: {
    description: "Increment the scenario counter so tool execution is visible in the UI.",
    parameters: {
      amount: {
        type: "number",
        description: "How much to increment the counter by.",
        optional: true,
      },
    },
  },
  toggleHarnessFlag: {
    description: "Toggle the boolean scenario flag to validate mutable tool state.",
    parameters: {},
  },
};

function createInitialLiveState(): VoiceSessionState {
  return {
    isConnecting: false,
    isConnected: false,
    isDisconnecting: false,
    isResuming: false,
    status: "Idle",
    transcripts: [],
    isUserSpeaking: false,
    isAIThinking: false,
    isToolExecuting: false,
    isAISpeaking: false,
    isHibernated: false,
    error: null,
  };
}

export const Route = createFileRoute("/_dashboard/test")({
  component: TestPage,
});

function TestPage() {
  const [apiKey, setApiKey] = useState("");
  const [appId, setAppId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [initialGreetingPrompt, setInitialGreetingPrompt] = useState(DEFAULT_GREETING);

  const [apps, setApps] = useState<App[]>([]);
  const [keysByApp, setKeysByApp] = useState<Record<string, ApiKey[]>>({});
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedTokenResult, setGeneratedTokenResult] = useState<TokenResponse | null>(null);
  const [liveTokenResult, setLiveTokenResult] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [client, setClient] = useState<Vowel | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<VoiceSessionState>(createInitialLiveState());
  const [transcripts, setTranscripts] = useState<VowelTranscript[]>([]);

  const [scenarioNote, setScenarioNote] = useState("Ready for stack validation.");
  const [scenarioCounter, setScenarioCounter] = useState(0);
  const [scenarioFlag, setScenarioFlag] = useState(false);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);

  const clientRef = useRef<Vowel | null>(null);
  const scenarioRef = useRef({
    note: scenarioNote,
    counter: scenarioCounter,
    flag: scenarioFlag,
  });
  // Ref to track streaming transcript accumulation
  const streamingTranscriptRef = useRef<{
    responseId: string | null;
    text: string;
    role: 'user' | 'assistant';
  }>({
    responseId: null,
    text: '',
    role: 'assistant',
  });

  useEffect(() => {
    scenarioRef.current = {
      note: scenarioNote,
      counter: scenarioCounter,
      flag: scenarioFlag,
    };
  }, [scenarioCounter, scenarioFlag, scenarioNote]);

  // Load apps and auto-select first app
  useEffect(() => {
    const load = async () => {
      try {
        const appsRes = await fetch("/api/apps");
        if (appsRes.ok) {
          const appData = (await appsRes.json()) as App[];
          setApps(appData);
          if (appData[0] && !appId) {
            const firstAppId = appData[0].id;
            setAppId(firstAppId);
            // Auto-load keys for the first app
            await loadKeysForApp(firstAppId);
          }
        }
      } catch {
        // Keep UI usable even if helper data fails to load.
      }
    };

    void load();
  }, []);

  // Load keys for a specific app and auto-select first active key
  const loadKeysForApp = async (targetAppId: string) => {
    try {
      const res = await fetch(`/api/apps/${targetAppId}/api-keys`);
      if (!res.ok) {
        setKeysByApp((prev) => ({ ...prev, [targetAppId]: [] }));
        setSelectedKeyId(null);
        setApiKey("");
        return;
      }
      const data = (await res.json()) as ApiKey[];
      setKeysByApp((prev) => ({ ...prev, [targetAppId]: data }));

      // Auto-select first active (non-revoked) key with mint_ephemeral scope
      const activeKey = data.find(
        (k) => !k.revokedAt && k.scopes.includes("mint_ephemeral")
      );
      if (activeKey) {
        setSelectedKeyId(activeKey.id);
        // Reveal the key to get the plaintext
        await revealKey(targetAppId, activeKey.id);
      } else {
        setSelectedKeyId(null);
        setApiKey("");
      }
    } catch {
      setKeysByApp((prev) => ({ ...prev, [targetAppId]: [] }));
      setSelectedKeyId(null);
      setApiKey("");
    }
  };

  // Reveal a key to get its plaintext
  const revealKey = async (targetAppId: string, keyId: string) => {
    try {
      const res = await fetch(`/api/apps/${targetAppId}/api-keys/${keyId}/reveal`);
      if (!res.ok) {
        setApiKey("");
        return;
      }
      const data = (await res.json()) as { plaintext?: string };
      if (data.plaintext) {
        setApiKey(data.plaintext);
      } else {
        setApiKey("");
      }
    } catch {
      setApiKey("");
    }
  };

  // Handle app selection change
  const handleAppChange = async (newAppId: string) => {
    setAppId(newAppId);
    setSelectedKeyId(null);
    setApiKey("");

    // Load keys if not already cached
    if (!keysByApp[newAppId]) {
      await loadKeysForApp(newAppId);
    } else {
      // Use cached keys and auto-select
      const keys = keysByApp[newAppId] ?? [];
      const activeKey = keys.find(
        (k) => !k.revokedAt && k.scopes.includes("mint_ephemeral")
      );
      if (activeKey) {
        setSelectedKeyId(activeKey.id);
        await revealKey(newAppId, activeKey.id);
      }
    }
  };

  const appendToolEvent = (label: string) => {
    setToolEvents((current) => [
      {
        id: Date.now() + current.length,
        label,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...current,
    ].slice(0, 8));
  };

  // Helper to accumulate transcript deltas
  const accumulateTranscript = (currentText: string, deltaText: string): string => {
    if (!deltaText) return currentText;
    if (!currentText) return deltaText;
    const needsSpace = !currentText.endsWith(' ') && !deltaText.startsWith(' ');
    return currentText + (needsSpace ? ' ' : '') + deltaText;
  };

  // Add a transcript entry
  const addTranscript = (text: string, role: 'user' | 'assistant') => {
    if (!text.trim()) return;
    setTranscripts((current) => [
      ...current,
      {
        role,
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);
  };

  const resetScenarioState = () => {
    setScenarioNote("Ready for stack validation.");
    setScenarioCounter(0);
    setScenarioFlag(false);
    setToolEvents([]);
    setTranscripts([]);
    streamingTranscriptRef.current = { responseId: null, text: '', role: 'assistant' };
  };

  const buildScenarioConfig = () => ({
    routes: SAMPLE_ROUTES,
    actions: SAMPLE_ACTIONS,
    systemInstructionOverride: systemPrompt.trim() || undefined,
    initialGreetingPrompt: initialGreetingPrompt.trim() || undefined,
  });

  const requestToken = async (
    key: string,
    config: Record<string, unknown>
  ): Promise<TokenResponse> => {
    const payload: Record<string, unknown> = {
      appId: appId || undefined,
      origin: window.location.origin,
      config,
    };

    const res = await fetch("/vowel/api/generateToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { message?: string };
    if (!res.ok) {
      throw new Error(data.message || `Failed to generate token (${res.status})`);
    }

    return data as TokenResponse;
  };

  useEffect(() => {
    setClientError(null);
    setLiveState(createInitialLiveState());

    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      clientRef.current = null;
      setClient(null);
      return;
    }

    const nextClient = new Vowel({
      appId: appId || undefined,
      routes: SAMPLE_ROUTES,
      instructions: systemPrompt.trim() || undefined,
      initialGreetingPrompt: initialGreetingPrompt.trim() || undefined,
      floatingCursor: {
        enabled: false,
      },
      _voiceConfig: {
        turnDetection: {
          mode: "server_vad",
        },
      },
      tokenProvider: async (config) => {
        const tokenResponse = await requestToken(trimmedApiKey, config as Record<string, unknown>);
        setLiveTokenResult(tokenResponse);
        return tokenResponse;
      },
    });

    nextClient.registerAction("getHarnessState", SAMPLE_ACTIONS.getHarnessState, async () => {
      appendToolEvent("getHarnessState");
      return {
        success: true,
        note: scenarioRef.current.note,
        counter: scenarioRef.current.counter,
        flag: scenarioRef.current.flag,
      };
    });

    nextClient.registerAction("setHarnessNote", SAMPLE_ACTIONS.setHarnessNote, async ({ note }) => {
      const nextNote = typeof note === "string" && note.trim() ? note.trim() : scenarioRef.current.note;
      setScenarioNote(nextNote);
      appendToolEvent(`setHarnessNote: ${nextNote}`);
      return {
        success: true,
        note: nextNote,
      };
    });

    nextClient.registerAction("incrementHarnessCounter", SAMPLE_ACTIONS.incrementHarnessCounter, async ({ amount }) => {
      const incrementBy = typeof amount === "number" && Number.isFinite(amount) ? amount : 1;
      const nextValue = scenarioRef.current.counter + incrementBy;
      setScenarioCounter(nextValue);
      appendToolEvent(`incrementHarnessCounter: +${incrementBy}`);
      return {
        success: true,
        counter: nextValue,
      };
    });

    nextClient.registerAction("toggleHarnessFlag", SAMPLE_ACTIONS.toggleHarnessFlag, async () => {
      const nextValue = !scenarioRef.current.flag;
      setScenarioFlag(nextValue);
      appendToolEvent(`toggleHarnessFlag: ${nextValue ? "on" : "off"}`);
      return {
        success: true,
        flag: nextValue,
      };
    });

    const unsubscribeState = nextClient.onStateChange((state) => {
      setLiveState(state);
    });

    // Subscribe to transcript events for real-time transcription
    const unsubscribeTranscripts = nextClient.onTranscriptEvent((event) => {
      if (event.type === 'delta') {
        const streamState = streamingTranscriptRef.current;
        const isNewResponse = event.responseId && event.responseId !== streamState.responseId;

        if (isNewResponse) {
          // New response starting - reset accumulation
          streamingTranscriptRef.current = {
            responseId: event.responseId || null,
            text: event.text || '',
            role: event.role,
          };
        } else if (event.text) {
          // Accumulate delta
          const accumulatedText = accumulateTranscript(streamState.text, event.text);
          streamingTranscriptRef.current = {
            ...streamState,
            text: accumulatedText,
          };
        }
      } else if (event.type === 'done') {
        // Final transcript - use accumulated text or final text
        const finalText = streamingTranscriptRef.current.text || event.text || '';
        if (finalText) {
          addTranscript(finalText, event.role);
        }
        // Reset streaming state
        streamingTranscriptRef.current = {
          responseId: null,
          text: '',
          role: 'assistant',
        };
      }
    });

    clientRef.current = nextClient;
    setClient(nextClient);

    return () => {
      unsubscribeState();
      unsubscribeTranscripts();
      if (clientRef.current === nextClient) {
        clientRef.current = null;
      }
      setClient((current) => (current === nextClient ? null : current));
      void nextClient.stopSession().catch(() => {
        // Ignore cleanup failures while hot-swapping the test client.
      });
    };
  }, [apiKey, appId, initialGreetingPrompt, systemPrompt]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedTokenResult(null);

    try {
      const trimmedApiKey = apiKey.trim();
      if (!trimmedApiKey) {
        throw new Error("Publishable API key is required.");
      }

      const tokenResponse = await requestToken(trimmedApiKey, buildScenarioConfig());
      setGeneratedTokenResult(tokenResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    setClientError(null);
    try {
      await clientRef.current?.startSession();
    } catch (e) {
      setClientError(e instanceof Error ? e.message : "Failed to start live session");
    }
  };

  const handlePauseSession = async () => {
    setClientError(null);
    try {
      await clientRef.current?.pauseSession();
    } catch (e) {
      setClientError(e instanceof Error ? e.message : "Failed to pause live session");
    }
  };

  const handleResumeSession = async () => {
    setClientError(null);
    try {
      await clientRef.current?.resumeSession();
    } catch (e) {
      setClientError(e instanceof Error ? e.message : "Failed to resume live session");
    }
  };

  const handleStopSession = async () => {
    setClientError(null);
    try {
      await clientRef.current?.stopSession();
    } catch (e) {
      setClientError(e instanceof Error ? e.message : "Failed to stop live session");
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-primary" />
            Test Lab
          </h1>
          <p className="mt-1 text-muted-foreground">
            Mint an ephemeral token, inspect the issued session payload, and run a live validation client against the same configured stack.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Token generator
                </CardTitle>
                <CardDescription>
                  Uses `Authorization: Bearer vkey_*` to authenticate. The same scenario config below is used for both token inspection and the live validation client.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>App</Label>
                  {apps.length === 0 ? (
                    <Input value="No apps found" disabled />
                  ) : (
                    <Select value={appId} onValueChange={handleAppChange}>
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

                {/* Auto-selected key info */}
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    {selectedKeyId ? (
                      <div className="space-y-1">
                        <p className="font-mono text-sm">
                          {keysByApp[appId]?.find((k) => k.id === selectedKeyId)?.masked || "Loading..."}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Auto-selected active key with mint_ephemeral scope
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">No active key available</p>
                        <p className="text-xs text-muted-foreground">
                          Create a key with mint_ephemeral scope for this app
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>System prompt</Label>
                  <textarea
                    className="min-h-[180px] w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={systemPrompt}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Initial greeting prompt</Label>
                  <textarea
                    className="min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={initialGreetingPrompt}
                    onChange={(event) => setInitialGreetingPrompt(event.target.value)}
                    spellCheck={false}
                  />
                </div>

                <Button onClick={handleGenerate} disabled={loading || !apiKey.trim()} className="w-full">
                  {loading ? "Generating…" : "Generate and inspect token"}
                </Button>

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {generatedTokenResult && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Last generated token</p>
                    <pre className="overflow-x-auto text-xs text-muted-foreground">
                      {JSON.stringify(generatedTokenResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-5 w-5" />
                  Live validation client
                </CardTitle>
                <CardDescription>
                  Starts a real browser session with the same key, app, prompt, and sample tools so you can verify the agent against the configured engine stack.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Vowel Mic Button */}
                <div className="flex items-center justify-center py-6">
                  <FloatingMicButton
                    inline
                    client={client}
                    isConnected={liveState.isConnected}
                    isConnecting={liveState.isConnecting}
                    isUserSpeaking={liveState.isUserSpeaking}
                    isAiSpeaking={liveState.isAISpeaking}
                    isAiThinking={liveState.isAIThinking}
                    isToolExecuting={liveState.isToolExecuting}
                    onClick={() => {
                      if (liveState.isConnected) {
                        void handleStopSession();
                      } else {
                        void handleStartSession();
                      }
                    }}
                    className="scale-125"
                  />
                </div>

                {/* Connection Status */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <div className="flex flex-wrap gap-4">
                    <span>Status: <span className="font-medium">{liveState.status}</span></span>
                    <span>User speaking: <span className="font-medium">{liveState.isUserSpeaking ? "yes" : "no"}</span></span>
                    <span>AI thinking: <span className="font-medium">{liveState.isAIThinking ? "yes" : "no"}</span></span>
                    <span>Tool executing: <span className="font-medium">{liveState.isToolExecuting ? "yes" : "no"}</span></span>
                    <span>AI speaking: <span className="font-medium">{liveState.isAISpeaking ? "yes" : "no"}</span></span>
                  </div>
                </div>

                {clientError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    {clientError}
                  </div>
                )}

                {/* Transcripts */}
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Transcripts</p>
                  {transcripts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transcript events yet. Start a session to begin chatting.</p>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {transcripts.slice(-20).map((entry, index) => (
                        <div
                          key={`${entry.role}-${index}-${entry.timestamp.toISOString()}`}
                          className={`rounded-md border border-border/60 p-3 text-sm ${
                            entry.role === "user" ? "bg-primary/5 border-primary/20" : "bg-background"
                          }`}
                        >
                          <p className={`mb-1 text-xs uppercase tracking-wide ${
                            entry.role === "user" ? "text-primary" : "text-muted-foreground"
                          }`}>
                            {entry.role === "user" ? "You" : "Assistant"}
                          </p>
                          <p>{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Token Response */}
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Last live token response</p>
                  {liveTokenResult ? (
                    <pre className="overflow-x-auto text-xs text-muted-foreground">
                      {JSON.stringify(liveTokenResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">Start a live session to capture the token response used by the client.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Sample tools
                </CardTitle>
                <CardDescription>
                  These tools are sent in the token request and registered on the live client so tool execution is visible in the page state.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {Object.entries(SAMPLE_ACTIONS).map(([name, action]) => (
                  <div key={name} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="font-mono text-xs text-muted-foreground">{name}</p>
                    <p className="mt-1">{action.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TestTube2 className="h-5 w-5" />
                  Scenario state
                </CardTitle>
                <CardDescription>
                  Use the agent to read and mutate this state. The log shows whether tool calls are actually making it through the configured stack.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Counter</p>
                    <p className="mt-1 text-2xl font-semibold">{scenarioCounter}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Flag</p>
                    <p className="mt-1 text-2xl font-semibold">{scenarioFlag ? "On" : "Off"}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tool events</p>
                    <p className="mt-1 text-2xl font-semibold">{toolEvents.length}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scenario note</Label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={scenarioNote}
                    onChange={(event) => setScenarioNote(event.target.value)}
                    spellCheck={false}
                  />
                </div>

                <Button variant="outline" onClick={resetScenarioState} className="w-full">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset scenario state
                </Button>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Recent tool activity</p>
                  {toolEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tool calls yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {toolEvents.map((event) => (
                        <div key={event.id} className="flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                          <span>{event.label}</span>
                          <span className="text-xs text-muted-foreground">{event.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
