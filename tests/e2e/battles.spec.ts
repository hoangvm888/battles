import { test, expect, type APIRequestContext } from '@playwright/test';

const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const email = `browser-${stamp}@example.test`;
const playerName = `Browser Player ${stamp}`;
const password = 'BrowserPlayer123!';
const title = `Browser verification ${stamp}`;

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  expect(response.ok(), `API returned ${response.status()}`).toBeTruthy();
  return response.json();
}

test('mobile registration → deposit approval → immutable bet → result and rankings', async ({
  page,
  browser,
  baseURL,
}) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error(
      'Browser verification is restricted to a disposable local development instance.',
    );
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    throw new Error(
      'Set the local seeded ADMIN_EMAIL and ADMIN_PASSWORD before browser verification.',
    );
  }
  const unexpectedErrors: string[] = [];
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  const admin = await browser.newContext({ baseURL, viewport: { width: 1365, height: 900 } });
  const adminPage = await admin.newPage();
  let originalSettings: any;
  try {
    await json(
      await admin.request.post('/api/auth/login', {
        data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
      }),
    );
    originalSettings = (await json(await admin.request.get('/api/admin/settings'))).settings;
    await json(
      await admin.request.patch('/api/admin/settings', {
        data: {
          ...originalSettings,
          bankName: 'SIMULATION ONLY — browser test',
          bankAccountName: 'No real transfer',
          bankAccountNumber: 'SIMULATION-NO-PAYMENT',
          transferInstructions: 'Automated local simulation. Do not send money.',
          enabledPeriods: ['weekly', 'monthly', 'seasonal'],
        },
      }),
    );
    const coinPackage = (
      await json(
        await admin.request.post('/api/admin/packages', {
          data: {
            name: `Browser package ${stamp}`,
            coins: 500,
            bonusCoins: 50,
            price: 4,
            originalPrice: 5,
            currency: 'USD',
            active: true,
          },
        }),
      )
    ).package;
    const battle = (
      await json(
        await admin.request.post('/api/admin/battles', {
          data: {
            title,
            description: 'Automated local verification of the complete virtual-coin workflow.',
            category: 'Technology',
            endsAt: new Date(Date.now() + 3_600_000).toISOString(),
            multiplier: 1,
            options: [
              { label: 'Verified winner', odds: 2 },
              { label: 'Other answer', odds: 3 },
            ],
          },
        }),
      )
    ).battle;

    await page.goto('/register');
    await page.getByLabel('Your name', { exact: true }).fill(playerName);
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const initialBalance = (await json(await page.request.get('/api/wallet'))).balance;
    expect(initialBalance).toBeGreaterThanOrEqual(100);

    await page.goto('/wallet');
    await page.getByRole('button', { name: /Browser package/ }).click();
    await page
      .getByPlaceholder('Reference from your completed bank transfer')
      .fill(`BROWSER-${stamp}`);
    await page.getByRole('checkbox', { name: /I have completed the bank transfer/ }).check();
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await expect(page.getByText('Deposit request submitted.', { exact: false })).toBeVisible();
    let wallet = await json(await page.request.get('/api/wallet'));
    expect(wallet.balance).toBe(initialBalance);
    const depositList = await json(await page.request.get('/api/deposits'));
    const deposit = depositList.items.find(
      (item: any) => item.transferReference === `BROWSER-${stamp}`,
    );
    expect(deposit.status).toBe('pending');

    await adminPage.goto('/admin');
    await adminPage.getByRole('button', { name: 'Deposits', exact: true }).click();
    const row = adminPage.getByRole('row').filter({ hasText: `BROWSER-${stamp}` });
    await row.getByRole('button', { name: /Review/ }).click();
    await adminPage
      .getByLabel('Review note (optional)', { exact: true })
      .fill('Automated simulation: no bank transfer occurred.');
    await adminPage.getByRole('button', { name: 'Approve & credit coins', exact: true }).click();
    await expect(adminPage.getByRole('dialog')).toHaveCount(0);
    wallet = await json(await page.request.get('/api/wallet'));
    expect(wallet.balance).toBe(initialBalance + 550);

    await page.goto(`/battles/${battle.id}`);
    await page.getByRole('button', { name: /Verified winner/ }).click();
    await page.getByLabel('Coins to bet', { exact: true }).fill('100');
    await page.getByRole('checkbox', { name: /I understand this bet is final/ }).check();
    await page.getByRole('button', { name: 'Place bet · 100 coins', exact: true }).click();
    await expect(page.getByText('Your bet is locked in.', { exact: false }).first()).toBeVisible();
    const duplicate = await page.request.post(`/api/battles/${battle.id}/bets`, {
      data: { optionId: battle.options[0].id, amount: 100 },
    });
    expect(duplicate.status()).toBe(409);

    await json(await admin.request.post(`/api/admin/battles/${battle.id}/close`, { data: {} }));
    await json(
      await admin.request.post(`/api/admin/battles/${battle.id}/settle`, {
        data: { winningOptionId: battle.options[0].id },
      }),
    );
    await json(
      await admin.request.post(`/api/admin/battles/${battle.id}/settle`, {
        data: { winningOptionId: battle.options[0].id },
      }),
    );
    wallet = await json(await page.request.get('/api/wallet'));
    expect(wallet.balance).toBe(initialBalance + 550 - 100 + 200);
    await page.goto('/history');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText('Won', { exact: true }).first()).toBeVisible();
    for (const period of ['weekly', 'monthly', 'seasonal']) {
      const ranking = await json(await page.request.get(`/api/leaderboard?period=${period}`));
      expect(ranking.items.some((item: any) => item.name === playerName)).toBeTruthy();
    }
    await page.goto('/leaderboard');
    await expect(page.getByText(playerName, { exact: true }).first()).toBeVisible();
    const forbidden = await page.request.get('/api/admin/users');
    expect(forbidden.status()).toBe(403);
    expect(unexpectedErrors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBeTruthy();
    await json(
      await admin.request.patch(`/api/admin/packages/${coinPackage.id}`, {
        data: { active: false },
      }),
    );
  } finally {
    if (originalSettings)
      await admin.request.patch('/api/admin/settings', { data: originalSettings }).catch(() => {});
    await admin.close();
  }
});

test('public pages render at desktop and mobile widths without horizontal overflow', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/leaderboard', '/login', '/register']) {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Something got in the way');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${route} at ${width}px`,
      ).toBeTruthy();
    }
  }
});

test('admin CMS creates and resolves battles, edits offers and configures public periods', async ({
  page,
  browser,
  baseURL,
}) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Use a local disposable instance.');
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    throw new Error('Local admin credentials are required.');
  await json(
    await page.request.post('/api/auth/login', {
      data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
    }),
  );
  const original = (await json(await page.request.get('/api/admin/settings'))).settings;
  const player = await browser.newContext({ baseURL });
  try {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Create battle', exact: true }).click();
    const cmsTitle = `CMS verification ${stamp}`;
    await page.getByLabel('Battle title', { exact: true }).fill(cmsTitle);
    await page
      .getByLabel('Description and rules', { exact: true })
      .fill('A local CMS browser test, with a manually confirmed final answer.');
    await page.getByLabel('Category', { exact: true }).fill('Technology');
    await page.getByLabel('Topic multiplier', { exact: true }).fill('1.25');
    await page
      .getByLabel('Closing date and time (your local timezone)', { exact: true })
      .fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
    await page.getByLabel('Answer 1', { exact: true }).fill('CMS winner');
    await page.getByLabel('Answer 2', { exact: true }).fill('CMS other');
    await page.getByLabel('Odds ×', { exact: true }).nth(0).fill('2.5');
    await page.getByRole('button', { name: 'Publish battle', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Search battles', { exact: true }).fill(cmsTitle);
    let card = page.locator('article.admin-battle').filter({ hasText: cmsTitle });
    await expect(card).toBeVisible();
    const battle = (
      await json(
        await page.request.get(`/api/admin/battles?search=${encodeURIComponent(cmsTitle)}`),
      )
    ).items[0];
    const registration = await json(
      await player.request.post('/api/auth/register', {
        data: {
          name: `CMS Player ${stamp}`,
          email: `cms-${stamp}@example.test`,
          password,
        },
      }),
    );
    await json(
      await player.request.post(`/api/battles/${battle.id}/bets`, {
        data: { optionId: battle.options[0].id, amount: 100 },
      }),
    );
    await page.reload();
    await page.getByLabel('Search battles', { exact: true }).fill(cmsTitle);
    await page.getByRole('button', { name: `Edit ${cmsTitle}`, exact: true }).click();
    await expect(page.getByLabel('Topic multiplier', { exact: true })).toBeDisabled();
    await expect(
      page.getByLabel('Closing date and time (your local timezone)', { exact: true }),
    ).toBeDisabled();
    await page.getByLabel('Battle title', { exact: true }).fill(`${cmsTitle} edited`);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    card = page.locator('article.admin-battle').filter({ hasText: `${cmsTitle} edited` });
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Close battle', exact: true }).click();
    await card.getByRole('button', { name: 'Set result', exact: true }).click();
    await page.getByRole('combobox', { name: 'Correct answer', exact: true }).selectOption(battle.options[0].id);
    await page.getByRole('button', { name: 'Confirm result & pay winners', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card.locator('.badge')).toHaveText('settled');
    expect((await json(await player.request.get('/api/wallet'))).balance).toBe(
      registration.user.balance - 100 + 312,
    );

    await page.getByRole('button', { name: 'Coin packages', exact: true }).click();
    await page.getByRole('button', { name: 'Add package', exact: true }).click();
    const packageName = `CMS offer ${stamp}`;
    await page.getByLabel('Package name', { exact: true }).fill(packageName);
    await page.getByLabel('Base coins', { exact: true }).fill('400');
    await page.getByLabel('Bonus coins', { exact: true }).fill('50');
    await page.getByLabel('Price', { exact: true }).fill('4');
    await page.getByLabel('Original price (optional)', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save coin package', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: packageName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Edit ${packageName}`, exact: true }).click();
    await page.getByRole('checkbox', { name: 'Available to members', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save coin package', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      (await json(await player.request.get('/api/packages'))).items.some(
        (p: any) => p.name === packageName,
      ),
    ).toBeFalsy();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('checkbox', { name: /Weekly/ }).uncheck();
    await page.getByRole('checkbox', { name: /Monthly/ }).check();
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect
      .poll(async () =>
        (await json(await page.request.get('/api/settings'))).settings.enabledPeriods.includes(
          'weekly',
        ),
      )
      .toBe(false);
    const publicPage = await player.newPage();
    await publicPage.goto('/leaderboard');
    await expect(publicPage.locator('body')).not.toContainText('Something got in the way');
    await expect(publicPage.getByRole('button', { name: 'This month', exact: true })).toBeVisible();
    await expect(publicPage.getByRole('heading', { name: 'Monthly leaders', exact: true })).toBeVisible();
    await expect(publicPage.getByRole('button', { name: 'This week', exact: true })).toHaveCount(0);
  } finally {
    await page.request.patch('/api/admin/settings', { data: original }).catch(() => {});
    await player.close();
  }
});
