import { test, expect } from '@playwright/test';
import { loginAsAlice } from './helpers/login';

test.describe('Export pipeline', () => {
  test('export completes via worker with idempotent retries', async ({
    page,
  }) => {
    await loginAsAlice(page);

    const slug = `export-co-${Date.now().toString(36)}`;
    await page.getByPlaceholder('Organization name').fill('Export Co');
    await page.getByPlaceholder('slug').fill(slug);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByText('Export Co')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Create project' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Project Alpha')).toBeVisible({
      timeout: 15_000,
    });

    const idempotencyKey = `e2e-export-${Date.now()}`;

    const first = await page.request.post('/api/exports', {
      data: { format: 'csv' },
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    });
    expect(first.ok()).toBeTruthy();
    const firstBody = (await first.json()) as { id: string; status: string };
    expect(firstBody.id).toBeTruthy();

    const second = await page.request.post('/api/exports', {
      data: { format: 'csv' },
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    });
    expect(second.ok()).toBeTruthy();
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);

    let status = firstBody.status;
    const deadline = Date.now() + 45_000;
    while (status !== 'completed' && Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      const poll = await page.request.get(`/api/exports/${firstBody.id}`);
      expect(poll.ok()).toBeTruthy();
      const body = (await poll.json()) as { status: string };
      status = body.status;
      if (status === 'failed') {
        throw new Error('Export job failed');
      }
    }
    expect(status).toBe('completed');

    const download = await page.request.get(
      `/api/exports/${firstBody.id}/download`,
    );
    expect(download.ok()).toBeTruthy();
    const downloadBody = (await download.json()) as { url: string };
    expect(downloadBody.url).toMatch(/^https?:\/\//);
  });
});
