# Quizio PWA behavior and verification

The application uses the original Quizio PWA sources alongside the React screens in `src/app`. The build compiles `src/assets/css/style.scss` with the Quizio Tailwind theme, serves the original illustrations at `/assets/images/`, and emits the existing manifest/worker sources at their required root URLs:

| Source | Built URL |
| --- | --- |
| `src/manifest.json` | `/manifest.json` |
| `src/assets/js/service-worker.js` | `/service-worker.js` |
| `src/assets/images` | `/assets/images/` |

Poppins and interface icons are bundled locally. The application does not require a font or icon CDN to render.

## Install and update

Service-worker registration is enabled for production builds, so development hot reloads remain uncached. Installability requires a supported browser and a secure origin: HTTPS in deployment, or localhost for a local check. Browser-specific install/Add to Home Screen controls may differ.

A new worker waits for the user to accept the app's update action. It then activates and reloads the page. Finish open forms before accepting an update. The worker removes older app-owned cache versions during activation.

## Offline boundary

The cache contains the public HTML shell and its versioned JavaScript, CSS, fonts and template images. Navigation uses the network when available, with the public shell as an offline fallback.

API requests, session/account data, wallet balances, bet/deposit history and write requests are never cached or queued by the worker. Offline access does not imply that a bet or deposit was accepted. The server remains authoritative for every balance and transaction.

## Verify a built application

First complete local database setup, then build and run the compiled app. This POSIX-shell example uses port 3003 so the regular development app can remain on ports 5173/3001:

```bash
npm run build
PORT=3003 APP_ORIGIN=http://127.0.0.1:3003 NODE_ENV=development npm start
```

For local verification, keep the API runtime in `NODE_ENV=development` and set `APP_ORIGIN` to the browser origin used by the compiled server. The built frontend still enables service-worker registration. An actual production deployment uses `NODE_ENV=production`, HTTPS and secure cookies.

Check that the manifest and root worker return their own content, and that referenced icons/images return HTTP 200. In browser developer tools, wait for the worker to control the page, reload once while connected, then switch the browser offline:

1. A public route can reopen the app shell.
2. The offline notice is visible.
3. API reads fail rather than returning a cached balance or account response.
4. Bet/deposit submissions cannot report success offline.
5. Cache Storage contains no `/api/` requests.

The browser test suite includes an opt-in PWA check. In a second terminal, point it at the built local app:

```bash
PWA_BASE_URL=http://127.0.0.1:3003 npm run test:e2e -- pwa.spec.ts
```

If using the preinstalled system browser, also set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. Normal development checks can run separately with `npm run test:e2e -- battles.spec.ts`. Run both suites against disposable local data rather than production.

For deployment, ensure the reverse proxy revalidates `/service-worker.js` and HTML. Do not rewrite missing asset requests to the SPA HTML page; an invalid JavaScript response can prevent a worker update.
