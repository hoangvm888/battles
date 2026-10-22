# REST API

All endpoints are under `/api`. Request and response bodies use JSON and camelCase field names. The browser sends the session cookie with requests; do not store a session token in local storage.

## Authentication and errors

Registering or logging in sets an `HttpOnly`, `SameSite=Lax` session cookie. Production cookies are also `Secure`, so production browser access must use HTTPS. Logout revokes the current server-side session.

Browser mutations must originate from `APP_ORIGIN`. Serve the application and API through one origin in production, or use Vite's configured API proxy during development. Cookie authentication does not grant administrative access: `/admin` routes independently require an admin account.

Errors use this shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "A message suitable for displaying to the user."
  }
}
```

Expect `400` for invalid inputs, `401` for missing/invalid authentication, `403` for insufficient privileges or a disallowed origin, `404` for absent resources, and `409` for state conflicts such as a closed battle or a duplicate bet. Login and registration are rate limited.

Paginated lists use:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

Use the returned `pageSize` when calculating whether another page exists. Pagination accepts `page` from 1 to 100,000 and `pageSize` from 1 to 100; the defaults are 1 and 20. Resource IDs are UUIDs. Coin amounts are JSON integers within the API's supported safe range; prices are decimal currency amounts, and dates are ISO timestamps.

## Public and authentication endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process/database readiness |
| `POST` | `/auth/register` | Create a player account and session |
| `POST` | `/auth/login` | Authenticate an existing account |
| `POST` | `/auth/logout` | Revoke the current session |
| `GET` | `/auth/me` | Current user, or `user: null` when unauthenticated |
| `GET` | `/battles` | Browse battles |
| `GET` | `/battles/:id` | Battle details, answer options, pool, and outcome |
| `GET` | `/packages` | Active coin packages |
| `GET` | `/settings` | Public bank instructions and leaderboard settings |
| `GET` | `/leaderboard?period=weekly` | Public rankings for `weekly`, `monthly`, or `seasonal` |

Registration body:

```json
{
  "name": "Alex",
  "email": "alex@example.com",
  "password": "a-unique-long-password"
}
```

Login accepts `email` and `password`. Registration requires a name of 2–80 characters and a password of at least 10 characters, with at most 72 UTF-8 bytes. Emails are normalized to lowercase. Authentication responses return a `user` object without password hashes or session-token values.

Battle lists accept `status=open|closed|settled`, `category`, and `search` in addition to pagination. A passed closing time is represented as `closed` even if the administrator did not perform a manual close. Battle details return `{ "battle": { ... }, "myBet": null }`, with the authenticated user's bet in `myBet` when one exists.

## Player endpoints

These endpoints require an authenticated account.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/battles/:id/bets` | Submit the user's one immutable bet on that battle |
| `GET` | `/bets` | Current user's bet history; `status=pending`, `won`, or `lost` filters outcomes |
| `GET` | `/wallet` | Current balance and paginated ledger entries |
| `GET` | `/deposits` | Current user's deposit requests |
| `POST` | `/deposits` | Request manual review of a completed external bank transfer |

Bet body:

```json
{
  "optionId": "00000000-0000-4000-8000-000000000000",
  "amount": 100
}
```

The UUID above is illustrative; use an option belonging to the requested battle. The API debits the wallet and records the bet in one transaction. There is no cancel, update, or delete-bet endpoint.

Deposit body:

```json
{
  "packageId": "00000000-0000-4000-8000-000000000000",
  "transferReference": "BANK-REFERENCE-FROM-YOUR-TRANSFER",
  "note": "Optional information for the reviewing administrator"
}
```

The server snapshots the package's coin total, price, and currency; a client cannot choose its own coin credit or claimed price. Submitting this request does not credit the wallet or initiate a payment.

## Administrator endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/admin/battles` | List battles for management |
| `POST` | `/admin/battles` | Create a battle and its options |
| `PATCH` | `/admin/battles/:id` | Edit allowed battle fields |
| `POST` | `/admin/battles/:id/close` | Stop accepting new bets |
| `POST` | `/admin/battles/:id/settle` | Record the correct answer and distribute payouts |
| `GET` | `/admin/bets` | Inspect all bets with filters |
| `GET` | `/admin/users` | Inspect player balances/accounts |
| `GET` | `/admin/overview` | Aggregate user, battle, deposit, and coin statistics |
| `GET` | `/admin/deposits` | Review deposit requests |
| `POST` | `/admin/deposits/:id/approve` | Credit a pending request after bank verification |
| `POST` | `/admin/deposits/:id/reject` | Reject a pending request without a credit |
| `GET` | `/admin/packages` | List all coin packages, including inactive offers |
| `POST` | `/admin/packages` | Create a coin package |
| `PATCH` | `/admin/packages/:id` | Change a package or deactivate it |
| `GET` | `/admin/settings` | Read settings for administration |
| `PATCH` | `/admin/settings` | Update bank instructions and ranking rules |

The public `/packages` endpoint always returns only active packages. Use `/admin/packages` to manage inactive offers. Administrative bet lists accept `userId`, `battleId`, `status`, and user `search`. Administrative deposit lists accept `status` and `search` across the user's name/email and transfer reference. User lists accept `search` across names and emails.

Example battle creation body:

```json
{
  "title": "Which technology will lead the next release?",
  "description": "Choose the result you expect before the deadline.",
  "category": "Technology",
  "endsAt": "2030-12-01T18:00:00.000Z",
  "multiplier": 1.5,
  "options": [
    { "label": "Option A", "odds": 2 },
    { "label": "Option B", "odds": 3 }
  ]
}
```

Settlement accepts `{ "winningOptionId": "<option UUID>" }`. Deposit approval and rejection accept an optional `{ "note": "Review explanation" }`.

Battle answer options, odds, multiplier, and closing time are locked after the first bet. While a battle is still open, descriptive fields can be edited without changing its reward terms. Closed and settled battles cannot be edited. A repeated settlement with the same result returns the existing settled battle; a different result is rejected. Repeating the same deposit decision returns the existing decision without crediting again; changing a completed decision is rejected.

Example coin package:

```json
{
  "name": "Starter pack",
  "coins": 1000,
  "bonusCoins": 100,
  "price": 10,
  "originalPrice": 12,
  "currency": "USD",
  "active": true
}
```

The package offers `coins + bonusCoins` for the current `price`. `originalPrice` represents the pre-discount price and cannot be below the current price. Deactivate an offer instead of deleting terms referenced by existing requests.

Settings accept a partial update of these fields:

```json
{
  "bankName": "Bank name",
  "bankAccountName": "Public account holder name",
  "bankAccountNumber": "Public transfer account number",
  "transferInstructions": "Instructions shown before submitting a deposit request",
  "currency": "USD",
  "rankingMetric": "net_profit",
  "enabledPeriods": ["weekly", "monthly", "seasonal"]
}
```

The alternative ranking metric is `gross_payout`. At least one distinct period must remain enabled. Public settings are intentionally readable by unauthenticated visitors; do not store secrets in those fields.

## State transitions

```text
battle:  open → closed → settled
bet:     pending → won | lost
deposit: pending → approved | rejected
```

The closing timestamp also prevents late bets even before an administrator performs manual close. Bets and package terms are checked on the server at request time. Settlement and deposit approval serialize competing requests so a retry cannot issue another payout or coin credit.

See [Virtual-coin accounting](accounting.md) for the exact payout formula and period attribution. See [Using Battle Arena](usage.md) for the CMS review procedure.
