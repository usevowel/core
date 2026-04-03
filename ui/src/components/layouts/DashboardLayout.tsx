import { Outlet, Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Layers, FlaskConical, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Core dashboard layout with a collapsed icon-only sidebar.
 * Features a minimal "V" logo and icon-based navigation.
 */
export function DashboardLayout() {
  const location = useLocation();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/apps", icon: Layers, label: "Apps" },
    { href: "/token", icon: FlaskConical, label: "Test Lab" },
    { href: "/providers", icon: Settings, label: "API Providers" },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-300 overflow-hidden w-16"
        )}
      >
        {/* Logo - V */}
        <div className="flex h-16 items-center justify-center border-b border-border px-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-lg font-semibold leading-none text-primary tracking-tight font-mono">
              V
            </span>
          </div>
          <span className="sr-only">Core</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2">
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
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors justify-center px-2",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    title={item.label}
                    aria-label={item.label}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
