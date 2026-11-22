import { test, expect } from '@playwright/test';
import { loginAsAlice } from './helpers/login';
import { apiFetch } from './helpers/api';

test.describe('Export pipeline', () => {
  test('export completes via worker with idempotent retries', async ({
    page,
  }) => {
    await loginAsAlice(page);

    const slug = `export-co-${Date.now().toString(36)}`;
    await page.getByPlaceholder('Organization name').fill('Export Co');
    await page.getByPlaceholder('slug').fill(slug);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByText(`Export Co (${slug})`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: 'Create project' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('cell', { name: 'Project Alpha' })).toBeVisible({
      timeout: 15_000,
    });

    const idempotencyKey = `e2e-export-${Date.now()}`;

    const first = await apiFetch(page, '/api/exports', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { format: 'csv' },
    });
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    const firstBody = first.json as { id: string; status: string };
    expect(firstBody.id).toBeTruthy();

    const second = await apiFetch(page, '/api/exports', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { format: 'csv' },
    });
    expect(second.status).toBeGreaterThanOrEqual(200);
    expect(second.status).toBeLessThan(300);
    const secondBody = second.json as { id: string };
    expect(secondBody.id).toBe(firstBody.id);

    let status = firstBody.status;
    const deadline = Date.now() + 45_000;
    while (status !== 'completed' && Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      const poll = await apiFetch(page, `/api/exports/${firstBody.id}`);
      expect(poll.status).toBe(200);
      status = (poll.json as { status: string }).status;
      if (status === 'failed') {
        throw new Error('Export job failed');
      }
    }
    expect(status).toBe('completed');

    const download = await apiFetch(
      page,
      `/api/exports/${firstBody.id}/download`,
    );
    expect(download.status).toBe(200);
    const downloadBody = download.json as { url: string };
    expect(downloadBody.url).toMatch(/^https?:\/\//);
  });
});
