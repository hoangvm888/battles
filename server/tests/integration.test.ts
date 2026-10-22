import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';

type Json = Record<string, any>;
type Actor = { id: string; email: string; cookie: string; name: string };

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'TEST_DATABASE_URL is required. Integration tests never fall back to the application database.',
  );
const parsedTestUrl = new URL(testUrl);
if (process.env.DATABASE_URL) {
  const applicationUrl = new URL(process.env.DATABASE_URL);
  if (
    parsedTestUrl.host === applicationUrl.host &&
    parsedTestUrl.pathname === applicationUrl.pathname
  ) {
    throw new Error('TEST_DATABASE_URL must point to a different database than DATABASE_URL.');
  }
}
const testDatabase = parsedTestUrl.pathname;
if (!/test/i.test(testDatabase))
  throw new Error('TEST_DATABASE_URL must name a dedicated test database containing "test".');

process.env.NODE_ENV = 'test';
process.env.INITIAL_COINS = '1000';
const schema = `battles_test_${randomBytes(8).toString('hex')}`;
let control: Pool;
let pool: Pool;
let server: Server;
let base: string;
let admin: Actor;
let sequence = 0;

async function request(
  path: string,
  options: { method?: string; actor?: Actor; body?: Json } = {},
) {
  const headers: Record<string, string> = {};
  if (options.actor) headers.Cookie = options.actor.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body: Json = text ? JSON.parse(text) : {};
  return { response, body, status: response.status };
}

async function actor(name = 'Member'): Promise<Actor> {
  const email = `member-${++sequence}-${schema}@example.test`;
  const result = await request('/auth/register', {
    method: 'POST',
    body: { name, email, password: 'Test-Only-Password!2026' },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.user.balance, 1000);
  const cookie = result.response.headers.get('set-cookie');
  assert.ok(cookie?.includes('HttpOnly'), 'Session must use an HttpOnly cookie');
  assert.match(cookie!, /SameSite=Lax/i);
  return { id: result.body.user.id, name, email, cookie: cookie!.split(';')[0] };
}

async function createBattle(overrides: Json = {}) {
  const result = await request('/admin/battles', {
    method: 'POST',
    actor: admin,
    body: {
      title: `Integration battle ${++sequence}`,
      description: 'A transaction test battle',
      category: 'Technology',
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      multiplier: 1,
      options: [
        { label: 'First answer', odds: 2 },
        { label: 'Second answer', odds: 3 },
      ],
      ...overrides,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.battle;
}

async function balance(user: Actor) {
  const result = await request('/wallet', { actor: user });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.balance as number;
}

async function place(user: Actor, battle: Json, option: number, amount: number) {
  return request(`/battles/${battle.id}/bets`, {
    method: 'POST',
    actor: user,
    body: { optionId: battle.options[option].id, amount },
  });
}

async function closeAndSettle(battle: Json, option = 0) {
  const close = await request(`/admin/battles/${battle.id}/close`, {
    method: 'POST',
    actor: admin,
  });
  assert.equal(close.status, 200, JSON.stringify(close.body));
  return request(`/admin/battles/${battle.id}/settle`, {
    method: 'POST',
    actor: admin,
    body: { winningOptionId: battle.options[option].id },
  });
}

describe('PostgreSQL REST integration', { concurrency: false }, () => {
  before(async () => {
    control = new Pool({ connectionString: testUrl });
    await control.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    const { migrate } = await import('../migrate.js');
    await migrate(pool);
    const { createApp } = await import('../app.js');
    server = createApp({ pool }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    admin = await actor('Test Administrator');
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  });

  after(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    if (pool) await pool.end();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.end();
    }
  });

  it('registers, authenticates, revokes sessions and protects admin operations', async () => {
    const user = await actor('Authentication member');
    const me = await request('/auth/me', { actor: user });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, user.email);
    assert.equal(me.body.user.password, undefined);
    assert.equal(me.body.user.passwordHash, undefined);
    assert.equal((await request('/admin/users', { actor: user })).status, 403);
    assert.equal((await request('/wallet')).status, 401);
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: user.email, password: 'wrong-password' },
    });
    assert.equal(badLogin.status, 401);
    const duplicate = await request('/auth/register', {
      method: 'POST',
      body: { name: 'Duplicate', email: user.email, password: 'Test-Only-Password!2026' },
    });
    assert.equal(duplicate.status, 409);
    const logout = await request('/auth/logout', { method: 'POST', actor: user });
    assert.ok([200, 204].includes(logout.status));
    assert.equal((await request('/auth/me', { actor: user })).body.user, null);
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: user.email, password: 'Test-Only-Password!2026' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, user.id);
    assert.ok(login.response.headers.get('set-cookie')?.includes('HttpOnly'));
  });

  it('validates battle options, odds, stakes and permissions', async () => {
    const user = await actor('Validation member');
    const denied = await request('/admin/battles', { method: 'POST', actor: user, body: {} });
    assert.equal(denied.status, 403);
    const invalid = await request('/admin/battles', {
      method: 'POST',
      actor: admin,
      body: {
        title: 'Invalid battle',
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        multiplier: 1,
        options: [{ label: 'Only one', odds: 0 }],
      },
    });
    assert.equal(invalid.status, 400);
    const battle = await createBattle();
    assert.equal((await place(user, battle, 0, 0)).status, 400);
    assert.equal((await place(user, battle, 0, 1.5)).status, 400);
    assert.equal((await place(user, battle, 0, -1)).status, 400);
    assert.equal((await place(user, battle, 0, 1001)).status, 409);
    assert.equal(await balance(user), 1000);
    const badOption = await request(`/battles/${battle.id}/bets`, {
      method: 'POST',
      actor: user,
      body: { optionId: '00000000-0000-4000-8000-000000000000', amount: 10 },
    });
    assert.ok([400, 404].includes(badOption.status));
  });

  it('rejects cross-origin wallet/session mutations and ignores self-assigned privileges', async () => {
    const email = `privilege-${++sequence}-${schema}@example.test`;
    const registered = await request('/auth/register', {
      method: 'POST',
      body: {
        name: 'Privilege injection member',
        email,
        password: 'Test-Only-Password!2026',
        role: 'admin',
        balance: 999_999,
      },
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.user.role, 'user');
    assert.equal(registered.body.user.balance, 1000);
    const cookie = registered.response.headers.get('set-cookie')!.split(';')[0];
    const malicious = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'https://untrusted.example',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    assert.equal(malicious.status, 403);
    const valid = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(
      (await valid.json()).user.email,
      email,
      'A blocked request must not revoke the current session',
    );
  });

  it('enforces bcrypt’s 72-byte password limit for registration and login, including Unicode', async () => {
    const prefix = 'A'.repeat(72);
    const email = `password-limit-${++sequence}-${schema}@example.test`;
    const accepted = await request('/auth/register', {
      method: 'POST',
      body: { name: 'Password boundary member', email, password: prefix },
    });
    assert.equal(accepted.status, 201, 'Exactly 72 UTF-8 bytes must remain usable');
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email, password: prefix },
    });
    assert.equal(login.status, 200);
    const truncatedLogin = await request('/auth/login', {
      method: 'POST',
      body: { email, password: `${prefix}-ignored-suffix` },
    });
    assert.equal(
      truncatedLogin.status,
      400,
      'Different passwords sharing a 72-byte prefix must never authenticate',
    );
    const overlong = await request('/auth/register', {
      method: 'POST',
      body: {
        name: 'Overlong password member',
        email: `too-long-${++sequence}-${schema}@example.test`,
        password: `${prefix}B`,
      },
    });
    assert.equal(overlong.status, 400);
    const unicode = await request('/auth/register', {
      method: 'POST',
      body: {
        name: 'Unicode password member',
        email: `unicode-long-${++sequence}-${schema}@example.test`,
        password: '🚀'.repeat(19),
      },
    });
    assert.equal(
      unicode.status,
      400,
      '19 four-byte characters exceed bcrypt’s byte limit despite having fewer than72 characters',
    );
  });

  it('accepts only one concurrent immutable bet and debits exactly once', async () => {
    const user = await actor('Concurrent member');
    const battle = await createBattle();
    const outcomes = await Promise.all([place(user, battle, 0, 125), place(user, battle, 1, 125)]);
    assert.deepEqual(outcomes.map((item) => item.status).sort(), [201, 409]);
    assert.equal(await balance(user), 875);
    const bets = await request('/bets', { actor: user });
    assert.equal(bets.body.total, 1);
    assert.equal(bets.body.items[0].amount, 125);
    const cancellation = await request(`/bets/${bets.body.items[0].id}`, {
      method: 'DELETE',
      actor: user,
    });
    assert.ok(cancellation.status >= 400, 'No bet cancellation operation may exist');
    assert.equal(await balance(user), 875);
    const publicBattle = await request(`/battles/${battle.id}`);
    assert.equal(publicBattle.body.battle.totalPool, 125);
    assert.equal(publicBattle.body.battle.participantCount, 1);
  });

  it('serializes simultaneous debits across different battles without overdrawing', async () => {
    const user = await actor('Concurrent wallet member');
    const first = await createBattle();
    const second = await createBattle();
    const outcomes = await Promise.all([place(user, first, 0, 750), place(user, second, 0, 750)]);
    assert.deepEqual(outcomes.map((item) => item.status).sort(), [201, 409]);
    assert.equal(await balance(user), 250);
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM bets WHERE user_id = $1', [
      user.id,
    ]);
    assert.equal(count.rows[0].count, 1);
  });

  it('locks economic terms after the first bet and rejects bets after manual or scheduled close', async () => {
    const user = await actor('Closed battle member');
    const battle = await createBattle();
    assert.equal((await place(user, battle, 0, 10)).status, 201);
    const edit = await request(`/admin/battles/${battle.id}`, {
      method: 'PATCH',
      actor: admin,
      body: {
        multiplier: 9,
        options: battle.options.map((option: Json) => ({
          id: option.id,
          label: option.label,
          odds: 99,
        })),
      },
    });
    assert.equal(edit.status, 409);
    const earlySettle = await request(`/admin/battles/${battle.id}/settle`, {
      method: 'POST',
      actor: admin,
      body: { winningOptionId: battle.options[0].id },
    });
    assert.equal(earlySettle.status, 409);
    assert.equal(
      (await request(`/admin/battles/${battle.id}/close`, { method: 'POST', actor: admin })).status,
      200,
    );
    const another = await actor('Late member');
    assert.equal((await place(another, battle, 0, 10)).status, 409);
    const expired = await createBattle();
    await pool.query("UPDATE battles SET ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [
      expired.id,
    ]);
    assert.equal((await place(another, expired, 0, 10)).status, 409);
    assert.equal(await balance(another), 1000);
  });

  it('allows descriptive edits after betting without changing omitted battle terms', async () => {
    const user = await actor('Metadata editing member');
    const battle = await createBattle({
      description: 'Original description',
      category: 'Science',
      imageUrl: '/covers/original.png',
      multiplier: 1.75,
      options: [
        { label: 'Preserved first answer', odds: 2.25 },
        { label: 'Preserved second answer', odds: 3.5 },
      ],
    });
    assert.equal((await place(user, battle, 0, 50)).status, 201);
    const edited = await request(`/admin/battles/${battle.id}`, {
      method: 'PATCH',
      actor: admin,
      body: {
        title: 'Updated descriptive battle title',
        description: 'Updated description only',
      },
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.battle.title, 'Updated descriptive battle title');
    assert.equal(edited.body.battle.description, 'Updated description only');
    assert.equal(edited.body.battle.category, battle.category);
    assert.equal(edited.body.battle.imageUrl, battle.imageUrl);
    assert.equal(edited.body.battle.multiplier, battle.multiplier);
    assert.equal(edited.body.battle.endsAt, battle.endsAt);
    assert.deepEqual(
      edited.body.battle.options.map((option: Json) => ({
        id: option.id,
        label: option.label,
        odds: option.odds,
      })),
      battle.options.map((option: Json) => ({
        id: option.id,
        label: option.label,
        odds: option.odds,
      })),
    );
    const changedDeadline = await request(`/admin/battles/${battle.id}`, {
      method: 'PATCH',
      actor: admin,
      body: {
        endsAt: new Date(Date.now() + 172_800_000).toISOString(),
      },
    });
    assert.equal(
      changedDeadline.status,
      409,
      'An explicit closing-time edit remains locked after betting',
    );
  });

  it('settles stake-weighted payouts atomically and never credits concurrent settlement twice', async () => {
    const small = await actor('Small winning stake');
    const large = await actor('Large winning stake');
    const loser = await actor('Losing stake');
    const battle = await createBattle({ multiplier: 1.5 });
    assert.equal((await place(small, battle, 0, 100)).status, 201);
    assert.equal((await place(large, battle, 0, 300)).status, 201);
    assert.equal((await place(loser, battle, 1, 200)).status, 201);
    assert.equal(
      (await request(`/admin/battles/${battle.id}/close`, { method: 'POST', actor: admin })).status,
      200,
    );
    const outcomes = await Promise.all(
      [0, 1].map(() =>
        request(`/admin/battles/${battle.id}/settle`, {
          method: 'POST',
          actor: admin,
          body: { winningOptionId: battle.options[0].id },
        }),
      ),
    );
    assert.ok(
      outcomes.every((outcome) => [200, 409].includes(outcome.status)),
      JSON.stringify(outcomes),
    );
    assert.ok(outcomes.some((outcome) => outcome.status === 200));
    assert.equal(await balance(small), 1350, '600 × (100/400) × 2 × 1.5 = 450 payout');
    assert.equal(await balance(large), 2050, '600 × (300/400) × 2 × 1.5 = 1350 payout');
    assert.equal(await balance(loser), 800);
    const smallBets = await request('/bets', { actor: small });
    assert.equal(smallBets.body.items[0].payout, 450);
    assert.equal(smallBets.body.items[0].status, 'won');
    const losingBets = await request('/bets', { actor: loser });
    assert.equal(losingBets.body.items[0].status, 'lost');
    assert.equal(losingBets.body.items[0].payout, 0);
    const filtered = await request(`/admin/bets?userId=${large.id}&status=won`, { actor: admin });
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.items[0].payout, 1350);
  });

  it('rounds each payout down to integer coins and handles an answer with no winners', async () => {
    const a = await actor('Rounding A');
    const b = await actor('Rounding B');
    const c = await actor('Rounding C');
    const battle = await createBattle({
      multiplier: 1.1,
      options: [
        { label: 'Winner', odds: 1.15 },
        { label: 'Loser', odds: 2 },
      ],
    });
    await place(a, battle, 0, 1);
    await place(b, battle, 0, 2);
    await place(c, battle, 1, 4);
    assert.equal((await closeAndSettle(battle)).status, 200);
    assert.equal(await balance(a), 1001);
    assert.equal(await balance(b), 1003);
    assert.equal(await balance(c), 996);
    const noWinners = await createBattle();
    await place(a, noWinners, 1, 20);
    assert.equal((await closeAndSettle(noWinners, 0)).status, 200);
    assert.equal(await balance(a), 981);
  });

  it('rolls back every payout if a later winning wallet exceeds the supported limit', async () => {
    const users = [await actor('Rollback winner A'), await actor('Rollback winner B')].sort(
      (a, b) => a.id.localeCompare(b.id),
    );
    const ordinary = users[0],
      capped = users[1];
    const battle = await createBattle();
    assert.equal((await place(ordinary, battle, 0, 100)).status, 201);
    assert.equal((await place(capped, battle, 0, 100)).status, 201);
    const cap = 9_000_000_000_000_000n;
    await pool.query(
      `
      WITH adjusted AS (UPDATE users SET balance = $2 WHERE id = $1 RETURNING balance)
      INSERT INTO ledger(user_id,type,amount,balance_after,note)
      SELECT $1,'admin_adjustment',$3,balance,'Test-only limit setup' FROM adjusted
    `,
      [capped.id, cap.toString(), (cap - 900n).toString()],
    );
    const settlement = await closeAndSettle(battle);
    assert.equal(settlement.status, 409);
    assert.equal(await balance(ordinary), 900, 'The earlier wallet credit must roll back');
    assert.equal(await balance(capped), Number(cap));
    const result = await request(`/battles/${battle.id}`);
    assert.equal(result.body.battle.status, 'closed');
    const unchanged = await pool.query('SELECT status,payout FROM bets WHERE battle_id = $1', [
      battle.id,
    ]);
    assert.ok(unchanged.rows.every((row) => row.status === 'pending' && row.payout === '0'));
    const ledger = await pool.query(
      "SELECT COUNT(*)::int AS count FROM ledger WHERE type = 'payout' AND reference_id IN (SELECT id FROM bets WHERE battle_id = $1)",
      [battle.id],
    );
    assert.equal(ledger.rows[0].count, 0);
  });

  it('snapshots deposit packages and approves concurrent requests exactly once', async () => {
    const user = await actor('Depositing member');
    const offered = await request('/admin/packages', {
      method: 'POST',
      actor: admin,
      body: {
        name: `Integration offer ${++sequence}`,
        coins: 200,
        bonusCoins: 25,
        price: 10,
        originalPrice: 12,
        currency: 'USD',
        active: true,
      },
    });
    assert.equal(offered.status, 201, JSON.stringify(offered.body));
    const packageId = offered.body.package.id;
    const submitted = await request('/deposits', {
      method: 'POST',
      actor: user,
      body: {
        packageId,
        transferReference: `BANK-TEST-${sequence}`,
        note: 'Verified outside the application',
      },
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(await balance(user), 1000, 'Submitting a request cannot credit a wallet');
    assert.equal(
      (
        await request(`/admin/deposits/${submitted.body.deposit.id}/approve`, {
          method: 'POST',
          actor: user,
        })
      ).status,
      403,
    );
    const changed = await request(`/admin/packages/${packageId}`, {
      method: 'PATCH',
      actor: admin,
      body: { coins: 999, bonusCoins: 0, price: 99, originalPrice: 99 },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const approvals = await Promise.all(
      [0, 1].map(() =>
        request(`/admin/deposits/${submitted.body.deposit.id}/approve`, {
          method: 'POST',
          actor: admin,
          body: { note: 'Bank transfer verified' },
        }),
      ),
    );
    assert.ok(approvals.every((outcome) => [200, 409].includes(outcome.status)));
    assert.ok(approvals.some((outcome) => outcome.status === 200));
    assert.equal(
      await balance(user),
      1225,
      'Approval uses the requested package snapshot, exactly once',
    );
    const deposits = await request('/deposits', { actor: user });
    assert.equal(deposits.body.items[0].status, 'approved');
    assert.equal(deposits.body.items[0].coins, 225);
  });

  it('preserves omitted package terms during active-only and name-only partial edits', async () => {
    const offered = await request('/admin/packages', {
      method: 'POST',
      actor: admin,
      body: {
        name: `Partial edit offer ${++sequence}`,
        coins: 700,
        bonusCoins: 175,
        price: 18.5,
        originalPrice: 24,
        currency: 'EUR',
        active: true,
      },
    });
    assert.equal(offered.status, 201, JSON.stringify(offered.body));
    const original = offered.body.package;
    const deactivated = await request(`/admin/packages/${original.id}`, {
      method: 'PATCH',
      actor: admin,
      body: { active: false },
    });
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
    assert.deepEqual(deactivated.body.package, { ...original, active: false });
    const renamed = await request(`/admin/packages/${original.id}`, {
      method: 'PATCH',
      actor: admin,
      body: { name: 'Renamed inactive offer' },
    });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.deepEqual(renamed.body.package, {
      ...original,
      active: false,
      name: 'Renamed inactive offer',
    });
    const publicPackages = await request('/packages');
    assert.ok(
      !publicPackages.body.items.some((item: Json) => item.id === original.id),
      'Renaming must not reactivate an inactive package',
    );
  });

  it('never approves a rejected deposit or exposes another user’s private records', async () => {
    const user = await actor('Rejected depositor');
    const other = await actor('Private records member');
    const offered = await request('/admin/packages', {
      method: 'POST',
      actor: admin,
      body: {
        name: `Rejected offer ${++sequence}`,
        coins: 100,
        bonusCoins: 0,
        price: 5,
        originalPrice: 5,
        currency: 'USD',
        active: true,
      },
    });
    const submitted = await request('/deposits', {
      method: 'POST',
      actor: user,
      body: {
        packageId: offered.body.package.id,
        transferReference: `REJECT-${sequence}`,
      },
    });
    const rejection = await request(`/admin/deposits/${submitted.body.deposit.id}/reject`, {
      method: 'POST',
      actor: admin,
      body: { note: 'Transfer not received' },
    });
    assert.equal(rejection.status, 200);
    const approval = await request(`/admin/deposits/${submitted.body.deposit.id}/approve`, {
      method: 'POST',
      actor: admin,
    });
    assert.equal(approval.status, 409);
    assert.equal(await balance(user), 1000);
    const own = await request('/deposits', { actor: other });
    assert.equal(own.body.total, 0);
    assert.equal(own.body.items.length, 0);
  });

  it('prevents two users from claiming the same bank transfer reference', async () => {
    const a = await actor('Transfer claimant A');
    const b = await actor('Transfer claimant B');
    const offered = await request('/admin/packages', {
      method: 'POST',
      actor: admin,
      body: {
        name: `Reference offer ${++sequence}`,
        coins: 100,
        bonusCoins: 0,
        price: 5,
        originalPrice: 5,
        currency: 'USD',
        active: true,
      },
    });
    const reference = `Shared-Bank-${sequence}`;
    const first = await request('/deposits', {
      method: 'POST',
      actor: a,
      body: { packageId: offered.body.package.id, transferReference: reference },
    });
    assert.equal(first.status, 201);
    const second = await request('/deposits', {
      method: 'POST',
      actor: b,
      body: { packageId: offered.body.package.id, transferReference: reference.toLowerCase() },
    });
    assert.equal(second.status, 409);
    assert.equal((await request('/deposits', { actor: b })).body.total, 0);
    assert.equal(await balance(a), 1000);
    assert.equal(await balance(b), 1000);
  });

  it('returns public leaderboard windows and ranks actual settled performance', async () => {
    const result = await request('/leaderboard?period=weekly');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.period, 'weekly');
    assert.equal(result.body.metric, 'net_profit');
    assert.ok(result.body.items.some((entry: Json) => entry.netProfit > 0));
    assert.ok(
      result.body.items.every(
        (entry: Json, index: number, items: Json[]) =>
          index === 0 || items[index - 1].score >= entry.score,
      ),
    );
    assert.equal(new Date(result.body.startsAt).getUTCDay(), 1, 'Weekly boundaries use Monday UTC');
    assert.equal(new Date(result.body.startsAt).getUTCHours(), 0);
    const invalid = await request('/leaderboard?period=forever');
    assert.equal(invalid.status, 400);
    const settings = await request('/admin/settings', {
      method: 'PATCH',
      actor: admin,
      body: { rankingMetric: 'gross_payout' },
    });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    const gross = await request('/leaderboard?period=monthly');
    assert.equal(gross.body.metric, 'gross_payout');
    assert.ok(gross.body.items.every((entry: Json) => entry.score === entry.totalPayout));
  });

  it('reconciles every wallet against the immutable signed coin ledger', async () => {
    const mismatch = await pool.query(`
      SELECT u.id, u.balance, COALESCE(SUM(l.amount), 0) AS ledger_balance
      FROM users u LEFT JOIN ledger l ON l.user_id = u.id
      GROUP BY u.id HAVING u.balance <> COALESCE(SUM(l.amount), 0) OR u.balance < 0
    `);
    assert.deepEqual(mismatch.rows, [], 'All coin mutations must have matching ledger entries');
    const repeated = await pool.query(`
      SELECT type, reference_id, COUNT(*)::int AS count FROM ledger
      WHERE type IN ('deposit', 'payout') AND reference_id IS NOT NULL
      GROUP BY type, reference_id HAVING COUNT(*) > 1
    `);
    assert.deepEqual(
      repeated.rows,
      [],
      'A deposit or bet payout must never produce duplicate credits',
    );
  });
});

describe('UTC ranking periods', () => {
  it('handles Monday rollover, year boundaries, leap months and 3-month seasons', async () => {
    const { periodBounds } = await import('../domain.js');
    const weekly = periodBounds('weekly', new Date('2026-01-01T23:59:59.000Z'));
    assert.equal(new Date(weekly.startsAt).toISOString(), '2025-12-29T00:00:00.000Z');
    assert.equal(new Date(weekly.endsAt).toISOString(), '2026-01-05T00:00:00.000Z');
    const monthly = periodBounds('monthly', new Date('2024-02-29T12:00:00.000Z'));
    assert.equal(new Date(monthly.startsAt).toISOString(), '2024-02-01T00:00:00.000Z');
    assert.equal(new Date(monthly.endsAt).toISOString(), '2024-03-01T00:00:00.000Z');
    const seasonal = periodBounds('seasonal', new Date('2026-12-31T23:59:59.000Z'));
    assert.equal(new Date(seasonal.startsAt).toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(new Date(seasonal.endsAt).toISOString(), '2027-01-01T00:00:00.000Z');
    const boundary = periodBounds('weekly', new Date('2026-10-19T00:00:00.000Z'));
    assert.equal(new Date(boundary.startsAt).toISOString(), '2026-10-19T00:00:00.000Z');
  });

  it('calculates payouts with integer arithmetic beyond floating point precision', async () => {
    const { calculatePayout, safeNumber } = await import('../domain.js');
    assert.equal(calculatePayout(600n, 100n, 400n, 20_000n, 15_000n), 450n);
    assert.equal(calculatePayout(7n, 1n, 3n, 11_500n, 11_000n), 2n);
    assert.equal(calculatePayout(7n, 2n, 3n, 11_500n, 11_000n), 5n);
    assert.equal(calculatePayout(100n, 0n, 0n, 20_000n, 10_000n), 0n);
    const pool = 8_999_999_999_999_999n;
    assert.equal(
      calculatePayout(pool, 2n, 3n, 10_001n, 10_003n),
      (pool * 2n * 10_001n * 10_003n) / (3n * 100_000_000n),
    );
    assert.throws(() => safeNumber(9_007_199_254_740_993n), /supported limit/);
  });
});
