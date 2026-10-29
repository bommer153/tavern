import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'password123';

async function register(page: Page) {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto('/register');
  await page.getByLabel('Display name').fill(`E2E ${id}`);
  await page.getByLabel('Username').fill(`e2e_${id}`);
  await page.getByLabel('Email').fill(`e2e_${id}@test.dev`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Date of birth').fill('1995-06-15');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home/);
  return id;
}

test('landing page shows the hero and live sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your next duo is waiting at the/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a companion' })).toBeVisible();
  await expect(page.getByText('Kaiser').first()).toBeVisible();
});

test('protected routes redirect signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/wallet');
  await expect(page).toHaveURL(/\/login\?next=%2Fwallet/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});

test('discover filters by game and opens a profile', async ({ page }) => {
  await page.goto('/discover?game=valorant');
  await expect(page.getByText('Luna', { exact: true })).toBeVisible();
  await expect(page.getByText('Kaiser', { exact: true })).toHaveCount(0);
  await page.getByText('Luna', { exact: true }).click();
  await expect(page).toHaveURL(/\/c\/luna_val/);
  await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
});

test('register → top up (sandbox) → book a session → companion accepts', async ({ page, browser }) => {
  await register(page);

  // Top up through the dev sandbox provider; coins are credited only after server confirmation.
  await page.goto('/wallet');
  await page.getByRole('button', { name: 'Buy' }).first().click();
  await expect(page).toHaveURL(/\/wallet\/dev-checkout\//);
  await page.getByRole('button', { name: 'Approve sandbox payment' }).click();
  await expect(page.getByText(/Payment confirmed/)).toBeVisible();

  // Schedule a session with a seeded companion (available 10:00–24:00 Manila daily).
  await page.goto('/c/tito_dota');
  await page.getByRole('button', { name: 'Hire now' }).first().click();
  await page.getByRole('radio', { name: /Schedule/ }).click();
  // Random slot so repeated runs don't collide with earlier bookings (the server rejects overlaps).
  const hour = 11 + Math.floor(Math.random() * 12);
  const start = new Date(Date.now() + (2 + Math.floor(Math.random() * 28)) * 86400_000);
  const manila = new Date(start.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const local = new Date(start.getTime() + (hour - manila.getHours()) * 3600_000 - manila.getMinutes() * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page.getByLabel('Start time').fill(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`);
  await page.getByRole('button', { name: 'Confirm & pay' }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9]{24}/);
  await expect(page.getByText('Pending Acceptance')).toBeVisible();
  const orderUrl = page.url();

  // Companion accepts in a separate session.
  const ctx = await browser.newContext();
  const comp = await ctx.newPage();
  await comp.goto('/login');
  await comp.getByLabel('Email').fill('tito_dota@tavern.local');
  await comp.getByLabel('Password').fill('tavern-dev-123');
  await comp.getByRole('button', { name: 'Sign in' }).click();
  await expect(comp).toHaveURL(/\/home/);
  await comp.goto(orderUrl);
  await comp.getByRole('button', { name: 'Accept' }).click();
  await expect(comp.getByText('Accepted', { exact: true })).toBeVisible();
  await ctx.close();

  await page.reload();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Order chat' }).click();
  await page.getByLabel('Message').fill('See you at 3pm!');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('See you at 3pm!')).toBeVisible();
});

test('customers cannot open companion or admin areas', async ({ page }) => {
  await register(page);
  await page.goto('/companion/dashboard');
  await expect(page.getByText("This area isn't available for your account.")).toBeVisible();
  await page.goto('/admin/settings');
  await expect(page.getByText("This area isn't available for your account.")).toBeVisible();
});
