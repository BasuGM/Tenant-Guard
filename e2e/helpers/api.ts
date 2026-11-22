import type { Page } from '@playwright/test';

/** Same-origin fetch inside the page so HttpOnly session cookies are included. */
export async function apiFetch(
  page: Page,
  path: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ path: p, init: requestInit }) => {
      const response = await fetch(p, {
        method: requestInit?.method ?? 'GET',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(requestInit?.headers ?? {}),
        },
        body:
          requestInit?.body === undefined
            ? undefined
            : JSON.stringify(requestInit.body),
      });
      let json: unknown = null;
      const text = await response.text();
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
      }
      return { status: response.status, json };
    },
    { path, init },
  );
}
