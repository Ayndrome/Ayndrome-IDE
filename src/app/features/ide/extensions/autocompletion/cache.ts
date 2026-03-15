import { LRUCache } from "./autocompletionService";

/** Shape of every entry stored in the suggestion cache. */
export type CachedSuggestion = {
    status: "finished";
    /** Postprocessed ghost text (null if AI returned nothing useful). */
    suggestion: string | null;
    promise: Promise<string | null>;
    /** The full doc prefix that was used to generate this suggestion. */
    prefix: string;
    timestamp: number;
};

/**
 * Module-level LRU cache — keyed by the doc prefix at generation time.
 *
 * Size 20 means we keep the last 20 unique prefixes; older ones are evicted.
 */
export const cache = new LRUCache<string, CachedSuggestion>(20);

/**
 * Scan the cache for an entry whose prefix is a prefix of `currentPrefix`.
 * This lets us serve a cached suggestion even when the user has continued
 * typing past the point where the cache entry was generated.
 */
export function findCacheMatch(currentPrefix: string): CachedSuggestion | null {
    // Exact hit first — fastest path
    const exact = cache.items.get(currentPrefix);
    if (exact) return exact;

    // Prefix scan — O(n) but cache is tiny (≤20 items)
    for (const [key, entry] of cache.items) {
        if (currentPrefix.startsWith(key)) {
            return entry;
        }
    }
    return null;
}
