import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { ApiError, calculatePayout, periodBounds, safeNumber, type Period } from './domain.js';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  balance: number;
  createdAt: string;
};
type AuthRequest = Request & { user?: User; sessionHash?: string };
type DB = Pool | PoolClient;
const uuid = z.string().uuid();
const money = z.number().finite().min(0.01).max(1_000_000).multipleOf(0.01);
const coins = z.number().int().min(1).max(1_000_000_000);
const ratio = z.number().finite().min(0.01).max(100).multipleOf(0.0001);
const optionSchema = z.object({
  id: uuid.optional(),
  label: z.string().trim().min(1).max(150),
  odds: ratio,
});
const battleSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().max(10000).default(''),
  category: z.string().trim().min(1).max(60).default('General'),
  imageUrl: z
    .string()
    .trim()
    .max(1000)
    .refine(
      (v) => !v || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v),
      'Use a local absolute path or an HTTP(S) image URL.',
    )
    .default(''),
  endsAt: z.string().datetime({ offset: true }),
  multiplier: ratio.default(1),
  options: z.array(optionSchema).min(2).max(10),
});
const packageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  coins,
  bonusCoins: z.number().int().min(0).max(1_000_000_000).default(0),
  price: money,
  originalPrice: money,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  active: z.boolean().default(true),
});
const settingsSchema = z
  .object({
    bankName: z.string().trim().max(150),
    bankAccountName: z.string().trim().max(150),
    bankAccountNumber: z.string().trim().max(100),
    transferInstructions: z.string().trim().max(2000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    rankingMetric: z.enum(['net_profit', 'gross_payout']),
    enabledPeriods: z
      .array(z.enum(['weekly', 'monthly', 'seasonal']))
      .min(1)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
// Zod optional schemas can still apply nested defaults. A PATCH must update only
// fields the caller supplied, never creation defaults for omitted properties.
function providedPatch<T extends Record<string, unknown>>(parsed: T, raw: unknown): T {
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.hasOwn(raw as object, key)),
  ) as T;
}
function userJson(row: QueryResultRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    balance: safeNumber(row.balance),
    createdAt: row.created_at,
  };
}
function packageJson(r: QueryResultRow) {
  return {
    id: r.id,
    name: r.name,
    coins: safeNumber(r.coins),
    bonusCoins: safeNumber(r.bonus_coins),
    price: Number(r.price),
    originalPrice: Number(r.original_price),
    currency: r.currency,
    active: r.active,
    createdAt: r.created_at,
  };
}
function depositJson(r: QueryResultRow) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    packageId: r.package_id,
    packageName: r.package_name,
    coins: safeNumber(r.coins),
    amount: Number(r.amount),
    currency: r.currency,
    transferReference: r.transfer_reference,
    note: r.note,
    status: r.status,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  };
}
function betJson(r: QueryResultRow) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    battleId: r.battle_id,
    battleTitle: r.battle_title,
    optionId: r.option_id,
    optionLabel: r.option_label,
    amount: safeNumber(r.amount),
    payout: safeNumber(r.payout),
    status: r.status,
    createdAt: r.created_at,
    settledAt: r.settled_at,
  };
}
const betSelect = `SELECT b.*,ba.title AS battle_title,o.label AS option_label,u.name AS user_name,u.email AS user_email FROM bets b JOIN battles ba ON ba.id=b.battle_id JOIN options o ON o.id=b.option_id JOIN users u ON u.id=b.user_id`;
const depositSelect = `SELECT d.*,u.name AS user_name,u.email AS user_email FROM deposits d JOIN users u ON u.id=d.user_id`;
function pageInput(req: Request) {
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page),
    pageSize = z.coerce.number().int().min(1).max(100).default(20).parse(req.query.pageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
async function transaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function addLedger(
  c: PoolClient,
  userId: string,
  type: string,
  amount: bigint,
  referenceId: string | null,
  note: string,
) {
  const row = (
    await c.query(
      'UPDATE users SET balance=balance+$2 WHERE id=$1 AND balance+$2 BETWEEN 0 AND 9000000000000000 RETURNING balance',
      [userId, amount.toString()],
    )
  ).rows[0];
  if (!row)
    throw new ApiError(
      409,
      'INSUFFICIENT_BALANCE',
      'The wallet has insufficient coins or exceeds the supported limit.',
    );
  await c.query(
    'INSERT INTO ledger(user_id,type,amount,balance_after,reference_id,note) VALUES($1,$2,$3,$4,$5,$6)',
    [userId, type, amount.toString(), row.balance, referenceId, note],
  );
  return safeNumber(row.balance);
}
async function battleJson(db: DB, id: string) {
  const r = (
    await db.query(
      `SELECT b.*,COALESCE(s.total_pool,0) total_pool,COALESCE(s.participants,0) participants FROM battles b LEFT JOIN (SELECT battle_id,SUM(amount) total_pool,COUNT(*) participants FROM bets GROUP BY battle_id)s ON s.battle_id=b.id WHERE b.id=$1`,
      [id],
    )
  ).rows[0];
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Battle not found.');
  const options = (
    await db.query(
      `SELECT o.*,COALESCE(s.total_stake,0) total_stake,COALESCE(s.bet_count,0) bet_count FROM options o LEFT JOIN(SELECT option_id,SUM(amount) total_stake,COUNT(*) bet_count FROM bets GROUP BY option_id)s ON s.option_id=o.id WHERE o.battle_id=$1 ORDER BY o.position,o.id`,
      [id],
    )
  ).rows;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    imageUrl: r.image_url,
    endsAt: r.ends_at,
    status: r.status === 'open' && new Date(r.ends_at) <= new Date() ? 'closed' : r.status,
    multiplier: r.multiplier_bps / 10000,
    totalPool: safeNumber(r.total_pool),
    participantCount: safeNumber(r.participants),
    winningOptionId: r.winning_option_id,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    settledAt: r.settled_at,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      odds: o.odds_bps / 10000,
      totalStake: safeNumber(o.total_stake),
      betCount: safeNumber(o.bet_count),
    })),
  };
}
export function createApp({ pool }: { pool: Pool }) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin'),
      expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site')
      return next(
        new ApiError(403, 'INVALID_ORIGIN', 'This request came from an untrusted origin.'),
      );
    next();
  });
  const wrap =
    (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  app.use(
    '/api',
    wrap(async (req, _res, next) => {
      const token = req.cookies?.battle_session;
      if (typeof token === 'string' && token.length === 64) {
        const hash = createHash('sha256').update(token).digest('hex');
        const result = await pool.query(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
          [hash],
        );
        if (result.rowCount) {
          req.user = userJson(result.rows[0]);
          req.sessionHash = hash;
        }
      }
      next();
    }),
  );
  const auth = (req: AuthRequest, _res: Response, next: NextFunction) =>
    req.user ? next() : next(new ApiError(401, 'UNAUTHORIZED', 'Please sign in to continue.'));
  const admin = (req: AuthRequest, _res: Response, next: NextFunction) =>
    req.user?.role === 'admin'
      ? next()
      : next(
          new ApiError(
            req.user ? 403 : 401,
            req.user ? 'FORBIDDEN' : 'UNAUTHORIZED',
            'Administrator access is required.',
          ),
        );
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many authentication attempts. Try again later.',
          },
        }),
  });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  async function signIn(c: DB, userId: string, res: Response) {
    const token = randomBytes(32).toString('hex'),
      hash = createHash('sha256').update(token).digest('hex');
    const days = Math.min(30, Math.max(1, Number(process.env.SESSION_DAYS) || 7));
    await c.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval '1 day')",
      [hash, userId, days],
    );
    res.cookie('battle_session', token, { ...cookieOptions, maxAge: days * 86400000 });
  }
  app.get(
    '/api/health',
    wrap(async (_req, res) => {
      await pool.query('SELECT 1 FROM settings WHERE id=1');
      res.json({ status: 'ok' });
    }),
  );
  app.get('/api/auth/me', (req: AuthRequest, res) => res.json({ user: req.user ?? null }));
  app.post(
    '/api/auth/register',
    authLimiter,
    wrap(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(80),
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          password: z
            .string()
            .min(10)
            .max(128)
            .refine(
              (v) => Buffer.byteLength(v, 'utf8') <= 72,
              'Password must contain at most 72 UTF-8 bytes.',
            ),
        })
        .parse(req.body);
      const passwordHash = await bcrypt.hash(body.password, 12);
      const initial = z.coerce
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .parse(process.env.INITIAL_COINS ?? 1000);
      const user = await transaction(pool, async (c) => {
        const row = (
          await c.query('INSERT INTO users(name,email,password_hash)VALUES($1,$2,$3)RETURNING *', [
            body.name,
            body.email,
            passwordHash,
          ])
        ).rows[0];
        if (initial)
          row.balance = await addLedger(
            c,
            row.id,
            'welcome',
            BigInt(initial),
            null,
            'Welcome coins for simulation',
          );
        await signIn(c, row.id, res);
        return userJson(row);
      });
      res.status(201).json({ user });
    }),
  );
  app.post(
    '/api/auth/login',
    authLimiter,
    wrap(async (req, res) => {
      const body = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .transform((s) => s.toLowerCase()),
          password: z
            .string()
            .min(1)
            .max(128)
            .refine(
              (v) => Buffer.byteLength(v, 'utf8') <= 72,
              'Password must contain at most 72 UTF-8 bytes.',
            ),
        })
        .parse(req.body);
      const row = (await pool.query('SELECT * FROM users WHERE email=$1', [body.email])).rows[0];
      if (!row || !(await bcrypt.compare(body.password, row.password_hash)))
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      if (req.sessionHash)
        await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
      await signIn(pool, row.id, res);
      res.json({ user: userJson(row) });
    }),
  );
  app.post(
    '/api/auth/logout',
    wrap(async (req, res) => {
      if (req.sessionHash)
        await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
      res.clearCookie('battle_session', cookieOptions);
      res.status(204).end();
    }),
  );
  app.get(
    '/api/settings',
    wrap(async (_req, res) =>
      res.json({
        settings: (await pool.query('SELECT data FROM settings WHERE id=1')).rows[0].data,
      }),
    ),
  );
  app.get(
    '/api/packages',
    wrap(async (_req, res) =>
      res.json({
        items: (
          await pool.query('SELECT * FROM packages WHERE active=true ORDER BY price')
        ).rows.map(packageJson),
      }),
    ),
  );
  async function listBattles(req: AuthRequest, res: Response) {
    const { page, pageSize, offset } = pageInput(req);
    const values: unknown[] = [];
    const where: string[] = [];
    if (req.query.status) {
      const status = z.enum(['open', 'closed', 'settled']).parse(req.query.status);
      where.push(
        status === 'open'
          ? "(b.status='open' AND b.ends_at>now())"
          : status === 'closed'
            ? "(b.status='closed' OR (b.status='open' AND b.ends_at<=now()))"
            : "b.status='settled'",
      );
    }
    if (req.query.category) {
      values.push(z.string().max(60).parse(req.query.category));
      where.push(`b.category=$${values.length}`);
    }
    if (req.query.search) {
      values.push(`%${z.string().max(150).parse(req.query.search)}%`);
      where.push(`(b.title ILIKE $${values.length} OR b.description ILIKE $${values.length})`);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = Number(
      (await pool.query(`SELECT COUNT(*) FROM battles b ${clause}`, values)).rows[0].count,
    );
    const ids = (
      await pool.query(
        `SELECT b.id FROM battles b ${clause} ORDER BY CASE WHEN b.status='open' AND b.ends_at>now() THEN 0 WHEN b.status='settled' THEN 2 ELSE 1 END,b.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      )
    ).rows;
    res.json({
      items: await Promise.all(ids.map((r) => battleJson(pool, r.id))),
      total,
      page,
      pageSize,
    });
  }
  app.get('/api/battles', wrap(listBattles));
  app.get(
    '/api/battles/:id',
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const battle = await battleJson(pool, id);
      const bet = req.user
        ? (
            await pool.query(betSelect + ' WHERE b.user_id=$1 AND b.battle_id=$2', [
              req.user.id,
              id,
            ])
          ).rows[0]
        : null;
      res.json({ battle, myBet: bet ? betJson(bet) : null });
    }),
  );
  app.post(
    '/api/battles/:id/bets',
    auth,
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id),
        body = z.object({ optionId: uuid, amount: coins }).parse(req.body);
      const result = await transaction(pool, async (c) => {
        const battle = (await c.query('SELECT * FROM battles WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!battle) throw new ApiError(404, 'NOT_FOUND', 'Battle not found.');
        if (battle.status !== 'open' || new Date(battle.ends_at) <= new Date())
          throw new ApiError(409, 'BATTLE_CLOSED', 'This battle is closed for bets.');
        if (
          !(
            await c.query('SELECT id FROM options WHERE id=$1 AND battle_id=$2', [
              body.optionId,
              id,
            ])
          ).rowCount
        )
          throw new ApiError(400, 'INVALID_OPTION', 'Choose an answer from this battle.');
        await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user!.id]);
        if (
          (
            await c.query('SELECT id FROM bets WHERE user_id=$1 AND battle_id=$2', [
              req.user!.id,
              id,
            ])
          ).rowCount
        )
          throw new ApiError(
            409,
            'BET_EXISTS',
            'You have already placed a bet in this battle. Bets cannot be changed or cancelled.',
          );
        const bet = (
          await c.query(
            'INSERT INTO bets(user_id,battle_id,option_id,amount)VALUES($1,$2,$3,$4)RETURNING *',
            [req.user!.id, id, body.optionId, body.amount],
          )
        ).rows[0];
        const balance = await addLedger(
          c,
          req.user!.id,
          'bet',
          -BigInt(body.amount),
          bet.id,
          `Bet on ${battle.title}`,
        );
        const enriched = (await c.query(betSelect + ' WHERE b.id=$1', [bet.id])).rows[0];
        return { bet: betJson(enriched), balance };
      });
      res.status(201).json(result);
    }),
  );
  async function listBets(req: AuthRequest, res: Response, isAdmin = false) {
    const { page, pageSize, offset } = pageInput(req);
    const values: unknown[] = [];
    const where: string[] = [];
    if (!isAdmin) {
      values.push(req.user!.id);
      where.push(`b.user_id=$${values.length}`);
    } else if (req.query.userId) {
      values.push(uuid.parse(req.query.userId));
      where.push(`b.user_id=$${values.length}`);
    }
    if (req.query.battleId) {
      values.push(uuid.parse(req.query.battleId));
      where.push(`b.battle_id=$${values.length}`);
    }
    if (req.query.status) {
      values.push(z.enum(['pending', 'won', 'lost']).parse(req.query.status));
      where.push(`b.status=$${values.length}`);
    }
    if (isAdmin && req.query.search) {
      values.push(`%${z.string().max(150).parse(req.query.search)}%`);
      where.push(`(u.email ILIKE $${values.length} OR u.name ILIKE $${values.length})`);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const count = await pool.query(
      'SELECT COUNT(*) FROM bets b JOIN users u ON u.id=b.user_id' + clause,
      values,
    );
    const rows = await pool.query(
      betSelect +
        clause +
        ` ORDER BY b.created_at DESC,b.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    res.json({ items: rows.rows.map(betJson), total: Number(count.rows[0].count), page, pageSize });
  }
  app.get(
    '/api/bets',
    auth,
    wrap((req, res) => listBets(req, res)),
  );
  app.get(
    '/api/wallet',
    auth,
    wrap(async (req, res) => {
      const { page, pageSize, offset } = pageInput(req);
      const row = (await pool.query('SELECT balance FROM users WHERE id=$1', [req.user!.id]))
        .rows[0];
      const count = await pool.query('SELECT COUNT(*) FROM ledger WHERE user_id=$1', [
        req.user!.id,
      ]);
      const rows = (
        await pool.query(
          'SELECT * FROM ledger WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',
          [req.user!.id, pageSize, offset],
        )
      ).rows;
      res.json({
        balance: safeNumber(row.balance),
        items: rows.map((r) => ({
          id: r.id,
          type: r.type,
          amount: safeNumber(r.amount),
          balanceAfter: safeNumber(r.balance_after),
          referenceId: r.reference_id,
          note: r.note,
          description: r.note,
          createdAt: r.created_at,
        })),
        total: Number(count.rows[0].count),
        page,
        pageSize,
      });
    }),
  );
  async function listDeposits(req: AuthRequest, res: Response, isAdmin = false) {
    const { page, pageSize, offset } = pageInput(req);
    const values: unknown[] = [];
    const where: string[] = [];
    if (!isAdmin) {
      values.push(req.user!.id);
      where.push('d.user_id=$1');
    }
    if (req.query.status) {
      values.push(z.enum(['pending', 'approved', 'rejected']).parse(req.query.status));
      where.push(`d.status=$${values.length}`);
    }
    if (isAdmin && req.query.search) {
      values.push(`%${z.string().max(150).parse(req.query.search)}%`);
      where.push(
        `(u.email ILIKE $${values.length} OR u.name ILIKE $${values.length} OR d.transfer_reference ILIKE $${values.length})`,
      );
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = Number(
      (
        await pool.query(
          'SELECT COUNT(*) FROM deposits d JOIN users u ON u.id=d.user_id' + clause,
          values,
        )
      ).rows[0].count,
    );
    const rows = (
      await pool.query(
        depositSelect +
          clause +
          ` ORDER BY d.created_at DESC,d.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, offset],
      )
    ).rows;
    res.json({ items: rows.map(depositJson), total, page, pageSize });
  }
  app.get(
    '/api/deposits',
    auth,
    wrap((req, res) => listDeposits(req, res)),
  );
  app.post(
    '/api/deposits',
    auth,
    wrap(async (req, res) => {
      const body = z
        .object({
          packageId: uuid,
          transferReference: z.string().trim().min(3).max(150),
          note: z.string().trim().max(2000).default(''),
        })
        .parse(req.body);
      const result = await transaction(pool, async (c) => {
        const p = (
          await c.query('SELECT * FROM packages WHERE id=$1 AND active=true FOR SHARE', [
            body.packageId,
          ])
        ).rows[0];
        if (!p)
          throw new ApiError(404, 'PACKAGE_UNAVAILABLE', 'This coin package is not available.');
        const d = (
          await c.query(
            'INSERT INTO deposits(user_id,package_id,package_name,coins,amount,currency,transfer_reference,note)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING *',
            [
              req.user!.id,
              p.id,
              p.name,
              (BigInt(p.coins) + BigInt(p.bonus_coins)).toString(),
              p.price,
              p.currency,
              body.transferReference,
              body.note,
            ],
          )
        ).rows[0];
        return depositJson(d);
      });
      res.status(201).json({ deposit: result });
    }),
  );
  app.get(
    '/api/leaderboard',
    wrap(async (req, res) => {
      const period = z
        .enum(['weekly', 'monthly', 'seasonal'])
        .default('weekly')
        .parse(req.query.period) as Period;
      const settings = (await pool.query('SELECT data FROM settings WHERE id=1')).rows[0].data;
      if (!settings.enabledPeriods.includes(period))
        throw new ApiError(400, 'PERIOD_DISABLED', 'This ranking period is disabled.');
      const { startsAt, endsAt } = periodBounds(period);
      const { page, pageSize, offset } = pageInput(req);
      const metric = settings.rankingMetric === 'gross_payout' ? 'total_payout' : 'net_profit';
      const total = Number(
        (
          await pool.query(
            "SELECT COUNT(DISTINCT user_id) FROM bets WHERE settled_at>=$1 AND settled_at<$2 AND status IN('won','lost')",
            [startsAt, endsAt],
          )
        ).rows[0].count,
      );
      const rows = (
        await pool.query(
          `WITH ranked AS(SELECT u.id user_id,u.name,SUM(b.payout) total_payout,SUM(b.payout-b.amount) net_profit,COUNT(*) bets,COUNT(*) FILTER(WHERE b.status='won') wins FROM bets b JOIN users u ON u.id=b.user_id WHERE b.settled_at>=$1 AND b.settled_at<$2 AND b.status IN('won','lost') GROUP BY u.id,u.name), numbered AS(SELECT *,ROW_NUMBER() OVER(ORDER BY ${metric} DESC,wins DESC,name,user_id) rank FROM ranked)SELECT *,COUNT(*) OVER() total FROM numbered ORDER BY rank LIMIT $3 OFFSET $4`,
          [startsAt, endsAt, pageSize, offset],
        )
      ).rows;
      res.json({
        period,
        startsAt,
        endsAt,
        metric: settings.rankingMetric,
        items: rows.map((r) => ({
          rank: Number(r.rank),
          userId: r.user_id,
          name: r.name,
          totalPayout: safeNumber(r.total_payout),
          grossPayout: safeNumber(r.total_payout),
          netProfit: safeNumber(r.net_profit),
          wins: Number(r.wins),
          bets: Number(r.bets),
          score: safeNumber(r[metric]),
        })),
        total,
        page,
        pageSize,
      });
    }),
  );
  app.use('/api/admin', admin);
  app.get('/api/admin/battles', wrap(listBattles));
  app.get(
    '/api/admin/bets',
    wrap((req, res) => listBets(req, res, true)),
  );
  app.get(
    '/api/admin/deposits',
    wrap((req, res) => listDeposits(req, res, true)),
  );
  app.get(
    '/api/admin/users',
    wrap(async (req, res) => {
      const { page, pageSize, offset } = pageInput(req);
      const search = `%${z.string().max(150).default('').parse(req.query.search)}%`;
      const total = Number(
        (
          await pool.query('SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR email ILIKE $1', [
            search,
          ])
        ).rows[0].count,
      );
      const rows = (
        await pool.query(
          'SELECT * FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
          [search, pageSize, offset],
        )
      ).rows;
      res.json({ items: rows.map(userJson), total, page, pageSize });
    }),
  );
  app.get(
    '/api/admin/overview',
    wrap(async (_req, res) => {
      const row = (
        await pool.query(
          `SELECT(SELECT COUNT(*)FROM users)users,(SELECT COUNT(*)FROM battles)battles,(SELECT COUNT(*)FROM battles WHERE status='open'AND ends_at>now())open_battles,(SELECT COUNT(*)FROM deposits WHERE status='pending')pending_deposits,(SELECT COUNT(*)FROM bets)total_bets,(SELECT COALESCE(SUM(balance),0)FROM users)total_coins,(SELECT COALESCE(SUM(amount),0)FROM bets b JOIN battles ba ON ba.id=b.battle_id WHERE ba.status<>'settled')total_pool`,
        )
      ).rows[0];
      res.json({
        users: Number(row.users),
        battles: Number(row.battles),
        openBattles: Number(row.open_battles),
        pendingDeposits: Number(row.pending_deposits),
        totalBets: Number(row.total_bets),
        totalCoins: safeNumber(row.total_coins),
        totalPool: safeNumber(row.total_pool),
        recentBets: (await pool.query(betSelect + ' ORDER BY b.created_at DESC LIMIT 8')).rows.map(
          betJson,
        ),
      });
    }),
  );
  app.post(
    '/api/admin/battles',
    wrap(async (req, res) => {
      const body = battleSchema.parse(req.body);
      if (new Date(body.endsAt) <= new Date())
        throw new ApiError(400, 'INVALID_END', 'A new battle must close in the future.');
      const id = await transaction(pool, async (c) => {
        const r = (
          await c.query(
            'INSERT INTO battles(title,description,category,image_url,ends_at,multiplier_bps,created_by)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id',
            [
              body.title,
              body.description,
              body.category,
              body.imageUrl,
              body.endsAt,
              Math.round(body.multiplier * 10000),
              req.user!.id,
            ],
          )
        ).rows[0];
        for (const [position, o] of body.options.entries())
          await c.query(
            'INSERT INTO options(battle_id,label,odds_bps,position)VALUES($1,$2,$3,$4)',
            [r.id, o.label, Math.round(o.odds * 10000), position],
          );
        return r.id;
      });
      res.status(201).json({ battle: await battleJson(pool, id) });
    }),
  );
  app.patch(
    '/api/admin/battles/:id',
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id),
        body = providedPatch(battleSchema.partial().parse(req.body), req.body);
      await transaction(pool, async (c) => {
        const current = (await c.query('SELECT * FROM battles WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!current) throw new ApiError(404, 'NOT_FOUND', 'Battle not found.');
        if (current.status !== 'open' || new Date(current.ends_at) <= new Date())
          throw new ApiError(409, 'BATTLE_CLOSED', 'Closed or settled battles cannot be edited.');
        const hasBets = (await c.query('SELECT 1 FROM bets WHERE battle_id=$1 LIMIT 1', [id]))
          .rowCount;
        if (
          hasBets &&
          (body.options !== undefined || body.multiplier !== undefined || body.endsAt !== undefined)
        )
          throw new ApiError(
            409,
            'BATTLE_LOCKED',
            'Answer options, odds, multiplier and closing time are locked after the first bet.',
          );
        if (body.endsAt && new Date(body.endsAt) <= new Date())
          throw new ApiError(400, 'INVALID_END', 'Use Close battle to stop betting immediately.');
        await c.query(
          'UPDATE battles SET title=$2,description=$3,category=$4,image_url=$5,ends_at=$6,multiplier_bps=$7 WHERE id=$1',
          [
            id,
            body.title ?? current.title,
            body.description ?? current.description,
            body.category ?? current.category,
            body.imageUrl ?? current.image_url,
            body.endsAt ?? current.ends_at,
            body.multiplier === undefined
              ? current.multiplier_bps
              : Math.round(body.multiplier * 10000),
          ],
        );
        if (body.options) {
          await c.query('DELETE FROM options WHERE battle_id=$1', [id]);
          for (const [position, o] of body.options.entries())
            await c.query(
              'INSERT INTO options(battle_id,label,odds_bps,position)VALUES($1,$2,$3,$4)',
              [id, o.label, Math.round(o.odds * 10000), position],
            );
        }
      });
      res.json({ battle: await battleJson(pool, id) });
    }),
  );
  app.post(
    '/api/admin/battles/:id/close',
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id);
      await transaction(pool, async (c) => {
        const r = (await c.query('SELECT status FROM battles WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!r) throw new ApiError(404, 'NOT_FOUND', 'Battle not found.');
        if (r.status === 'settled')
          throw new ApiError(409, 'ALREADY_SETTLED', 'This battle is already settled.');
        await c.query(
          "UPDATE battles SET status='closed',closed_at=COALESCE(closed_at,now()) WHERE id=$1",
          [id],
        );
      });
      res.json({ battle: await battleJson(pool, id) });
    }),
  );
  app.post(
    '/api/admin/battles/:id/settle',
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id),
        body = z.object({ winningOptionId: uuid }).parse(req.body);
      await transaction(pool, async (c) => {
        const battle = (await c.query('SELECT * FROM battles WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!battle) throw new ApiError(404, 'NOT_FOUND', 'Battle not found.');
        if (battle.status === 'settled') {
          if (battle.winning_option_id !== body.winningOptionId)
            throw new ApiError(409, 'ALREADY_SETTLED', 'A settled result cannot be changed.');
          return;
        }
        if (battle.status === 'open' && new Date(battle.ends_at) > new Date())
          throw new ApiError(
            409,
            'BATTLE_OPEN',
            'Close this battle before marking the winning answer.',
          );
        const option = (
          await c.query('SELECT * FROM options WHERE id=$1 AND battle_id=$2', [
            body.winningOptionId,
            id,
          ])
        ).rows[0];
        if (!option)
          throw new ApiError(400, 'INVALID_OPTION', 'Choose an answer from this battle.');
        const bets = (
          await c.query('SELECT * FROM bets WHERE battle_id=$1 ORDER BY user_id,id FOR UPDATE', [
            id,
          ])
        ).rows;
        const totalPool = bets.reduce((s, b) => s + BigInt(b.amount), 0n),
          winningStake = bets
            .filter((b) => b.option_id === option.id)
            .reduce((s, b) => s + BigInt(b.amount), 0n);
        // Lock all affected wallets in stable order to avoid deadlocks across parallel settlements.
        if (bets.length)
          await c.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
            bets.map((b) => b.user_id),
          ]);
        for (const bet of bets) {
          const won = bet.option_id === option.id;
          const payout = won
            ? calculatePayout(
                totalPool,
                BigInt(bet.amount),
                winningStake,
                BigInt(option.odds_bps),
                BigInt(battle.multiplier_bps),
              )
            : 0n;
          safeNumber(payout);
          if (payout)
            await addLedger(c, bet.user_id, 'payout', payout, bet.id, `Payout: ${battle.title}`);
          await c.query('UPDATE bets SET status=$2,payout=$3,settled_at=now() WHERE id=$1', [
            bet.id,
            won ? 'won' : 'lost',
            payout.toString(),
          ]);
        }
        await c.query(
          "UPDATE battles SET status='settled',winning_option_id=$2,closed_at=COALESCE(closed_at,now()),settled_at=now() WHERE id=$1",
          [id, option.id],
        );
      });
      res.json({ battle: await battleJson(pool, id) });
    }),
  );
  async function reviewDeposit(req: AuthRequest, res: Response, action: 'approved' | 'rejected') {
    const id = uuid.parse(req.params.id),
      body = z.object({ note: z.string().trim().max(2000).default('') }).parse(req.body ?? {});
    const result = await transaction(pool, async (c) => {
      const d = (await c.query('SELECT * FROM deposits WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!d) throw new ApiError(404, 'NOT_FOUND', 'Deposit not found.');
      if (d.status === action) return depositJson(d);
      if (d.status !== 'pending')
        throw new ApiError(
          409,
          'DEPOSIT_REVIEWED',
          'This deposit was already reviewed; its decision cannot be changed.',
        );
      if (action === 'approved')
        await addLedger(
          c,
          d.user_id,
          'deposit',
          BigInt(d.coins),
          d.id,
          `Approved transfer ${d.transfer_reference}`,
        );
      return depositJson(
        (
          await c.query(
            'UPDATE deposits SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now()WHERE id=$1 RETURNING *',
            [id, action, body.note, req.user!.id],
          )
        ).rows[0],
      );
    });
    res.json({ deposit: result });
  }
  app.post(
    '/api/admin/deposits/:id/approve',
    wrap((req, res) => reviewDeposit(req, res, 'approved')),
  );
  app.post(
    '/api/admin/deposits/:id/reject',
    wrap((req, res) => reviewDeposit(req, res, 'rejected')),
  );
  app.get(
    '/api/admin/packages',
    wrap(async (_req, res) =>
      res.json({
        items: (await pool.query('SELECT * FROM packages ORDER BY created_at')).rows.map(
          packageJson,
        ),
      }),
    ),
  );
  app.post(
    '/api/admin/packages',
    wrap(async (req, res) => {
      const b = packageSchema.parse(req.body);
      if (b.originalPrice < b.price)
        throw new ApiError(
          400,
          'INVALID_PACKAGE',
          'Original price cannot be below the offered price.',
        );
      const r = (
        await pool.query(
          'INSERT INTO packages(name,coins,bonus_coins,price,original_price,currency,active)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING *',
          [b.name, b.coins, b.bonusCoins, b.price, b.originalPrice, b.currency, b.active],
        )
      ).rows[0];
      res.status(201).json({ package: packageJson(r) });
    }),
  );
  app.patch(
    '/api/admin/packages/:id',
    wrap(async (req, res) => {
      const id = uuid.parse(req.params.id),
        b = providedPatch(packageSchema.partial().parse(req.body), req.body);
      const result = await transaction(pool, async (c) => {
        const r = (await c.query('SELECT * FROM packages WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!r) throw new ApiError(404, 'NOT_FOUND', 'Coin package not found.');
        const p = { ...packageJson(r), ...b };
        if (p.originalPrice < p.price)
          throw new ApiError(
            400,
            'INVALID_PACKAGE',
            'Original price cannot be below the offered price.',
          );
        return (
          await c.query(
            'UPDATE packages SET name=$2,coins=$3,bonus_coins=$4,price=$5,original_price=$6,currency=$7,active=$8 WHERE id=$1 RETURNING *',
            [id, p.name, p.coins, p.bonusCoins, p.price, p.originalPrice, p.currency, p.active],
          )
        ).rows[0];
      });
      res.json({ package: packageJson(result) });
    }),
  );
  app.get(
    '/api/admin/settings',
    wrap(async (_req, res) =>
      res.json({
        settings: (await pool.query('SELECT data FROM settings WHERE id=1')).rows[0].data,
      }),
    ),
  );
  app.patch(
    '/api/admin/settings',
    wrap(async (req, res) => {
      const patch = settingsSchema.partial().parse(req.body);
      const settings = await transaction(pool, async (c) => {
        const r = (await c.query('SELECT data FROM settings WHERE id=1 FOR UPDATE')).rows[0];
        const data = settingsSchema.parse({ ...r.data, ...patch });
        await c.query('UPDATE settings SET data=$1 WHERE id=1', [JSON.stringify(data)]);
        return data;
      });
      res.json({ settings });
    }),
  );
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }),
  );
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res
        .status(400)
        .json({
          error: {
            code: 'VALIDATION_ERROR',
            message: err.issues
              .map((i) => `${i.path.join('.') || 'request'}: ${i.message}`)
              .join('; '),
          },
        });
      return;
    }
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const e = err as { code?: string; type?: string; status?: number };
    if (e.code === '23505') {
      res
        .status(409)
        .json({
          error: {
            code: 'CONFLICT',
            message: 'This email, bet, or transfer reference already exists.',
          },
        });
      return;
    }
    if (e.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } });
      return;
    }
    if (e.type === 'entity.too.large') {
      res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } });
      return;
    }
    console.error('API request failed:', err);
    res
      .status(500)
      .json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed. Please try again.',
        },
      });
  });
  return app;
}
