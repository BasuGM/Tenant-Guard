import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <p className="badge">TenantGuard</p>
      <h1>Secure multi-tenant SaaS</h1>
      <p className="muted">
        Shared infrastructure with PostgreSQL Row-Level Security, OIDC sessions,
        RBAC, Redis rate limits, and asynchronous exports.
      </p>
      <div className="card">
        <div className="row">
          <Link className="button" href="/api/auth/login">
            Sign in
          </Link>
          <Link className="button secondary" href="/dashboard">
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
