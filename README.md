# Quizio Battles

A mobile-first battle application built from the existing Quizio PWA template in `src`. React screens reuse its layout, purple/orange theme, Poppins typography and original illustrations. The application includes a Node.js REST API, PostgreSQL accounting, and a custom administrator CMS. Coins cannot be withdrawn or redeemed for cash.

## Run locally

Requires Node.js 24 (minimum 22.12), npm, and Docker Compose or PostgreSQL 17.

To try the application, start Docker Desktop and run:

```bash
git clone https://github.com/hoangvm888/battles.git
cd battles
npm ci
npm run setup:dev -- --demo
npm run dev
```

Open `http://127.0.0.1:5173` on your own machine. The setup generates ignored local credentials, starts PostgreSQL, migrates and seeds the app. Existing `.env` files are preserved. Administrator credentials are saved in `.env`. The demo player is listed below. Use the manual configuration below when choosing your own credentials or database.

```bash
npm ci
cp .env.example .env
```

Edit `.env`: choose a unique database password, match it in both database URLs, and set your initial administrator email/password. Set `APP_ORIGIN` to the exact browser origin, normally `http://localhost:5173`. Keep passwords out of Git. Choose `DEMO_MODE=true` only for a local demo; it adds example battles/packages and a demo player. Production refuses demo seeding.

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open the frontend on port 5173. The API runs on port 3001; Vite proxies `/api`. Log in with the administrator credentials you configured, then use **Admin** to configure bank-transfer instructions, coin packages, and battles. A new player receives 1,000 simulation coins by default (`INITIAL_COINS` configures this).

When explicitly seeded in development, the demo player is `demo@battle.local` / `DemoPlayer123!`. Do not use demo accounts in a public deployment. Re-running migrations/seeding preserves existing accounts, balances and records; seeding does not reset passwords.

## Features

- Registration/login with hashed passwords and server-side cookie sessions.
- Public topic battles, multiple choices, odds, topic multipliers, deadlines and manual closure.
- One final bet per user per battle, with an explicit confirmation and no cancellation.
- Wallet balance and an accounting ledger for welcome coins, bets, deposits and payouts.
- Manual bank-transfer requests with snapshotted packages and administrator approval/rejection.
- Bet history, results and payouts; public weekly, monthly and three-month seasonal rankings.
- Administrator CMS for battles/results, all bets and users, deposits, offers/discounts, bank instructions and leaderboard rules.
- Installable PWA with an offline public app shell. Account data and financial actions require a live API connection.

Payout is `floor(total pool × your stake / all stakes on the winning answer × answer odds × battle multiplier)`. Multipliers can create additional virtual coins. Financial operations use database transactions and locks; repeated approval/settlement never credits twice. Odds, choices, multiplier and closing time lock after the first bet.

## Validate

```bash
npm run build
# Create the separate disposable test database once; match TEST_DATABASE_URL.
docker compose exec db createdb -U battles battles_test
npm test
```

The integration suite creates/drops an isolated schema in `TEST_DATABASE_URL`; it refuses the application database. It covers competing bets, overdrafts, exact payout rounding, settlement rollback/idempotence, manual deposits, authorization and calendar ranking boundaries.

Browser checks require a running local development app, seeded administrator credentials in `.env`, and a Chromium installation:

```bash
npx playwright install chromium
npm run test:e2e
```

For a preinstalled system browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. The browser suite creates clearly named test users/battles/deposits in the local development database; run it on disposable data, never on production.

The service worker registers in production builds. See [PWA behavior and verification](docs/pwa.md) for install/offline checks against a built application.

## Source layout

- `src/*.html`: original Quizio page templates used to adapt the React screens. Relevant original page URLs have aliases in the application; unrelated template pages are not additional backend features.
- `src/app`: React screens for battles, authentication, wallet, history, rankings and admin.
- `src/assets/css/style.scss` and the Tailwind configuration: the existing Quizio styles and theme compiled into the app.
- `src/assets/images`: original artwork, logos and PWA icons, served at `/assets/images/`.
- `src/manifest.json` and `src/assets/js/service-worker.js`: PWA sources emitted at `/manifest.json` and `/service-worker.js` during the build.
- `index.html`: application entry loading `src/app/main.tsx`; `client` contains the Vite configuration and generated production output.
- `server`: REST API, database migrations and exact coin-accounting logic.

## Deploy and use

- [Deployment, configuration, backups and troubleshooting](docs/deployment.md)
- [Player and administrator guide](docs/usage.md)
- [Payouts, coin accounting and ranking rules](docs/accounting.md)
- [REST API reference](docs/api.md)
- [PWA behavior and verification](docs/pwa.md)

`npm run build` emits `client/dist` and `dist/server`. Production uses `npm start` to serve both the UI and API from one origin. The supplied Dockerfile and Compose app profile support a PostgreSQL-backed deployment behind HTTPS. Publication/deployment and real bank details remain operator configuration.

The pre-existing root `dist` contains the old template build. The current production build is `client/dist`; it is generated from the Quizio sources above.
