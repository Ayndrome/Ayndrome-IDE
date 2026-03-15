// src/server/workspace/auto-save.ts
// Background auto-save loop.
// Runs as a setInterval on the server — commits any dirty workspace
// every 60 seconds. On tab close, the API route triggers an immediate
// commit + push before the container idles.

import { autoCommit, pushToRemote, getGitStatus } from "./git-manager";
import { listWorkspaces } from "./local-resgistry";

const AUTO_SAVE_INTERVAL_MS = 60_000;  // 1 minute
const PUSH_INTERVAL_MS = 300_000; // 5 minutes

// Track which workspaces are "active" (container is running)
// Only auto-save active workspaces — no point committing stopped ones
const activeWorkspaces = new Set<string>();

export function markWorkspaceActive(workspaceId: string): void {
    activeWorkspaces.add(workspaceId);
}

export function markWorkspaceInactive(workspaceId: string): void {
    activeWorkspaces.delete(workspaceId);
}

// Called from server.ts once on startup
export function startAutoSaveLoop(): void {
    console.log("[AutoSave] Loop started");

    // Commit dirty workspaces every 60s
    setInterval(async () => {
        for (const workspaceId of activeWorkspaces) {
            try {
                const status = await getGitStatus(workspaceId);
                if (status.isDirty) {
                    const result = await autoCommit(workspaceId);
                    if (result.success && result.output !== "Nothing to commit") {
                        console.log(`[AutoSave] ${workspaceId}: ${result.output}`);
                    }
                }
            } catch (err) {
                // Never crash the loop — log and continue
                console.error(`[AutoSave] Error for ${workspaceId}:`, err);
            }
        }
    }, AUTO_SAVE_INTERVAL_MS);

    // Push to remote every 5 minutes
    setInterval(async () => {
        for (const workspaceId of activeWorkspaces) {
            try {
                const result = await pushToRemote(workspaceId);
                if (result.success && !result.output?.includes("No remote")) {
                    console.log(`[AutoSave] Pushed ${workspaceId}`);
                }
            } catch (err) {
                console.error(`[AutoSave] Push error for ${workspaceId}:`, err);
            }
        }
    }, PUSH_INTERVAL_MS);
}

// Called from /api/workspace/close — immediate save before container sleeps
export async function saveOnClose(workspaceId: string): Promise<void> {
    console.log(`[AutoSave] Saving on close: ${workspaceId}`);
    try {
        await autoCommit(workspaceId, "session-end");
        await pushToRemote(workspaceId);
    } catch (err) {
        console.error(`[AutoSave] Save-on-close failed: ${workspaceId}`, err);
    } finally {
        markWorkspaceInactive(workspaceId);
    }
}