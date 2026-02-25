import Link from "next/link";

/**
 * Apps list page — placeholder for full CRUD.
 */
export default function AppsPage() {
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
          <h1>Apps</h1>
          <p className="muted">
            Create and manage apps. Each app can have API keys for token
            generation.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <p className="muted">Apps CRUD coming soon.</p>
        </div>
      </section>
    </main>
  );
}
