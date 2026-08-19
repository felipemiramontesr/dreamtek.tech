import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import robots, { dynamic as robotsDynamic } from '@/app/robots';
import sitemap, { dynamic as sitemapDynamic } from '@/app/sitemap';
import RootLayout, { metadata, viewport } from '@/app/layout';
import LandingLayout from '@/app/(landing)/layout';
import * as dbTypes from '@/lib/db/types';

vi.mock('next/font/local', () => ({
  default: () => ({
    variable: '--font-neue-montreal',
  }),
}));

vi.mock('@/components/layout/ClientWrapper', () => ({
  ClientWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="client-wrapper">{children}</div>
  ),
}));

describe('App Metadata, SEO & Layouts (100% Coverage Suite)', () => {
  it('robots.ts debe retornar reglas de indexación válidas y configuración estática', () => {
    expect(robotsDynamic).toBe('force-static');
    const result = robots();
    expect(result).toHaveProperty('rules');
    expect(result.rules).toEqual([
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ]);
    expect(result.sitemap).toBe('https://dreamtek.tech/sitemap.xml');
    expect(result.host).toBe('https://dreamtek.tech');
  });

  it('sitemap.ts debe retornar todas las rutas indexables con URLs canónicas e i18n', () => {
    expect(sitemapDynamic).toBe('force-static');
    const result = sitemap();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(8);

    const home = result.find((item) => item.url === 'https://dreamtek.tech/');
    expect(home).toBeDefined();
    expect(home?.priority).toBe(1.0);
    expect(home?.changeFrequency).toBe('daily');
    expect(home?.alternates?.languages).toEqual({
      es: 'https://dreamtek.tech/',
      en: 'https://dreamtek.tech/en',
    });

    const enHome = result.find((item) => item.url === 'https://dreamtek.tech/en');
    expect(enHome).toBeDefined();
    expect(enHome?.priority).toBe(0.9);

    const privacy = result.find((item) => item.url === 'https://dreamtek.tech/privacidad');
    expect(privacy).toBeDefined();
    expect(privacy?.priority).toBe(0.3);

    const terms = result.find((item) => item.url === 'https://dreamtek.tech/terminos');
    expect(terms).toBeDefined();

    const cookies = result.find((item) => item.url === 'https://dreamtek.tech/cookies');
    expect(cookies).toBeDefined();
  });

  it('layout.tsx debe exportar metadata completa y viewport', () => {
    expect(metadata).toBeDefined();
    expect(metadata.metadataBase?.toString()).toBe('https://dreamtek.tech/');
    expect(metadata.title).toEqual({
      default: 'Dreamtek.',
      template: '%s | Dreamtek.',
    });
    expect(metadata.description).toContain('Convertimos visiones complejas');
    expect(metadata.manifest).toBe('/manifest.json');
    expect(viewport).toEqual({ themeColor: '#00213d' });
  });

  it('RootLayout debe renderizar la estructura HTML básica envolviendo a ClientWrapper', () => {
    render(
      <RootLayout>
        <span data-testid="test-child">Child Content</span>
      </RootLayout>,
    );
    expect(screen.getByTestId('client-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toHaveTextContent('Child Content');
  });

  it('LandingLayout debe renderizar a sus hijos de forma transparente', () => {
    render(
      <LandingLayout>
        <div data-testid="landing-child">Landing Content</div>
      </LandingLayout>,
    );
    expect(screen.getByTestId('landing-child')).toHaveTextContent('Landing Content');
  });

  it('src/lib/db/types.ts debe exportar versión de esquema de DB', () => {
    expect(dbTypes).toBeDefined();
    expect(dbTypes.DB_SCHEMA_VERSION).toBe('1.0.0');
  });
});
