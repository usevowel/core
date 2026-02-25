import Link from "next/link";

/**
 * Token generation page — placeholder for token flow.
 */
export default function TokenPage() {
  return (
    <main>
      <nav>
        <div className="nav-inner">
          <div className="nav-brand">Vowel Core</div>
          <div className="nav-links">
            <Link href="/">Dashboard</Link>
            <Link href="/apps">Apps</Link>
            <Link href="/token">Token</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <h1>Generate token</h1>
          <p className="muted">
            Select provider, app, and API key to generate an ephemeral token.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <p className="muted">Token generator coming soon.</p>
        </div>
      </section>
    </main>
  );
}
