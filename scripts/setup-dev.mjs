import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

// Local development only: production configuration remains an operator decision.
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  const adminPassword = randomBytes(24).toString('base64url');
  const demo = process.argv.includes('--demo');
  writeFileSync(
    '.env',
    [
      'NODE_ENV=development',
      'PORT=3001',
      'APP_ORIGIN=http://127.0.0.1:5173',
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://battles:${password}@127.0.0.1:5432/battles`,
      `TEST_DATABASE_URL=postgresql://battles:${password}@127.0.0.1:5432/battles_test`,
      'ADMIN_EMAIL=admin@battle.local',
      `ADMIN_PASSWORD=${adminPassword}`,
      `DEMO_MODE=${demo}`,
      'TRUST_PROXY=0',
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Created local .env with random credentials. Administrator credentials remain in that ignored file.',
  );
} else {
  console.log('Preserving the existing .env and its demo setting.');
}
dotenv.config({ quiet: true });
if (process.env.NODE_ENV === 'production')
  throw new Error('Use the documented production release commands instead of setup:dev.');
const database = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(database.hostname)) {
  throw new Error(
    'setup:dev provisions a local Compose database. Use db:migrate and db:seed for your configured external database.',
  );
}
function run(command, args, capture = false) {
  const windowsNpm = process.platform === 'win32' && command === 'npm';
  const result = spawnSync(windowsNpm ? 'npm.cmd' : command, args, {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    // npm is a command script on Windows; these arguments are fixed internal commands.
    shell: windowsNpm,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout?.trim();
}
run('docker', ['compose', 'up', '-d', '--wait', 'db']);
const hasTestDatabase = run(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'battles',
    '-d',
    'postgres',
    '-tAc',
    "SELECT 1 FROM pg_database WHERE datname='battles_test'",
  ],
  true,
);
if (hasTestDatabase !== '1')
  run('docker', ['compose', 'exec', '-T', 'db', 'createdb', '-U', 'battles', 'battles_test']);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'db:seed']);
console.log('Development database is ready. Start the frontend/API with npm run dev.');
