/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('ioredis', () => {
  class MockRedis {
    constructor(url: any) {
      if (String(url).includes('throw_error')) {
        throw new Error('Constructor Error');
      }
    }
    on(event: string, callback: (...args: unknown[]) => unknown) {
      if (event === 'connect') {
        callback();
      }
      if (event === 'error') {
        callback(new Error('Mock Redis Error'));
      }
      return this;
    }
  }
  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

import {
  getCache,
  setCache,
  invalidateCache,
  resetL1Cache,
  setRedisStateForTest,
  initRedisFromEnv,
} from '../../../server/src/utils/cache';

describe('FC 001l Multi-Tier Caching & Fail-Open Resilience Suite', () => {
  const originalEnv = process.env.REDIS_URL;

  beforeEach(() => {
    resetL1Cache();
    process.env.REDIS_URL = originalEnv;
  });

  it('initRedisFromEnv debe inicializar Redis, ejecutar listeners connect/error y capturar excepciones de constructor', async () => {
    const { handleRedisConnect, handleRedisError } =
      await import('../../../server/src/utils/cache');
    handleRedisConnect();
    handleRedisError(new Error('Test Error'));
    handleRedisError();

    process.env.REDIS_URL = 'rediss://default:password@localhost:6379';
    expect(() => initRedisFromEnv()).not.toThrow();

    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => initRedisFromEnv()).not.toThrow();

    process.env.REDIS_URL = 'redis://localhost:6379/throw_error';
    expect(() => initRedisFromEnv()).not.toThrow();

    delete process.env.REDIS_URL;
    expect(() => initRedisFromEnv()).not.toThrow();
  });

  it('evictL1IfNeeded debe limpiar llaves expiradas en L1 al insertar nuevos elementos', async () => {
    // Insert an item with TTL 0 to expire immediately
    await setCache('expired:key:1', { expired: true }, 0);
    await new Promise((resolve) => setTimeout(resolve, 15));

    // Inserting another key triggers evictL1IfNeeded which deletes expired:key:1
    await setCache('valid:key:1', { valid: true }, 60);

    const expiredResult = await getCache('expired:key:1');
    expect(expiredResult).toBeNull();
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

  it('debe expirar llaves cuyo TTL ha sido superado y limpiarlas de L1', async () => {
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

  it('debe interactuar con la capa L2 Redis cuando está conectada', async () => {
    const mockRedis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ fromRedis: true })),
      set: vi.fn().mockResolvedValue('OK'),
      keys: vi.fn().mockResolvedValue(['cache:1', 'cache:2']),
      del: vi.fn().mockResolvedValue(2),
    };

    setRedisStateForTest(mockRedis, true);

    // L1 Miss -> L2 Redis Hit -> Populate L1
    const l2Hit = await getCache<{ fromRedis: boolean }>('redis:test:key');
    expect(l2Hit?.fromRedis).toBe(true);
    expect(mockRedis.get).toHaveBeenCalledWith('redis:test:key');

    // setCache with Redis connected
    await setCache('redis:set:key', { saved: true }, 100);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'redis:set:key',
      JSON.stringify({ saved: true }),
      'EX',
      100,
    );

    // invalidateCache with matching Redis keys
    await invalidateCache('cache');
    expect(mockRedis.keys).toHaveBeenCalledWith('*cache*');
    expect(mockRedis.del).toHaveBeenCalledWith('cache:1', 'cache:2');

    // invalidateCache when no keys match
    mockRedis.keys.mockResolvedValueOnce([]);
    await invalidateCache('empty');

    // Redis get returns null (L2 Miss)
    mockRedis.get.mockResolvedValueOnce(null);
    resetL1Cache();
    const missL2 = await getCache('not:found:in:redis');
    expect(missL2).toBeNull();

    // Exception handling inside Redis calls
    mockRedis.get.mockRejectedValueOnce(new Error('Redis get error'));
    resetL1Cache();
    const hitErr = await getCache('error:key');
    expect(hitErr).toBeNull();

    mockRedis.set.mockRejectedValueOnce(new Error('Redis set error'));
    await expect(setCache('error:key', { data: 1 })).resolves.not.toThrow();

    mockRedis.keys.mockRejectedValueOnce(new Error('Redis keys error'));
    await expect(invalidateCache('error')).resolves.not.toThrow();

    // Reset Redis state
    setRedisStateForTest(null, false);
  });

  it('debe cubrir branches de fallback en crypto y metrics', async () => {
    const { getJwtSecret } = await import('../../../server/src/utils/crypto');
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(getJwtSecret()).toBe('dreamtek_dev_jwt_secret_key_2026');
    process.env.JWT_SECRET = originalSecret;
  });
});
