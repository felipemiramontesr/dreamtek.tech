import { test, expect } from '@playwright/test';

test.describe('Onboarding Wizard E2E Flow', () => {
  test('debe cargar la aplicación y verificar la presencia de elementos interactivos de onboarding', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const heroTitle = page.locator('h1').first();
    await expect(heroTitle).toBeVisible();

    const ctaButton = page
      .locator(
        'button:has-text("Comenzar Proyecto"), button:has-text("Start Project"), button:has-text("Servicios")',
      )
      .first();
    await expect(ctaButton).toBeVisible();
  });
});
