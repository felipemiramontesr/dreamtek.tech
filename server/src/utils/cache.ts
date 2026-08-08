import Redis from 'ioredis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_L1_ENTRIES = 500;
const l1Cache = new Map<string, CacheEntry<any>>();

let redisClient: Redis | null = null;
let isRedisConnected = false;

// Condition C-L5: Support TLS/Auth (rediss://) if REDIS_URL is configured
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('✅ Connected to L2 Redis Cache.');
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      console.warn('⚠️ L2 Redis Cache Warning (Fail-Open Fallback to L1):', err.message);
    });
  } catch (_err) {
    redisClient = null;
    isRedisConnected = false;
  }
}

/**
 * Clean up expired L1 entries and enforce LRU max size limit (Condition C-L3)
 */
function evictL1IfNeeded(): void {
  const now = Date.now();

  // Expire dead keys
  for (const [key, entry] of l1Cache.entries()) {
    if (entry.expiresAt <= now) {
      l1Cache.delete(key);
    }
  }

  // LRU Eviction if size exceeds MAX_L1_ENTRIES
  if (l1Cache.size >= MAX_L1_ENTRIES) {
    const oldestKey = l1Cache.keys().next().value;
    if (oldestKey) {
      l1Cache.delete(oldestKey);
    }
  }
}

/**
 * Get value from Multi-Tier Cache (L1 Memory -> L2 Redis -> Miss) (Condition C-L1)
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const now = Date.now();

  // Condition C-L1: Query L1 Memory Cache First
  if (l1Cache.has(key)) {
    const entry = l1Cache.get(key)!;
    if (entry.expiresAt > now) {
      return entry.value as T;
    }
    l1Cache.delete(key);
  }

  // Query L2 Redis Cache if L1 Misses and Redis Connected (Condition C-L1, C-L5)
  if (isRedisConnected && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        const parsed = JSON.parse(data) as T;
        // Populate L1 cache
        l1Cache.set(key, { value: parsed, expiresAt: now + 60000 });
        return parsed;
      }
    } catch (_err) {
      // Fail-Open Graceful Fallback
    }
  }

  return null;
}

/**
 * Set value in Multi-Tier Cache (L1 Memory & L2 Redis)
 */
export async function setCache<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  // Store in L1 Memory Cache with LRU check (Condition C-L3)
  evictL1IfNeeded();
  l1Cache.set(key, { value, expiresAt });

  // Store in L2 Redis Cache if active
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (_err) {
      // Fail-Open Graceful Fallback
    }
  }
}

/**
 * Invalidate cache key or pattern (Condition C-L2)
 */
export async function invalidateCache(pattern: string): Promise<void> {
  // Clear L1 keys matching pattern
  for (const key of l1Cache.keys()) {
    if (key.includes(pattern)) {
      l1Cache.delete(key);
    }
  }

  // Clear L2 Redis keys matching pattern
  if (isRedisConnected && redisClient) {
    try {
      const keys = await redisClient.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (_err) {
      // Fail-Open Graceful Fallback
    }
  }
}

/**
 * Reset L1 cache (Utility for testing)
 */
export function resetL1Cache(): void {
  l1Cache.clear();
}

/**
 * Configure Redis state for testing (Utility for testing L2 Redis branches)
 */
export function setRedisStateForTest(client: any, connected: boolean): void {
  redisClient = client;
  isRedisConnected = connected;
}

