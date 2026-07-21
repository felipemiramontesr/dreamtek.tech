import { describe, it, expect } from 'vitest';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

describe('Dictionaries i18n', () => {
  it('debe tener las mismas claves principales en es y en', () => {
    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();

    expect(esKeys).toEqual(enKeys);
    expect(es.navbar.services).toBeDefined();
    expect(en.navbar.services).toBeDefined();
  });
});
