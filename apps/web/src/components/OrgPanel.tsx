type Tenant = {
  tenant_id: string;
  name: string;
  slug: string;
};

type OrgPanelProps = {
  tenants: Tenant[];
  activeTenantId: string | null;
  tenantName: string;
  tenantSlug: string;
  onTenantNameChange: (value: string) => void;
  onTenantSlugChange: (value: string) => void;
  onCreate: () => void;
  onSwitch: (tenantId: string) => void;
  creating: boolean;
  switching: boolean;
  error?: string | null;
};

export function OrgPanel({
  tenants,
  activeTenantId,
  tenantName,
  tenantSlug,
  onTenantNameChange,
  onTenantSlugChange,
  onCreate,
  onSwitch,
  creating,
  switching,
  error,
}: OrgPanelProps) {
  return (
    <section className="panel">
      <h2>Organizations</h2>
      {tenants.length === 0 ? (
        <p className="empty-hint">Create an organization to get started.</p>
      ) : (
        <ul className="org-list">
          {tenants.map((t) => {
            const active = activeTenantId === t.tenant_id;
            return (
              <li key={t.tenant_id}>
                <button
                  type="button"
                  className={`org-item${active ? ' active' : ''}`}
                  onClick={() => {
                    if (!active) onSwitch(t.tenant_id);
                  }}
                  disabled={switching || active}
                  aria-current={active ? 'true' : undefined}
                >
                  {t.name} <span className="slug">({t.slug})</span>
                  {active ? ' · active' : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-row inline">
        <input
          value={tenantName}
          onChange={(e) => onTenantNameChange(e.target.value)}
          placeholder="Organization name"
          aria-label="Organization name"
        />
        <input
          value={tenantSlug}
          onChange={(e) => onTenantSlugChange(e.target.value)}
          placeholder="slug"
          aria-label="slug"
        />
        <button type="button" onClick={onCreate} disabled={creating}>
          Create organization
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
