type ExportJob = {
  id: string;
  status: string;
  format: string;
};

type ExportsPanelProps = {
  jobs: ExportJob[];
  canExport: boolean;
  canRead: boolean;
  onRequest: () => void;
  requesting: boolean;
  error?: string | null;
};

function statusClass(status: string): string {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'pending';
}

export function ExportsPanel({
  jobs,
  canExport,
  canRead,
  onRequest,
  requesting,
  error,
}: ExportsPanelProps) {
  return (
    <section className="panel">
      <h2>Exports</h2>
      {canExport ? (
        <button type="button" onClick={onRequest} disabled={requesting}>
          Request CSV export
        </button>
      ) : (
        <p className="empty-hint">Export permission required.</p>
      )}
      {error ? <p className="error-text">{error}</p> : null}
      {canRead ? (
        jobs.length === 0 ? (
          <p className="empty-hint" style={{ marginTop: '1rem' }}>
            No export jobs yet.
          </p>
        ) : (
          <ul className="export-list">
            {jobs.map((job) => (
              <li key={job.id} className="export-item">
                <code>{job.id.slice(0, 8)}…</code>
                <span className={`status-chip ${statusClass(job.status)}`}>
                  {job.status}
                </span>
                <span className="muted">{job.format}</span>
                {job.status === 'completed' ? (
                  <a href={`/api/exports/${job.id}/download`} target="_blank" rel="noreferrer">
                    Download
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
