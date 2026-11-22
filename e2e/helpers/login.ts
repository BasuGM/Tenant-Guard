import type { Page } from '@playwright/test';

/**
 * Drive local oidc-provider devInteractions login as Alice.
 * Interaction UI: login form with name=login, then optional consent Continue.
 */
export async function loginAsAlice(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();

  // Land on IdP interaction page
  await page.waitForURL(/localhost:3102\//, { timeout: 30_000 });

  const loginInput = page.locator('input[name="login"]');
  await loginInput.waitFor({ state: 'visible', timeout: 15_000 });
  await loginInput.fill('alice');

  const password = page.locator('input[name="password"]');
  if (await password.count()) {
    await password.fill('alice');
  }

  await page.locator('button[type="submit"]').first().click();

  // Consent screen (if present)
  const continueBtn = page.getByRole('button', { name: /continue/i });
  try {
    await continueBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await continueBtn.click();
  } catch {
    // Some oidc-provider versions skip consent for the same client.
  }

  await page.waitForURL(/localhost:3100\/(dashboard)?/, { timeout: 30_000 });
  if (!page.url().includes('/dashboard')) {
    await page.goto('/dashboard');
  }
}
