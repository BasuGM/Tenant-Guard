import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

function loadRootEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const demoDir = path.resolve(process.cwd(), '.demo');
  fs.mkdirSync(demoDir, { recursive: true });

  try {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const projectId = randomUUID();
    const slug = `company-b-${tenantId.slice(0, 8)}`;

    const existing = await client.query<{
      tenant_id: string;
      project_id: string;
    }>(
      `
      SELECT t.id AS tenant_id, p.id AS project_id
      FROM tenants t
      LEFT JOIN projects p ON p.tenant_id = t.id AND p.name = 'Company B Secret'
      WHERE t.slug LIKE 'company-b-%'
      ORDER BY t.created_at
      LIMIT 1
      `,
    );

    let resolvedTenantId: string;
    let resolvedProjectId: string;

    if (existing.rows[0]?.tenant_id && existing.rows[0]?.project_id) {
      resolvedTenantId = existing.rows[0].tenant_id;
      resolvedProjectId = existing.rows[0].project_id;
    } else {
      await client.query(
        `
        INSERT INTO users (id, issuer, subject, email, display_name)
        VALUES ($1::uuid, 'demo-seed', $2, 'bob@example.test', 'Bob')
        ON CONFLICT (issuer, subject) DO NOTHING
        `,
        [userId, userId],
      );

      await client.query(
        `
        INSERT INTO tenants (id, name, slug)
        VALUES ($1::uuid, 'Company B', $2)
        `,
        [tenantId, slug],
      );
      resolvedTenantId = tenantId;

      const project = await client.query<{ id: string }>(
        `
        INSERT INTO projects (id, tenant_id, name, description)
        VALUES ($1::uuid, $2::uuid, 'Company B Secret', 'Seeded for isolation demo')
        RETURNING id
        `,
        [projectId, resolvedTenantId],
      );
      resolvedProjectId = project.rows[0]!.id;
    }

    fs.writeFileSync(
      path.join(demoDir, 'foreign-project-id'),
      resolvedProjectId,
      'utf8',
    );
    fs.writeFileSync(
      path.join(demoDir, 'foreign-tenant-id'),
      resolvedTenantId,
      'utf8',
    );

    console.log('Demo seed complete');
    console.log(`  Company B tenant: ${resolvedTenantId}`);
    console.log(`  Foreign project:  ${resolvedProjectId}`);
    console.log(`  Wrote .demo/foreign-project-id`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
