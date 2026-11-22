import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1 className="landing-brand rise-in">TenantGuard</h1>
        <p className="landing-tagline rise-in-delay">
          Shared infrastructure with tenant isolation enforced in Postgres—not
          only in application filters.
        </p>
        <div className="landing-cta rise-in-delay">
          <Link className="button" href="/api/auth/login">
            Sign in
          </Link>
          <Link className="button secondary" href="/dashboard">
            Open dashboard
          </Link>
        </div>
      </section>

      <section className="landing-strip" aria-label="Capabilities">
        <div className="landing-strip-inner">
          <div>
            <h3>Row-Level Security</h3>
            <p>Forced RLS and a non-bypass app role keep tenants separated.</p>
          </div>
          <div>
            <h3>OIDC sessions</h3>
            <p>PKCE login with hashed refresh rotation and HttpOnly cookies.</p>
          </div>
          <div>
            <h3>Async exports</h3>
            <p>SQS wake-ups, idempotent jobs, and downloads under the same RLS.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
