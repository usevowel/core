import Link from "next/link";

/** API base URL for server-side fetches (Elysia backend). */
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

/**
 * Dashboard page — provider status, quick links.
 */
export default async function HomePage() {
  let status: { providers?: Record<string, { configured?: boolean }> } = {};
  try {
    const res = await fetch(`${API_BASE}/api/status`, { cache: "no-store" });
    status = await res.json().catch(() => ({}));
  } catch {
    // API not reachable (e.g. Elysia not running)
  }

  const providers = status?.providers ?? {
    "vowel-prime": { configured: false },
    openai: { configured: false },
    grok: { configured: false },
  };

  return (
    <main>
      <nav>
        <div className="nav-inner">
          <div className="nav-brand">Vowel Core</div>
          <div className="nav-links">
            <Link href="/apps">Apps</Link>
            <Link href="/token">Token</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <div className="badge">Self-hosted</div>
          <h1>Vowel Core</h1>
          <p>
            Token service for sndbrd, OpenAI Realtime, and Grok Realtime.
            Create apps, API keys, and generate ephemeral tokens.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Provider status</h2>
          <p className="muted">
            Configure API keys via environment variables.
          </p>
          <div className="stats" style={{ marginTop: 24 }}>
            <div className="card" style={{ padding: 20 }}>
              <div className="stat-label">vowel-prime (sndbrd)</div>
              <div
                className="stat-value"
                style={{
                  color: providers["vowel-prime"]?.configured
                    ? "var(--green)"
                    : "var(--red)",
                  fontSize: "1.2rem",
                }}
              >
                {providers["vowel-prime"]?.configured ? "Configured" : "Not set"}
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div className="stat-label">OpenAI Realtime</div>
              <div
                className="stat-value"
                style={{
                  color: providers.openai?.configured
                    ? "var(--green)"
                    : "var(--red)",
                  fontSize: "1.2rem",
                }}
              >
                {providers.openai?.configured ? "Configured" : "Not set"}
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div className="stat-label">Grok Realtime</div>
              <div
                className="stat-value"
                style={{
                  color: providers.grok?.configured
                    ? "var(--green)"
                    : "var(--red)",
                  fontSize: "1.2rem",
                }}
              >
                {providers.grok?.configured ? "Configured" : "Not set"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Quick links</h2>
          <div className="stats" style={{ marginTop: 24 }}>
            <Link
              href="/apps"
              style={{
                display: "block",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 24,
                color: "var(--fg)",
                textDecoration: "none",
              }}
            >
              <div className="stat-label">Apps</div>
              <div className="stat-value" style={{ fontSize: "1.2rem" }}>
                Manage apps →
              </div>
            </Link>
            <Link
              href="/token"
              style={{
                display: "block",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 24,
                color: "var(--fg)",
                textDecoration: "none",
              }}
            >
              <div className="stat-label">Token</div>
              <div className="stat-value" style={{ fontSize: "1.2rem" }}>
                Generate token →
              </div>
            </Link>
          </div>
        </div>
      </section>

      <footer
        style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        Vowel Core — Self-hosted token service. No auth, no billing.
      </footer>
    </main>
  );
}
