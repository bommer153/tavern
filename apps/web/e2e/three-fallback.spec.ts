import { expect, test } from '@playwright/test';

// Launch flags must be file-level; this browser has no WebGL at all.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } });

test('discover still shows real people and no canvas without WebGL', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.getByText('Kaiser', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find your people' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});
