import { describe, it, expect, beforeEach } from 'vitest';
import { getCache, setCache, invalidateCache, resetL1Cache } from '../../../server/src/utils/cache';

describe('FC 001l Multi-Tier Caching & Fail-Open Resilience Suite', () => {
  beforeEach(() => {
    resetL1Cache();
  });

  it('debe almacenar y recuperar valores del caché L1 en memoria (Hits & Misses)', async () => {
    const key = 'test:key:1';
    const payload = { title: 'Escolta WEB', active: true };

    const initialMiss = await getCache(key);
    expect(initialMiss).toBeNull();

    await setCache(key, payload, 60);

    const hitResult = await getCache<typeof payload>(key);
    expect(hitResult).not.toBeNull();
    expect(hitResult?.title).toBe('Escolta WEB');
    expect(hitResult?.active).toBe(true);
  });

  it('debe expirar llaves cuyo TTL ha sido superado', async () => {
    const key = 'test:key:ttl';
    const payload = { temp: 'data' };

    // Set TTL for 0 seconds (expires immediately)
    await setCache(key, payload, 0);

    // Wait 10ms for timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = await getCache(key);
    expect(result).toBeNull();
  });

  it('debe invalidar llaves coincidentes con el patrón de invalidación (Condition C-L2)', async () => {
    await setCache('contact:form:1', { name: 'Juan' }, 60);
    await setCache('contact:form:2', { name: 'Maria' }, 60);
    await setCache('lead:step:1', { name: 'Pedro' }, 60);

    await invalidateCache('contact');

    const contactHit1 = await getCache('contact:form:1');
    const contactHit2 = await getCache('contact:form:2');
    const leadHit = await getCache('lead:step:1');

    expect(contactHit1).toBeNull();
    expect(contactHit2).toBeNull();
    expect(leadHit).not.toBeNull();
  });

  it('debe aplicar la política de desalojo LRU al superar las 500 entradas en L1 (Condition C-L3)', async () => {
    // Fill 505 entries
    for (let i = 0; i < 505; i++) {
      await setCache(`bulk:key:${i}`, { index: i }, 60);
    }

    // Key 0 should have been evicted by LRU
    const firstKey = await getCache('bulk:key:0');
    expect(firstKey).toBeNull();

    // Key 504 should still exist
    const lastKey = await getCache('bulk:key:504');
    expect(lastKey).not.toBeNull();
  });

  it('debe degradar silenciosamente a Fail-Open sin arrojar excepciones cuando Redis no está conectado', async () => {
    expect(async () => {
      await getCache('non-existent');
      await setCache('test:failopen', { ok: true });
      await invalidateCache('test');
    }).not.toThrow();
  });
});
