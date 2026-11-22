'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

type Me = {
  user: { id: string; email: string | null; displayName: string | null } | null;
  tenantId: string | null;
  permissions: string[];
  systemRoles: string[];
};

type Project = {
  id: string;
  name: string;
  description: string | null;
};

type ExportJob = {
  id: string;
  status: string;
  format: string;
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('Project Alpha');
  const [tenantName, setTenantName] = useState('Company A');
  const [tenantSlug, setTenantSlug] = useState('company-a');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
  });

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () =>
      api<Array<{ tenant_id: string; name: string; slug: string }>>(
        '/tenants',
      ),
    enabled: !!me.data?.user,
  });

  const projects = useQuery({
    queryKey: ['projects', me.data?.tenantId],
    queryFn: () => api<Project[]>('/projects'),
    enabled: !!me.data?.tenantId,
  });

  const exports = useQuery({
    queryKey: ['exports', me.data?.tenantId],
    queryFn: () => api<ExportJob[]>('/exports'),
    enabled:
      !!me.data?.tenantId && me.data.permissions.includes('exports:read'),
  });

  const createTenant = useMutation({
    mutationFn: () =>
      api('/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: tenantName, slug: tenantSlug }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const createProject = useMutation({
    mutationFn: () =>
      api('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: projectName }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const createExport = useMutation({
    mutationFn: () =>
      api('/exports', {
        method: 'POST',
        headers: {
          'Idempotency-Key': `export-${Date.now()}`,
        },
        body: JSON.stringify({ format: 'csv' }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exports'] });
    },
  });

  const canCreateProject = me.data?.permissions.includes('projects:create');
  const canDeleteProject = me.data?.permissions.includes('projects:delete');
  const canExport = me.data?.permissions.includes('exports:create');

  if (me.isLoading) {
    return (
      <main>
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  if (!me.data?.user) {
    return (
      <main>
        <h1>Dashboard</h1>
        <div className="card">
          <p className="muted">Sign in to manage organizations and projects.</p>
          <a className="button" href="/api/auth/login">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="row">
        <h1>Dashboard</h1>
        <span className="badge">
          {me.data.user.email ?? me.data.user.displayName ?? me.data.user.id}
        </span>
        <span className="badge">
          roles: {me.data.systemRoles.join(', ') || 'none'}
        </span>
      </div>

      <section className="card">
        <h2>Organizations</h2>
        <ul>
          {(tenants.data ?? []).map((t) => (
            <li key={t.tenant_id}>
              {t.name} <span className="muted">({t.slug})</span>
              {me.data.tenantId === t.tenant_id ? ' · active' : ''}
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="Organization name"
          />
          <input
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="slug"
          />
          <button
            onClick={() => createTenant.mutate()}
            disabled={createTenant.isPending}
          >
            Create organization
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Projects</h2>
        {!me.data.tenantId ? (
          <p className="muted">Create or join an organization first.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {(projects.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{p.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canCreateProject ? (
              <div className="row">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <button
                  onClick={() => createProject.mutate()}
                  disabled={createProject.isPending}
                >
                  Create project
                </button>
              </div>
            ) : (
              <p className="muted">Read-only project access for this role.</p>
            )}
            {!canDeleteProject && (
              <p className="muted">Delete is hidden for your role.</p>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Exports</h2>
        {canExport ? (
          <button
            onClick={() => createExport.mutate()}
            disabled={createExport.isPending}
          >
            Request CSV export
          </button>
        ) : (
          <p className="muted">Export permission required.</p>
        )}
        <ul>
          {(exports.data ?? []).map((job) => (
            <li key={job.id}>
              {job.id.slice(0, 8)}… · {job.status} · {job.format}
              {job.status === 'completed' ? (
                <>
                  {' '}
                  <a href={`/api/exports/${job.id}/download`} target="_blank">
                    Download
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
