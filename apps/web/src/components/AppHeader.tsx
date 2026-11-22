import Link from 'next/link';

type AppHeaderProps = {
  userLabel?: string | null;
  activeOrgName?: string | null;
  roles?: string[];
  onSignOut?: () => void;
  signingOut?: boolean;
};

export function AppHeader({
  userLabel,
  activeOrgName,
  roles,
  onSignOut,
  signingOut,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link className="app-header-brand" href="/">
        TenantGuard
      </Link>
      <div className="app-header-meta">
        {activeOrgName ? (
          <span className="badge" title="Active organization">
            {activeOrgName}
          </span>
        ) : null}
        {userLabel ? <span className="badge">{userLabel}</span> : null}
        {roles && roles.length > 0 ? (
          <span className="badge">roles: {roles.join(', ')}</span>
        ) : null}
        {onSignOut ? (
          <button
            type="button"
            className="ghost"
            onClick={onSignOut}
            disabled={signingOut}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
