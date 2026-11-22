import { test, expect } from '@playwright/test';

test('home page renders TenantGuard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TenantGuard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
