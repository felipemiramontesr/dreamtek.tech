import { test, expect } from '@playwright/test';

test.describe('Onboarding Wizard E2E Flow', () => {
  test('debe cargar la aplicación y verificar el flujo del Onboarding Wizard', async ({ page }) => {
    // Pre-accept cookies to prevent banner backdrop from intercepting clicks
    await page.addInitScript(() => {
      localStorage.setItem('cookieConsent', 'accepted');
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const heroTitle = page.locator('h1').first();
    await expect(heroTitle).toBeVisible();

    const heroCta = page
      .locator(
        'button:has-text("Solicitar Diagnóstico"), button:has-text("Request Initial Assessment"), button:has-text("Área de clientes")',
      )
      .first();
    await expect(heroCta).toBeVisible();

    // Scroll to products and open Starterkit Modal
    const scopeBtn = page
      .locator('button:has-text("Ver Alcance"), button:has-text("View Scope")')
      .first();
    if (await scopeBtn.isVisible()) {
      await scopeBtn.scrollIntoViewIfNeeded();
      await scopeBtn.click();

      // Check if modal opens
      const modalHeader = page
        .locator('h2:has-text("Escolta WEB"), h3:has-text("Escolta WEB")')
        .first();
      await expect(modalHeader).toBeVisible();

      // Click on onboarding button inside modal if present
      const startOnboardingBtn = page
        .locator(
          'button:has-text("Iniciar mi Posicionamiento"), button:has-text("Start My Web Positioning"), button:has-text("Onboarding")',
        )
        .first();
      if (await startOnboardingBtn.isVisible()) {
        await startOnboardingBtn.click();

        // Verify wizard step 1 is rendered
        const step1Header = page.locator('text=Paso 1: Información de Contacto').first();
        await expect(step1Header).toBeVisible();
      }
    }
  });
});
