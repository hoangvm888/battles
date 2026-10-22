import { test, expect, type Page } from '@playwright/test';

const pwaBase = process.env.PWA_BASE_URL;
test.skip(
  !pwaBase,
  'Set PWA_BASE_URL to a locally running production build to verify PWA behavior.',
);

async function cachedPaths(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
}

test('production PWA reuses original icons, activates at root and keeps API responses out of caches', async ({
  browser,
}) => {
  if (!pwaBase || !['127.0.0.1', 'localhost'].includes(new URL(pwaBase).hostname)) {
    throw new Error('PWA verification requires a local production build.');
  }
  const context = await browser.newContext({ baseURL: pwaBase, serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    const manifestResponse = await context.request.get('/manifest.json');
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toContain('Quizio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color.toLowerCase()).toBe('#613bff');
    let hasInstallIcon = false;
    for (const icon of manifest.icons) {
      const response = await context.request.get(
        new URL(icon.src, `${pwaBase}/manifest.json`).href,
      );
      expect(response.ok()).toBeTruthy();
      const image = await response.body();
      expect(image.subarray(1, 4).toString()).toBe('PNG');
      const width = image.readUInt32BE(16);
      const height = image.readUInt32BE(20);
      expect(icon.sizes.split(' ')).toContain(`${width}x${height}`);
      if (width >= 192 && height >= 192) hasInstallIcon = true;
    }
    expect(hasInstallIcon).toBeTruthy();
    const workerResponse = await context.request.get('/service-worker.js');
    expect(workerResponse.ok()).toBeTruthy();
    expect(workerResponse.headers()['content-type']).toMatch(/javascript/);
    expect(workerResponse.headers()['cache-control']).toMatch(/no-cache|no-store/);
    const missingScript = await context.request.get('/assets/missing-pwa-script.js');
    expect(missingScript.status()).toBe(404);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Quizio', exact: true })).toBeVisible();
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active && navigator.serviceWorker.controller;
    });
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe('/');
    await page.evaluate(async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error('Online API request failed');
      await response.json();
    });
    const paths = await cachedPaths(page);
    expect(paths).toContain('/index.html');
    expect(paths.some((path) => path.startsWith('/api/'))).toBeFalsy();
    expect(paths.some((path) => /\/assets\/.+\.js$/.test(path))).toBeTruthy();
    expect(paths.some((path) => /\/assets\/.+\.css$/.test(path))).toBeTruthy();

    await context.setOffline(true);
    await page.goto('/home.html');
    await expect(page.getByRole('heading', { name: 'Quizio', exact: true })).toBeVisible();
    await expect(
      page.getByText(/you are offline|offline.*reconnect|reconnect.*offline/i).first(),
    ).toBeVisible();
    for (const method of ['GET', 'POST']) {
      const result = await page.evaluate(async (requestMethod) => {
        try {
          const response = await fetch(requestMethod === 'GET' ? '/api/auth/me' : '/api/deposits', {
            method: requestMethod,
            ...(requestMethod === 'POST'
              ? { headers: { 'Content-Type': 'application/json' }, body: '{}' }
              : {}),
          });
          return { failed: false, status: response.status };
        } catch {
          return { failed: true, status: 0 };
        }
      }, method);
      expect(
        result.failed || result.status >= 500,
        `${method} API calls must fail offline`,
      ).toBeTruthy();
    }
    expect((await cachedPaths(page)).some((path) => path.startsWith('/api/'))).toBeFalsy();
    await context.setOffline(false);
    await page.reload();
    await expect
      .poll(async () => page.evaluate(async () => (await fetch('/api/health')).ok))
      .toBeTruthy();
  } finally {
    await context.close();
  }
});
