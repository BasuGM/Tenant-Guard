type Project = {
  id: string;
  name: string;
  description: string | null;
};

type ProjectsPanelProps = {
  hasTenant: boolean;
  projects: Project[];
  projectName: string;
  onProjectNameChange: (value: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  canDelete: boolean;
  creating: boolean;
  error?: string | null;
};

export function ProjectsPanel({
  hasTenant,
  projects,
  projectName,
  onProjectNameChange,
  onCreate,
  canCreate,
  canDelete,
  creating,
  error,
}: ProjectsPanelProps) {
  return (
    <section className="panel">
      <h2>Projects</h2>
      {!hasTenant ? (
        <p className="empty-hint">Create or select an organization first.</p>
      ) : (
        <>
          {projects.length === 0 ? (
            <p className="empty-hint">No projects yet in this organization.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{p.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canCreate ? (
            <div className="form-row project">
              <input
                value={projectName}
                onChange={(e) => onProjectNameChange(e.target.value)}
                aria-label="Project name"
              />
              <button type="button" onClick={onCreate} disabled={creating}>
                Create project
              </button>
            </div>
          ) : (
            <p className="empty-hint">Read-only project access for this role.</p>
          )}
          {!canDelete ? (
            <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              Delete is hidden for your role.
            </p>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </>
      )}
    </section>
  );
}
