"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRedisConnect = handleRedisConnect;
exports.handleRedisError = handleRedisError;
exports.initRedisFromEnv = initRedisFromEnv;
exports.getCache = getCache;
exports.setCache = setCache;
exports.invalidateCache = invalidateCache;
exports.resetL1Cache = resetL1Cache;
exports.setRedisStateForTest = setRedisStateForTest;
const ioredis_1 = __importDefault(require("ioredis"));
const metrics_1 = require("./metrics");
const MAX_L1_ENTRIES = 500;
const l1Cache = new Map();
let redisClient = null;
let isRedisConnected = false;
function handleRedisConnect() {
    isRedisConnected = true;
    metrics_1.metricsRegistry.setGauge('is_redis_connected', 1);
}
function handleRedisError(_err) {
    isRedisConnected = false;
    metrics_1.metricsRegistry.setGauge('is_redis_connected', 0);
}
function initRedisFromEnv() {
    handleRedisError();
    redisClient = null;
    if (process.env.REDIS_URL) {
        redisClient = new ioredis_1.default(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 2000,
            tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
        });
        redisClient.on('connect', handleRedisConnect);
        redisClient.on('error', handleRedisError);
    }
}
// Condition C-L5: Support TLS/Auth (rediss://) if REDIS_URL is configured
initRedisFromEnv();
/**
 * Clean up expired L1 entries and enforce LRU max size limit (Condition C-L3)
 */
function evictL1IfNeeded() {
    const now = Date.now();
    // Expire dead keys
    for (const [key, entry] of l1Cache.entries()) {
        if (entry.expiresAt <= now) {
            l1Cache.delete(key);
        }
    }
    // LRU Eviction if size exceeds MAX_L1_ENTRIES
    if (l1Cache.size >= MAX_L1_ENTRIES) {
        l1Cache.delete(l1Cache.keys().next().value);
    }
    metrics_1.metricsRegistry.setGauge('l1_cache_size', l1Cache.size);
}
/**
 * Get value from Multi-Tier Cache (L1 Memory -> L2 Redis -> Miss) (Condition C-L1)
 */
async function getCache(key) {
    const now = Date.now();
    // Condition C-L1: Query L1 Memory Cache First
    if (l1Cache.has(key)) {
        const entry = l1Cache.get(key);
        if (entry.expiresAt > now) {
            metrics_1.metricsRegistry.recordCacheHit('L1');
            return entry.value;
        }
        l1Cache.delete(key);
    }
    metrics_1.metricsRegistry.recordCacheMiss('L1');
    // Query L2 Redis Cache if L1 Misses and Redis Connected (Condition C-L1, C-L5)
    if (isRedisConnected && redisClient) {
        try {
            const data = await redisClient.get(key);
            if (data) {
                const parsed = JSON.parse(data);
                // Populate L1 cache
                l1Cache.set(key, { value: parsed, expiresAt: now + 60000 });
                metrics_1.metricsRegistry.recordCacheHit('L2');
                metrics_1.metricsRegistry.setGauge('l1_cache_size', l1Cache.size);
                return parsed;
            }
        }
        catch (_err) {
            // Fail-Open Graceful Fallback
        }
    }
    metrics_1.metricsRegistry.recordCacheMiss('L2');
    return null;
}
/**
 * Set value in Multi-Tier Cache (L1 Memory & L2 Redis)
 */
async function setCache(key, value, ttlSeconds = 300) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    // Store in L1 Memory Cache with LRU check (Condition C-L3)
    evictL1IfNeeded();
    l1Cache.set(key, { value, expiresAt });
    // Store in L2 Redis Cache if active
    if (isRedisConnected && redisClient) {
        try {
            await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        }
        catch (_err) {
            // Fail-Open Graceful Fallback
        }
    }
}
/**
 * Invalidate cache key or pattern (Condition C-L2)
 */
async function invalidateCache(pattern) {
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
        }
        catch (_err) {
            // Fail-Open Graceful Fallback
        }
    }
}
/**
 * Reset L1 cache (Utility for testing)
 */
function resetL1Cache() {
    l1Cache.clear();
}
/**
 * Configure Redis state for testing (Utility for testing L2 Redis branches)
 */
function setRedisStateForTest(client, connected) {
    redisClient = client;
    isRedisConnected = connected;
}
