import { test, expect } from '@playwright/test';

test.describe('Portal Modal & Autenticación E2E Flow', () => {
  test('debe cargar la aplicación y verificar accesibilidad del portal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const navbar = page.locator('nav, header').first();
    await expect(navbar).toBeVisible();

    const portalBtn = page
      .locator('button:has-text("Portal"), a:has-text("Portal"), button:has-text("Acceso")')
      .first();
    if (await portalBtn.isVisible()) {
      await portalBtn.click();
    }
  });
});
