// src/server/workspace/workspace-watcher.ts — complete rewrite
// Calls Convex directly from the watcher using ConvexHttpClient.
// Eliminates the bridge → API route → Convex chain entirely.
// No module singleton issue possible since everything is in one process.

import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { getWorkspacePathSafe } from "./local-registry";

// ── Convex client (server-side, no auth needed for internal mutations) ────────

const convex = new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://localhost:3210"
);

// ── Types ─────────────────────────────────────────────────────────────────────

type WatcherMeta = {
    convexWorkspaceId: string;
    projectId: string;
};

type WatcherEntry = {
    watcher: FSWatcher;
    meta: WatcherMeta;
};

// ── State ─────────────────────────────────────────────────────────────────────

const activeWatchers = new Map<string, WatcherEntry>();
const pendingBatch = new Map<string, Map<string, BatchedEvent>>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

type BatchedEvent = {
    eventType: "add" | "addDir" | "unlink" | "unlinkDir";
    relativePath: string;
    name: string;
    parentPath: string | undefined;
    isDirectory: boolean;
};

// ── Ignored paths ─────────────────────────────────────────────────────────────

const IGNORED_SEGMENTS = new Set([
    "node_modules", ".git", ".next", "dist", "build",
    "target", "__pycache__", ".cache", "coverage",
    ".turbo", ".svelte-kit", ".parcel-cache",
]);

function shouldIgnore(relativePath: string): boolean {
    return relativePath.split("/").some(p => IGNORED_SEGMENTS.has(p));
}

function getParentPath(relativePath: string): string | undefined {
    const parts = relativePath.split("/").filter(Boolean);
    return parts.length <= 1 ? undefined : parts.slice(0, -1).join("/");
}

function getFileName(relativePath: string): string {
    return relativePath.split("/").filter(Boolean).pop() ?? relativePath;
}

// ── Batch + debounce ──────────────────────────────────────────────────────────
// Keyed by relativePath so add→unlink on same path collapses to last event.

const DEBOUNCE_MS = 400;

function queueEvent(
    workspaceId: string,
    event: BatchedEvent,
): void {
    if (shouldIgnore(event.relativePath)) return;
    if (!event.relativePath || event.relativePath === ".") return;

    // Get or create batch map for this workspace
    let batch = pendingBatch.get(workspaceId);
    if (!batch) {
        batch = new Map();
        pendingBatch.set(workspaceId, batch);
    }

    // Last event for a path wins
    batch.set(event.relativePath, event);

    // Reset debounce timer
    const existing = debounceTimers.get(workspaceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        debounceTimers.delete(workspaceId);
        flushBatch(workspaceId);
    }, DEBOUNCE_MS);

    debounceTimers.set(workspaceId, timer);
}

async function flushBatch(workspaceId: string): Promise<void> {
    const batch = pendingBatch.get(workspaceId);
    pendingBatch.delete(workspaceId);

    if (!batch || batch.size === 0) return;

    const entry = activeWatchers.get(workspaceId);
    if (!entry) return;

    const { convexWorkspaceId, projectId } = entry.meta;
    const events = Array.from(batch.values());

    console.log(
        `[Watcher] Flushing ${events.length} events for ${workspaceId}:`,
        events.map(e => `${e.eventType}:${e.relativePath}`)
    );

    // Process sequentially — avoids race conditions on nested paths
    for (const event of events) {
        try {
            if (event.eventType === "add" || event.eventType === "addDir") {
                await convex.mutation(api.files.internalCreateFile, {
                    workspaceId: convexWorkspaceId as any,
                    projectId: projectId as any,
                    relativePath: event.relativePath,
                    name: event.name,
                    type: event.isDirectory ? "folder" : "file",
                    parentPath: event.parentPath,   // already undefined for root
                });
                console.log(`[Watcher] ✓ synced: ${event.eventType} ${event.relativePath}`);

            } else if (event.eventType === "unlink" || event.eventType === "unlinkDir") {
                await convex.mutation(api.files.internalDeleteFile, {
                    workspaceId: convexWorkspaceId as any,
                    relativePath: event.relativePath,
                });
                console.log(`[Watcher] ✓ deleted: ${event.relativePath}`);
            }
        } catch (err: any) {
            // "Already exists" is fine — UI created it before watcher fired
            if (!err.message?.includes("Already exists")) {
                console.error(
                    `[Watcher] ✗ failed ${event.eventType}:${event.relativePath}:`,
                    err.message
                );
            }
        }
    }
}

// ── Start watching ────────────────────────────────────────────────────────────

export function startWatching(
    workspaceId: string,
    convexWorkspaceId: string,
    projectId: string,
): void {
    if (activeWatchers.has(workspaceId)) {
        // Update meta in case it changed
        activeWatchers.get(workspaceId)!.meta = { convexWorkspaceId, projectId };
        return;
    }

    const workspacePath = getWorkspacePathSafe(workspaceId);
    if (!workspacePath) {
        console.warn(`[Watcher] Cannot watch — path not found: ${workspaceId}`);
        return;
    }

    console.log(`[Watcher] Starting: ${workspaceId} → ${workspacePath}`);

    const watcher = chokidar.watch(workspacePath, {
        ignored: (filePath: string) => {
            const rel = path.relative(workspacePath, filePath);
            return shouldIgnore(rel);
        },
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        depth: 20,
        awaitWriteFinish: {
            stabilityThreshold: 150,
            pollInterval: 50,
        },
        usePolling: false,
    });

    const meta: WatcherMeta = { convexWorkspaceId, projectId };

    watcher
        .on("add", (filePath) => {
            const rel = path.relative(workspacePath, filePath).replace(/\\/g, "/");
            queueEvent(workspaceId, {
                eventType: "add",
                relativePath: rel,
                name: getFileName(rel),
                parentPath: getParentPath(rel),
                isDirectory: false,
            });
        })
        .on("addDir", (filePath) => {
            const rel = path.relative(workspacePath, filePath).replace(/\\/g, "/");
            if (!rel || rel === ".") return;
            queueEvent(workspaceId, {
                eventType: "addDir",
                relativePath: rel,
                name: getFileName(rel),
                parentPath: getParentPath(rel),
                isDirectory: true,
            });
        })
        .on("unlink", (filePath) => {
            const rel = path.relative(workspacePath, filePath).replace(/\\/g, "/");
            queueEvent(workspaceId, {
                eventType: "unlink",
                relativePath: rel,
                name: getFileName(rel),
                parentPath: getParentPath(rel),
                isDirectory: false,
            });
        })
        .on("unlinkDir", (filePath) => {
            const rel = path.relative(workspacePath, filePath).replace(/\\/g, "/");
            queueEvent(workspaceId, {
                eventType: "unlinkDir",
                relativePath: rel,
                name: getFileName(rel),
                parentPath: getParentPath(rel),
                isDirectory: true,
            });
        })
        .on("error", (err) => console.error(`[Watcher] Error:`, err))
        .on("ready", () => console.log(`[Watcher] Ready: ${workspaceId}`));

    activeWatchers.set(workspaceId, { watcher, meta });
}

// ── Stop watching ─────────────────────────────────────────────────────────────

export async function stopWatching(workspaceId: string): Promise<void> {
    const entry = activeWatchers.get(workspaceId);
    if (!entry) return;

    await entry.watcher.close();
    activeWatchers.delete(workspaceId);

    const timer = debounceTimers.get(workspaceId);
    if (timer) clearTimeout(timer);
    debounceTimers.delete(workspaceId);
    pendingBatch.delete(workspaceId);

    console.log(`[Watcher] Stopped: ${workspaceId}`);
}

export function getActiveWatcherCount(): number {
    return activeWatchers.size;
}