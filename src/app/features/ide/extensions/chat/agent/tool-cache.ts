// // src/app/features/ide/extensions/chat/agent/tool-cache.ts
// // Prevents the agent from re-reading the same file multiple times per run.
// // Caches file content keyed by relativePath for the lifetime of one agent loop.
// // Cleared at the start of each new agent invocation.

// // ── Per-run cache ─────────────────────────────────────────────────────────────

// type CacheEntry = {
//     content: string;
//     cachedAt: number;
//     hitCount: number;
// };

// let _cache = new Map<string, CacheEntry>();
// let _runId = "";

// // ── Lifecycle ─────────────────────────────────────────────────────────────────

// export function startNewRun(runId: string): void {
//     _cache = new Map();
//     _runId = runId;
//     console.log(`[ToolCache] New run: ${runId}`);
// }

// export function clearCache(): void {
//     const size = _cache.size;
//     _cache = new Map();
//     if (size > 0) {
//         console.log(`[ToolCache] Cleared ${size} entries`);
//     }
// }

// // ── Read cache ────────────────────────────────────────────────────────────────

// export function getCachedFile(relativePath: string): string | null {
//     const entry = _cache.get(relativePath);
//     if (!entry) return null;

//     entry.hitCount++;
//     if (entry.hitCount > 1) {
//         console.log(`[ToolCache] Cache hit #${entry.hitCount}: ${relativePath}`);
//     }
//     return entry.content;
// }

// export function setCachedFile(relativePath: string, content: string): void {
//     _cache.set(relativePath, {
//         content,
//         cachedAt: Date.now(),
//         hitCount: 0,
//     });
// }

// // ── Invalidate on write ───────────────────────────────────────────────────────
// // When the agent writes a file, its cached content is stale.

// export function invalidateFile(relativePath: string): void {
//     if (_cache.has(relativePath)) {
//         _cache.delete(relativePath);
//         console.log(`[ToolCache] Invalidated: ${relativePath}`);
//     }
// }

// // ── Stats ─────────────────────────────────────────────────────────────────────

// export function getCacheStats(): { entries: number; totalHits: number } {
//     let totalHits = 0;
//     for (const entry of _cache.values()) {
//         totalHits += entry.hitCount;
//     }
//     return { entries: _cache.size, totalHits };
// }


// src/app/features/ide/extensions/chat/agent/tool-cache.ts
// Phase 0-A: extended to use Redis for cross-run persistence.
// Falls back to in-memory Map if Redis unavailable.
// Cache key: workspace:filePath → content (TTL 1h, invalidated on write)

import { redis } from "@/src/lib/redis/redis";

// ── Per-run in-memory layer (L1) ──────────────────────────────────────────────
// Instant reads within a single agent run. Redis is the L2.

type MemEntry = {
    content: string;
    hitCount: number;
};

let _memCache = new Map<string, MemEntry>();
let _runId = "";
let _workspaceId = "";

const FILE_CACHE_TTL = 60 * 60;      // 1 hour
const MAX_CACHE_SIZE = 500_000;      // 500KB per file — don't cache huge files

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startNewRun(runId: string, workspaceId?: string): void {
    _memCache = new Map();
    _runId = runId;
    _workspaceId = workspaceId ?? _workspaceId;
    console.log(`[ToolCache] New run: ${runId}, workspace: ${_workspaceId}`);
}

export function clearCache(): void {
    const size = _memCache.size;
    _memCache = new Map();
    if (size > 0) {
        console.log(`[ToolCache] Cleared ${size} L1 entries (Redis L2 persists)`);
    }
}

// ── Read cache ────────────────────────────────────────────────────────────────

export async function getCachedFile(
    relativePath: string,
): Promise<string | null> {
    // L1: check in-memory first (zero latency)
    const mem = _memCache.get(relativePath);
    if (mem) {
        mem.hitCount++;
        console.log(
            `[ToolCache] L1 hit #${mem.hitCount}: ${relativePath} ` +
            `(${mem.content.length} chars saved from LLM context)`
        );
        return mem.content;
    }

    // L2: check Redis
    if (_workspaceId) {
        const key = redis.keys.fileCache(_workspaceId, relativePath);
        const cached = await redis.get(key);
        if (cached) {
            // Warm L1
            _memCache.set(relativePath, { content: cached, hitCount: 1 });
            console.log(
                `[ToolCache] L2 (Redis) hit: ${relativePath} ` +
                `(${cached.length} chars, saved API call)`
            );
            return cached;
        }
    }

    return null;
}

export async function setCachedFile(
    relativePath: string,
    content: string,
): Promise<void> {
    if (content.length > MAX_CACHE_SIZE) {
        console.log(
            `[ToolCache] Skipping cache for ${relativePath} — ` +
            `too large (${content.length} chars > ${MAX_CACHE_SIZE})`
        );
        return;
    }

    // L1: always cache in memory
    _memCache.set(relativePath, { content, hitCount: 0 });

    // L2: persist to Redis with TTL
    if (_workspaceId) {
        const key = redis.keys.fileCache(_workspaceId, relativePath);
        await redis.set(key, content, FILE_CACHE_TTL);
        console.log(
            `[ToolCache] Cached ${relativePath} ` +
            `(${content.length} chars, TTL ${FILE_CACHE_TTL}s)`
        );
    }
}

export async function invalidateFile(relativePath: string): Promise<void> {
    const hadL1 = _memCache.has(relativePath);
    _memCache.delete(relativePath);

    if (_workspaceId) {
        const key = redis.keys.fileCache(_workspaceId, relativePath);
        await redis.del(key);
    }

    if (hadL1) {
        console.log(`[ToolCache] Invalidated (L1+L2): ${relativePath}`);
    }
}

// Synchronous shim for places that can't await (kept for compatibility)
export function invalidateFileSync(relativePath: string): void {
    _memCache.delete(relativePath);
    // Fire-and-forget Redis invalidation
    if (_workspaceId) {
        const key = redis.keys.fileCache(_workspaceId, relativePath);
        redis.del(key).catch(err =>
            console.error(`[ToolCache] Redis invalidation error:`, err)
        );
    }
}

export function getCacheStats(): {
    l1Entries: number;
    l1HitTotal: number;
} {
    let total = 0;
    for (const e of _memCache.values()) total += e.hitCount;
    return { l1Entries: _memCache.size, l1HitTotal: total };
}