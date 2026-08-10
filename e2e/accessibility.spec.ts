import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WCAG 2.1 AA Accessibility Audit', () => {
  const routes = ['/', '/cookies', '/privacidad', '/terminos', '/en'];

  for (const route of routes) {
    test(`debe pasar la auditoría de accesibilidad WCAG 2.1 AA en ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      const criticalOrSerious = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      expect(
        criticalOrSerious,
        `Violaciones de accesibilidad en ${route}: ${JSON.stringify(criticalOrSerious, null, 2)}`,
      ).toEqual([]);
    });
  }
});
