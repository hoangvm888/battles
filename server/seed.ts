import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPool } from './db.js';
const demos = [
  {
    title: 'Who takes the Champions League crown?',
    category: 'Sports',
    description:
      'The biggest stage in European football. Pick the team you believe will lift the trophy. This is a fictional entertainment battle, not an official event market.',
    options: [
      ['Manchester City', 2.4],
      ['Real Madrid', 2.8],
      ['Bayern Munich', 3.5],
      ['Another team', 4.2],
    ],
    hours: 72,
    multiplier: 1.2,
    imageUrl: '/assets/images/quiz-4-img.png',
  },
  {
    title: 'Will Bitcoin reach a new all-time high this month?',
    category: 'Crypto',
    description:
      'Make your prediction in our virtual arena. No real assets, financial products, or cash prizes are involved.',
    options: [
      ['Yes, a new high', 1.8],
      ['No, not this month', 2.2],
    ],
    hours: 120,
    multiplier: 1,
    imageUrl: '/assets/images/quiz-5-img.png',
  },
  {
    title: 'Which AI breakthrough happens first?',
    category: 'Technology',
    description:
      'From assistants to autonomous robots: choose the next milestone in our fictional tech challenge.',
    options: [
      ['A personal AI operating system', 2.5],
      ['Mainstream household robots', 3],
      ['A major medical discovery', 2.8],
    ],
    hours: 168,
    multiplier: 1.5,
    imageUrl: '/assets/images/quiz-8-img.png',
  },
  {
    title: 'The ultimate summer movie showdown',
    category: 'Entertainment',
    description: 'Which genre will capture the audience in this fictional box-office battle?',
    options: [
      ['Action & adventure', 2],
      ['Sci-fi & fantasy', 2.5],
      ['Animation', 3],
    ],
    hours: 48,
    multiplier: 1,
    imageUrl: '/assets/images/quiz-6-img.png',
  },
  {
    title: 'What powers the city of the future?',
    category: 'Science',
    description: 'Place your virtual coins on the clean-energy idea you think will take the lead.',
    options: [
      ['Solar everywhere', 2.1],
      ['Next-gen nuclear', 2.8],
      ['Wind & storage', 2.6],
    ],
    hours: 96,
    multiplier: 1.1,
    imageUrl: '/assets/images/quiz-3-img.png',
  },
  {
    title: 'Which team wins the community esports final?',
    category: 'Gaming',
    description:
      'A friendly fictional showdown. One answer, one immutable bet, and a whole lot of bragging rights.',
    options: [
      ['Team Phoenix', 1.9],
      ['Team Nova', 2.1],
    ],
    hours: 24,
    multiplier: 1,
    imageUrl: '/assets/images/quiz-9-img.png',
  },
] as const;
async function seedUser(
  c: PoolClient,
  name: string,
  email: string,
  password: string,
  role: 'user' | 'admin',
  balance: number,
) {
  const existing = (
    await c.query('SELECT id,role FROM users WHERE email=$1', [email.toLowerCase()])
  ).rows[0];
  if (existing) {
    if (role === 'admin' && existing.role !== 'admin')
      throw new Error(
        'The configured administrator email already belongs to a non-admin account. Choose a new admin email.',
      );
    return existing.id as string;
  }
  const hash = await bcrypt.hash(password, 12);
  const r = (
    await c.query(
      'INSERT INTO users(name,email,password_hash,role,balance)VALUES($1,$2,$3,$4,$5)RETURNING id',
      [name, email.toLowerCase(), hash, role, balance],
    )
  ).rows[0];
  if (balance)
    await c.query(
      "INSERT INTO ledger(user_id,type,amount,balance_after,note)VALUES($1,'welcome',$2,$2,'Welcome simulation coins')",
      [r.id, balance],
    );
  return r.id as string;
}
export async function seed(pool: Pool) {
  const demo = process.env.DEMO_MODE === 'true';
  if (demo && process.env.NODE_ENV === 'production')
    throw new Error('DEMO_MODE must be disabled in production.');
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    adminPassword = process.env.ADMIN_PASSWORD;
  if (!demo && (!adminEmail || !adminPassword || adminPassword.length < 12))
    throw new Error(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters), or explicitly enable DEMO_MODE=true for local demo data.',
    );
  if (adminEmail && !/^\S+@\S+\.\S+$/.test(adminEmail))
    throw new Error('ADMIN_EMAIL must be a valid email.');
  if (adminPassword && (adminPassword.length < 12 || Buffer.byteLength(adminPassword, 'utf8') > 72))
    throw new Error(
      'ADMIN_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes.',
    );
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':battles-seed'))");
    const adminId = await seedUser(
      c,
      'Arena Admin',
      adminEmail || 'admin@battle.local',
      adminPassword || 'DemoAdmin123!',
      'admin',
      demo ? 5000 : 0,
    );
    if (demo) {
      await seedUser(c, 'Alex Morgan', 'demo@battle.local', 'DemoPlayer123!', 'user', 2500);
      for (const d of demos) {
        if ((await c.query('SELECT id FROM battles WHERE title=$1', [d.title])).rowCount) continue;
        const b = (
          await c.query(
            "INSERT INTO battles(title,description,category,image_url,ends_at,multiplier_bps,created_by)VALUES($1,$2,$3,$4,now()+$5*interval '1 hour',$6,$7)RETURNING id",
            [
              d.title,
              d.description,
              d.category,
              '',
              d.hours,
              Math.round(d.multiplier * 10000),
              adminId,
            ],
          )
        ).rows[0];
        for (const [position, [label, odds]] of d.options.entries())
          await c.query(
            'INSERT INTO options(battle_id,label,odds_bps,position)VALUES($1,$2,$3,$4)',
            [b.id, label, Math.round(odds * 10000), position],
          );
      }
      for (const p of [
        { name: 'Starter pack', coins: 500, bonus: 0, price: 5, original: 5 },
        { name: 'Contender pack', coins: 1500, bonus: 200, price: 12, original: 15 },
        { name: 'Champion pack', coins: 5000, bonus: 1000, price: 35, original: 50 },
      ]) {
        if ((await c.query('SELECT id FROM packages WHERE name=$1', [p.name])).rowCount) continue;
        await c.query(
          "INSERT INTO packages(name,coins,bonus_coins,price,original_price,currency)VALUES($1,$2,$3,$4,$5,'USD')",
          [p.name, p.coins, p.bonus, p.price, p.original],
        );
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const pool = createPool();
  seed(pool)
    .then(() => console.log('Seed complete. Existing users, balances and battles were preserved.'))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
