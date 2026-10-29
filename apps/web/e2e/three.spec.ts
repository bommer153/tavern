import { expect, test } from '@playwright/test';

// 3D is progressive enhancement: one canvas per screen and real filtering. No-WebGL coverage lives in three-fallback.spec.ts.
test('discover renders a single 3D scene and the game selector filters real results', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole('group', { name: 'Games' }).getByRole('button', { name: /Valorant/ }).click();
  await expect(page).toHaveURL(/game=valorant/);
  await expect(page.getByText('Luna', { exact: true })).toBeVisible();
  await expect(page.getByText('Kaiser', { exact: true })).toHaveCount(0);
});
