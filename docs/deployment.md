# Deployment and operations

The application consists of a React/Vite frontend developed from the original Quizio PWA in `src`, a Node.js/Express API, and PostgreSQL. Production serves the compiled frontend and `/api` from the same origin. The development Vite server proxies `/api` to the local API process.

Use the repository's root [README](../README.md) for a quick start. This guide describes the commands, operational requirements, and recovery procedure.

## Local development

Use Node.js 24, npm, and Docker Compose. Node.js must be at least 22.12 for the frontend toolchain.

For a new local Compose setup, the shortest path is `npm ci`, `npm run setup:dev -- --demo`, then `npm run dev`. The helper generates local credentials only when `.env` does not exist, waits for PostgreSQL, and applies migrations/seeding. Use the manual steps below for your own database or credentials.

```bash
npm ci
test -f .env || cp .env.example .env
```

Before continuing, edit `.env`. Choose a database password, use that same password in `POSTGRES_PASSWORD` and both database connection strings, and set a unique `ADMIN_EMAIL` and `ADMIN_PASSWORD` of at least 12 characters. Keep `APP_ORIGIN` equal to the browser origin used for development, normally `http://localhost:5173`.

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

The combined development command runs the API on port 3001 and Vite on port 5173. The frontend proxies `/api` to the API; use the frontend origin to sign in and browse. Keep hostnames consistent: `localhost` and `127.0.0.1` are different origins for mutation checks and cookies.

Seeding with `DEMO_MODE=false` creates only the explicitly configured initial admin. To populate development examples and a demo player, set `DEMO_MODE=true` before running `npm run db:seed`. Demo seeding is refused when `NODE_ENV=production`; do not enable this mode on a public deployment.

The explicitly enabled development seed adds `demo@battle.local` with password `DemoPlayer123!`. It uses the configured admin credentials when present. Only when no admin credentials are supplied does demo mode create the fallback `admin@battle.local` / `DemoAdmin123!` account. These are intentionally public development credentials; production seeding has no fallback credentials. Rerunning the seed preserves existing accounts and balances rather than resetting passwords.

Useful checks:

```bash
npm run typecheck
npm run build
```

The integration tests require their own PostgreSQL database via `TEST_DATABASE_URL`. With the supplied Compose service, create it once:

```bash
docker compose exec db createdb -U battles battles_test
npm test
```

The configured database name must contain `test` and differ from `DATABASE_URL`. Each test run creates and removes an isolated schema. Never point the test variable to a database with useful data. Stop the development watcher before `npm ci` refreshes `node_modules`; restart it after installation completes.

The development server does not register a service worker, so hot reloads do not use a stale cached app. Use a built application for PWA verification; see [PWA behavior and verification](pwa.md).

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection string for the application and migration/seed commands |
| `TEST_DATABASE_URL` | Separate disposable PostgreSQL database for integration tests |
| `POSTGRES_PASSWORD` | Password used to provision the Compose PostgreSQL service; match `DATABASE_URL` |
| `NODE_ENV` | `development` locally; `production` for deployment and secure cookies |
| `APP_ORIGIN` | Exact public origin allowed to submit browser mutations; use the external HTTPS origin in production |
| `PORT` | API listening port, default `3001` |
| `HOST` | Optional API listening address; the process must accept container traffic when deployed in a container |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Explicit initial admin credentials used by the seed command; password must be at least 12 characters and at most 72 UTF-8 bytes |
| `DEMO_MODE` | Explicit opt-in to development demo content/accounts; prohibited in production |
| `TRUST_PROXY` | Leave `0` for direct access; `1` only when exactly one trusted reverse proxy fronts Node |
| `INITIAL_COINS` | Optional welcome simulation balance, default `1000` |
| `SESSION_DAYS` | Optional session lifetime in days, default `7` |

## Production prerequisites

- Use the Node.js version pinned by the project and a supported PostgreSQL deployment.
- Provision a persistent PostgreSQL volume or managed database. Database data is not part of the frontend build or application image.
- Supply a database connection string through the deployment secret manager or process environment.
- Create the initial admin with an explicit email and a strong password. Do not enable demo account seeding in production.
- Set the public application origin to the exact HTTPS origin used by players.
- Terminate HTTPS at the application or a trusted reverse proxy. Secure session cookies require HTTPS in production.

Keep `.env` files and database backups out of Git. The application does not need a payment-gateway key because it never contacts a payment processor.

## Release procedure

1. Back up the PostgreSQL database before a schema-changing release.
2. Install the exact dependencies from the lockfile.
3. Run the database migrations once for the release.
4. Build the React client and backend according to the root scripts.
5. Start the production API process with the production environment loaded.
6. Verify the health endpoint and a public battle-list request.
7. Sign in as a regular user and verify wallet/history access. Sign in as an administrator and verify the CMS role boundary.

Run migrations as a release task rather than starting several replicas that race to modify the schema. Do not run a development seed command against a production database. Build output is replaceable; the PostgreSQL database is the durable source of accounts, balances, bets, and approvals.

### Using the supplied container image

Set `APP_ORIGIN` to the external HTTPS origin, choose a production PostgreSQL password, and configure a reverse proxy before exposing the service. The supplied Compose file binds the HTTP service and database to loopback on the host; it does not configure TLS.

```bash
docker compose up -d db
docker compose --profile app build app
docker compose --profile app run --rm app node dist/server/migrate.js
```

For the initial admin, inject `ADMIN_EMAIL` and `ADMIN_PASSWORD` securely into the host process environment, then run:

```bash
docker compose --profile app run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD app node dist/server/seed.js
docker compose --profile app up -d app
```

The `-e NAME` form forwards values already present in the host process environment. A variable listed only in Compose's `.env` file is not automatically exported to that process. Avoid putting the password directly in the command or a shared terminal history. The app profile always sets `DEMO_MODE=false`.

### Running Node directly

Build in the repository root and use the compiled migration, seed, and server entry points:

```bash
npm ci
npm run build
node dist/server/migrate.js
node dist/server/seed.js
npm start
```

Inject production configuration before these commands. The compiled commands do not require `tsx`. Production must retain `client/dist`, `dist/server`, and `server/migrations` alongside the production dependencies. The Dockerfile copies these paths into its runtime image.

### Building behind a trusted network proxy

Docker builds can forward proxy variables without embedding their values in the image. If your proxy uses an organization certificate authority, supply its public CA certificate as the optional `build_ca` BuildKit secret. npm still verifies HTTPS and lockfile integrity:

```bash
docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --secret id=build_ca,src=/path/to/organization-ca.pem -t battles-app .
```

If the proxy hostname exists only in the host's local resolver/hosts file, also supply its trusted address with Docker's `--add-host` build option. A normal Internet-connected build needs none of these extra options.

## Reverse proxy

Route both the frontend and `/api` to the application origin. Forward the original protocol consistently when TLS terminates before Node. Configure the application's proxy-trust setting only for proxies you actually control; accepting arbitrary forwarded addresses undermines IP-based rate limits.

Preserve `/manifest.json`, `/service-worker.js` and `/assets/` on that same origin. The worker and app HTML must be revalidated rather than served indefinitely from a proxy cache; versioned build assets can be cached for longer. Missing JavaScript or image files must remain HTTP 404 responses instead of receiving the SPA HTML fallback.

Do not expose PostgreSQL publicly unless access is explicitly restricted. A production browser does not connect to PostgreSQL directly.

## Admin onboarding

After the initial admin can sign in:

1. Replace example bank-transfer instructions with the real public deposit instructions.
2. Review coin packages and disable any package you do not offer.
3. Review enabled leaderboard periods and the scoring metric.
4. Create a small test battle with explicit closing time and choices.
5. In a nonproduction environment, verify a complete bet and settlement flow and a manual deposit approval.

Do not publish demo passwords or shared administrator credentials. Creating additional administrative accounts or changing account roles should remain a controlled database/operator task unless a dedicated role-management feature is added.

## Monitoring

Monitor process health, database connectivity, API failures, repeated login failures, pending deposits, and battles awaiting settlement. Record logs with timestamps and request identifiers where your host supports them. Do not log passwords, session cookie contents, or database credentials.

The API can reject late bets without a background scheduler. Closing-time enforcement does not automatically determine a correct answer: an administrator must still resolve each battle.

## Backups and recovery

Use scheduled database backups with retention suited to the application's usage. A backup is useful only after a restore has been tested.

An operator with database access can take a logical PostgreSQL backup using standard tooling:

```bash
pg_dump --format=custom --file=battles.backup "$DATABASE_URL"
```

Store the backup securely outside the running application container. Restore into an empty recovery database rather than overwriting the only live database:

```bash
pg_restore --no-owner --dbname="$RECOVERY_DATABASE_URL" battles.backup
```

The shell expands these variables locally; do not paste the connection-string values into tickets, chat, or logs. A restore changes balances and approvals back to the backup point. Reconcile transfers and settlements performed after that point before accepting new activity.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API cannot start | Database URL, PostgreSQL readiness, applied migrations, process port |
| Browser requests the wrong API host | Development proxy or production same-origin routing |
| Login succeeds but the next request is unauthorized | Cookie origin, HTTPS, secure-cookie configuration, reverse proxy headers |
| Bet is rejected after the page showed it open | Server closing time, manual closure, refreshed balance, selected answer |
| Approval does not add coins again | Check whether the request is already approved; approval is intentionally idempotent |
| Closed battle has no payout | An admin must select the result and settle; check whether the user selected the winning answer |
| Leaderboard changes at an unexpected local time | Period boundaries use UTC, not the browser's timezone |
| Installed app still shows an older version | Reconnect, wait for the update action, and accept it after finishing open forms; check that the proxy revalidates the worker and app HTML |
| Offline app opens but account actions fail | Only the public shell/assets work offline; API operations require a connection |

See [Using Quizio Battles](usage.md) for player/admin workflows, [PWA behavior](pwa.md) for caching/install checks, and [Virtual-coin accounting](accounting.md) for payout rules.
