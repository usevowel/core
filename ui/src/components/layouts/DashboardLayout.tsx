import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers,
  Key,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Bot,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProviderStatus {
  configured: boolean;
}

interface DatabaseStatus {
  initialized: boolean;
  path: string;
}

interface CoreStatusResponse {
  providers?: Record<string, ProviderStatus>;
  database?: DatabaseStatus;
}

/**
 * Valcour dashboard layout with collapsible sidebar.
 * Features a minimal "V" logo and icon-based navigation.
 */
export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [coreStatus, setCoreStatus] = useState<CoreStatusResponse | null>(null);
  const [statusError, setStatusError] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((value) => {
        setCoreStatus(value);
        setStatusError(false);
      })
      .catch(() => {
        setStatusError(true);
      });
  }, []);

  const providerWarnings = useMemo(() => {
    const providers = coreStatus?.providers ?? {};
    const missingProviderKeys = Object.entries(providers)
      .filter(([, value]) => !value.configured)
      .map(([key]) => {
        switch (key) {
          case "vowel-prime":
            return "vowel-prime (SNDBRD_API_KEY)";
          case "openai":
            return "OpenAI Realtime (OPENAI_API_KEY)";
          case "grok":
            return "Grok (XAI_API_KEY)";
          default:
            return key;
        }
      });
    const warnings: string[] = [];

    if (statusError) {
      warnings.push("Unable to load core status. Ensure the Core API is running.");
      return warnings;
    }

    if (coreStatus && coreStatus.database && !coreStatus.database.initialized) {
      const dbPath = coreStatus.database.path;
      warnings.push(
        `Database has not been initialized yet. Run \`bun run db:init\` (DB path: ${dbPath}).`
      );
    }

    if (missingProviderKeys.length > 0) {
      warnings.push(
        `Provider keys are missing for: ${missingProviderKeys.join(", ")}. Configure them in API Providers or via environment variables.`
      );
    }

    return warnings;
  }, [coreStatus, statusError]);

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/apps", icon: Layers, label: "Apps" },
    { href: "/token", icon: Key, label: "Token" },
    { href: "/providers", icon: Settings, label: "API Providers" },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-300 overflow-hidden",
          sidebarOpen ? "w-56" : "w-16"
        )}
      >
        {/* Logo - V */}
        <div
          className={cn(
            "flex items-center border-b border-border",
            sidebarOpen ? "h-16 px-6" : "h-16 justify-center px-0"
          )}
        >
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-lg font-bold text-primary">V</span>
              </div>
              <span className="font-semibold text-foreground tracking-tight">
                Valcour
              </span>
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <span className="text-lg font-bold text-primary">V</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 py-4", sidebarOpen ? "px-3" : "px-2")}>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.href ||
                (item.href !== "/" && location.pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      !sidebarOpen && "justify-center px-2"
                    )}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Collapse */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full",
              sidebarOpen ? "justify-start" : "justify-center px-0"
            )}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse" : "Expand"}
          >
            {sidebarOpen ? (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span className="ml-2">Collapse</span>
              </>
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {providerWarnings.length > 0 && (
          <div className="border-b border-destructive/40 bg-destructive/15 px-6 py-3">
            <div className="mx-auto flex max-w-6xl items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Setup required
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-destructive">
                  {providerWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
