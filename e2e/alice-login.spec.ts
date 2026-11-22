import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loginAsAlice } from './helpers/login';

function foreignProjectId(): string {
  const file = path.resolve(process.cwd(), '.demo/foreign-project-id');
  if (!fs.existsSync(file)) {
    throw new Error(
      'Missing .demo/foreign-project-id — run `pnpm demo:seed` first',
    );
  }
  return fs.readFileSync(file, 'utf8').trim();
}

test.describe('Alice OIDC login and isolation', () => {
  test('Alice signs in, creates Company A, cannot read Company B project', async ({
    page,
  }) => {
    const foreignId = foreignProjectId();

    await loginAsAlice(page);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create organization' }),
    ).toBeVisible();
    // Prefer profile claims when present; UUID badge still means session exists.
    await expect(
      page.locator('span.badge').first(),
    ).toBeVisible();

    // Unique slug per run to avoid conflicts
    const slug = `company-a-${Date.now().toString(36)}`;
    await page.getByPlaceholder('Organization name').fill('Company A');
    await page.getByPlaceholder('slug').fill(slug);
    await page.getByRole('button', { name: 'Create organization' }).click();

    await expect(page.getByText(/Company A/)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Create project' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Project Alpha')).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText('Company B Secret')).toHaveCount(0);

    const response = await page.request.get(`/api/projects/${foreignId}`);
    expect(response.status()).toBe(404);
  });
});
