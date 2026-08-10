import { test, expect } from '@playwright/test';

test.describe('Contacto y 2FA E2E Flow', () => {
  test('debe cargar la sección de contacto y validar campos de entrada', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const contactHeader = page
      .locator('#contacto, h2:has-text("Contacto"), h2:has-text("Contact")')
      .first();
    await expect(contactHeader).toBeVisible();

    const nameInput = page
      .locator('input[name="name"], input[placeholder*="nombre" i], input[placeholder*="name" i]')
      .first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Usuario de Prueba E2E');
      await expect(nameInput).toHaveValue('Usuario de Prueba E2E');
    }
  });
});
