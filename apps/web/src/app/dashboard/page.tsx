'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/AppHeader';
import { OrgPanel } from '@/components/OrgPanel';
import { ProjectsPanel } from '@/components/ProjectsPanel';
import { ExportsPanel } from '@/components/ExportsPanel';

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

type Tenant = {
  tenant_id: string;
  name: string;
  slug: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [projectName, setProjectName] = useState('Project Alpha');
  const [tenantName, setTenantName] = useState('Company A');
  const [tenantSlug, setTenantSlug] = useState('company-a');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
  });

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api<Tenant[]>('/tenants'),
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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.some((j) => j.status === 'pending' || j.status === 'running')
        ? 2000
        : false;
    },
  });

  const createTenant = useMutation({
    mutationFn: async () => {
      const tenant = await api<{ id: string }>('/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: tenantName, slug: tenantSlug }),
      });
      await api('/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      return tenant;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const switchTenant = useMutation({
    mutationFn: (tenantId: string) =>
      api('/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
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

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/');
      router.refresh();
    },
  });

  const canCreateProject = me.data?.permissions.includes('projects:create');
  const canDeleteProject = me.data?.permissions.includes('projects:delete');
  const canExport = me.data?.permissions.includes('exports:create');
  const canReadExports = me.data?.permissions.includes('exports:read');

  const userLabel = me.data?.user
    ? (me.data.user.email ??
      me.data.user.displayName ??
      me.data.user.id)
    : null;

  const activeOrgName =
    me.data?.tenantId && tenants.data
      ? (tenants.data.find((t) => t.tenant_id === me.data.tenantId)?.name ??
        null)
      : null;

  if (me.isLoading) {
    return (
      <>
        <AppHeader />
        <div className="app-shell">
          <div className="skeleton-block" aria-busy="true" aria-label="Loading session">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
            <p className="muted">Loading session…</p>
          </div>
        </div>
      </>
    );
  }

  if (!me.data?.user) {
    return (
      <>
        <AppHeader />
        <div className="app-shell">
          <div className="signed-out">
            <h1>Dashboard</h1>
            <div className="panel">
              <p className="muted">
                Sign in to manage organizations and projects.
              </p>
              <p style={{ marginTop: '1rem' }}>
                <a className="button" href="/api/auth/login">
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        userLabel={userLabel}
        activeOrgName={activeOrgName}
        roles={me.data.systemRoles}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending}
      />
      <div className="app-shell">
        <div className="app-title-row">
          <h1>Dashboard</h1>
          {userLabel ? <span className="badge">{userLabel}</span> : null}
          <span className="badge">
            roles: {me.data.systemRoles.join(', ') || 'none'}
          </span>
        </div>

        <div className="dashboard-grid">
          <OrgPanel
            tenants={tenants.data ?? []}
            activeTenantId={me.data.tenantId}
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            onTenantNameChange={setTenantName}
            onTenantSlugChange={setTenantSlug}
            onCreate={() => createTenant.mutate()}
            onSwitch={(id) => switchTenant.mutate(id)}
            creating={createTenant.isPending}
            switching={switchTenant.isPending}
            error={
              createTenant.isError
                ? errorMessage(createTenant.error)
                : switchTenant.isError
                  ? errorMessage(switchTenant.error)
                  : null
            }
          />

          <div className="dashboard-main">
            <ProjectsPanel
              hasTenant={!!me.data.tenantId}
              projects={projects.data ?? []}
              projectName={projectName}
              onProjectNameChange={setProjectName}
              onCreate={() => createProject.mutate()}
              canCreate={!!canCreateProject}
              canDelete={!!canDeleteProject}
              creating={createProject.isPending}
              error={
                createProject.isError
                  ? errorMessage(createProject.error)
                  : null
              }
            />
            <ExportsPanel
              jobs={exports.data ?? []}
              canExport={!!canExport}
              canRead={!!canReadExports}
              onRequest={() => createExport.mutate()}
              requesting={createExport.isPending}
              error={
                createExport.isError ? errorMessage(createExport.error) : null
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
