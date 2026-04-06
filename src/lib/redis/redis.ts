// src/lib/redis.ts
// Singleton Redis client using Upstash REST API.
// Works from both server and edge functions.
// Falls back to in-memory Map if Redis is not configured (dev without creds).

import { Redis } from "@upstash/redis";

// ── Singleton ─────────────────────────────────────────────────────────────────

let _redis: Redis | null = null;
let _fallback: Map<string, { value: string; expiresAt: number | null }> | null = null;

function getRedis(): Redis {
    if (_redis) return _redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn(
            "[Redis] UPSTASH_REDIS_REST_URL or TOKEN not set. " +
            "Using in-memory fallback — data will not persist across restarts."
        );
        throw new Error("NO_REDIS");
    }

    _redis = new Redis({ url, token });
    console.log("[Redis] Connected to Upstash Redis");
    return _redis;
}

// ── In-memory fallback ────────────────────────────────────────────────────────

function getFallback() {
    if (!_fallback) _fallback = new Map();
    return _fallback;
}

function fallbackGet(key: string): string | null {
    const entry = getFallback().get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
        getFallback().delete(key);
        return null;
    }
    return entry.value;
}

function fallbackSet(key: string, value: string, ttlSeconds?: number): void {
    getFallback().set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
}

function fallbackDel(key: string): void {
    getFallback().delete(key);
}

// ── Public API ────────────────────────────────────────────────────────────────
// Simple wrapper that transparently uses Redis or fallback.

export const redis = {

    async get(key: string): Promise<string | null> {
        try {
            const client = getRedis();
            const val = await client.get<string>(key);
            console.log(`[Redis] GET ${key} → ${val ? `${String(val).length} chars` : "miss"}`);
            return val ?? null;
        } catch (err: any) {
            if (err.message !== "NO_REDIS") {
                console.error(`[Redis] GET error for ${key}:`, err.message);
            }
            return fallbackGet(key);
        }
    },

    async set(
        key: string,
        value: string,
        ttlSeconds?: number,
    ): Promise<void> {
        try {
            const client = getRedis();
            if (ttlSeconds) {
                await client.setex(key, ttlSeconds, value);
            } else {
                await client.set(key, value);
            }
            console.log(
                `[Redis] SET ${key} (${value.length} chars${ttlSeconds ? `, TTL ${ttlSeconds}s` : ""})`
            );
        } catch (err: any) {
            if (err.message !== "NO_REDIS") {
                console.error(`[Redis] SET error for ${key}:`, err.message);
            }
            fallbackSet(key, value, ttlSeconds);
        }
    },

    async del(key: string): Promise<void> {
        try {
            const client = getRedis();
            await client.del(key);
            console.log(`[Redis] DEL ${key}`);
        } catch (err: any) {
            if (err.message !== "NO_REDIS") {
                console.error(`[Redis] DEL error for ${key}:`, err.message);
            }
            fallbackDel(key);
        }
    },

    async incr(key: string): Promise<number> {
        try {
            const client = getRedis();
            return await client.incr(key);
        } catch {
            const current = parseInt(fallbackGet(key) ?? "0", 10);
            fallbackSet(key, String(current + 1));
            return current + 1;
        }
    },

    async expire(key: string, ttlSeconds: number): Promise<void> {
        try {
            const client = getRedis();
            await client.expire(key, ttlSeconds);
        } catch {
            const val = fallbackGet(key);
            if (val !== null) fallbackSet(key, val, ttlSeconds);
        }
    },

    // ── Namespaced helpers ────────────────────────────────────────────────────

    keys: {
        fileCache: (wid: string, path: string) =>
            `ws:${wid}:file:${path}`,
        sessionState: (sid: string) =>
            `session:${sid}:state`,
        contextHash: (wid: string) =>
            `ws:${wid}:ctx:hash`,
        contextSnapshot: (wid: string) =>
            `ws:${wid}:ctx:snapshot`,
        rateLimit: (userId: string, route: string) =>
            `rl:${userId}:${route}`,
        tokenCount: (sessionId: string) =>
            `session:${sessionId}:tokens`,
    },
};