// // src/app/features/ide/extensions/chat/agent/workspace-state.ts
// // Manages the active workspace state block — separate from chat history.
// // Files read/edited during a session live here, not in the message array.

// type ActiveFile = {
//     path: string;
//     content: string;      // current content (updated on write_file)
//     tokenEstimate: number;
//     lastAccessed: number;      // timestamp — evict LRU when over budget
//     isPinned: boolean;     // user @mentioned or agent is actively editing
// };

// type WorkspaceState = {
//     files: Map<string, ActiveFile>;
//     tokenBudget: number;      // max tokens for workspace state block
//     usedTokens: number;
// };

// const WORKSPACE_STATE_BUDGET = 40_000;  // 40K tokens reserved for active files
// // Leaves ~60K for conversation in a 100K context model
// // Leaves ~160K for conversation in a 200K context model

// let _state: WorkspaceState = {
//     files: new Map(),
//     tokenBudget: WORKSPACE_STATE_BUDGET,
//     usedTokens: 0,
// };

// export function addFileToState(path: string, content: string, pin = false): void {
//     const tokens = estimateTokens(content);

//     // If already exists, update content
//     if (_state.files.has(path)) {
//         const existing = _state.files.get(path)!;
//         _state.usedTokens -= existing.tokenEstimate;
//         existing.content = content;
//         existing.tokenEstimate = tokens;
//         existing.lastAccessed = Date.now();
//         existing.isPinned = pin || existing.isPinned;
//         _state.usedTokens += tokens;
//         return;
//     }

//     // Evict LRU non-pinned files if over budget
//     while (_state.usedTokens + tokens > _state.tokenBudget) {
//         const evicted = evictLRUFile();
//         if (!evicted) break;   // all files pinned, can't evict
//         console.log(
//             `[WorkspaceState] Evicted ${evicted} to make room ` +
//             `(budget: ${_state.usedTokens}/${_state.tokenBudget} tokens)`
//         );
//     }

//     _state.files.set(path, {
//         path,
//         content,
//         tokenEstimate: tokens,
//         lastAccessed: Date.now(),
//         isPinned: pin,
//     });
//     _state.usedTokens += tokens;

//     console.log(
//         `[WorkspaceState] Added ${path}: ${tokens} tokens ` +
//         `(total: ${_state.usedTokens}/${_state.tokenBudget})`
//     );
// }

// export function updateFileInState(path: string, newContent: string): void {
//     // Called after write_file succeeds — keeps state in sync with disk
//     addFileToState(path, newContent, _state.files.get(path)?.isPinned ?? false);
// }

// export function removeFileFromState(path: string): void {
//     const file = _state.files.get(path);
//     if (file) {
//         _state.usedTokens -= file.tokenEstimate;
//         _state.files.delete(path);
//         console.log(`[WorkspaceState] Removed ${path} from active state`);
//     }
// }

// function evictLRUFile(): string | null {
//     let oldest: ActiveFile | null = null;
//     for (const file of _state.files.values()) {
//         if (file.isPinned) continue;
//         if (!oldest || file.lastAccessed < oldest.lastAccessed) {
//             oldest = file;
//         }
//     }
//     if (!oldest) return null;
//     removeFileFromState(oldest.path);
//     return oldest.path;
// }

// export function buildWorkspaceStateBlock(): string {
//     if (_state.files.size === 0) return "";

//     const parts = ["<WorkspaceState>"];
//     for (const file of _state.files.values()) {
//         parts.push(
//             `<file path="${file.path}" tokens="${file.tokenEstimate}">`,
//             file.content,
//             `</file>`,
//         );
//     }
//     parts.push("</WorkspaceState>");

//     const block = parts.join("\n");
//     console.log(
//         `[WorkspaceState] Block: ${_state.files.size} files, ` +
//         `~${estimateTokens(block)} tokens`
//     );
//     return block;
// }

// export function resetWorkspaceState(): void {
//     _state = { files: new Map(), tokenBudget: WORKSPACE_STATE_BUDGET, usedTokens: 0 };
// }

// export function getWorkspaceStateTokens(): number {
//     return _state.usedTokens;
// }

// function estimateTokens(text: string): number {
//     return Math.ceil(text.length / 3.5);
// }


// src/app/features/ide/extensions/chat/agent/workspace-state.ts
// Manages the active workspace file state — separate from chat history.
//
// Architecture:
//   Chat history  = what was said (compressed aggressively by token budget)
//   Workspace state = CURRENT content of files being edited (never aged out,
//                     only evicted by LRU when over token budget)
//
// The workspace state is injected into the SYSTEM PROMPT as <WorkspaceState>
// XML block, not into the message array. This means file contents survive
// message history compression entirely.
//
// Lifecycle:
//   Session start    → resetWorkspaceState()
//   read_file tool   → addFileToState()
//   write_file tool  → updateFileInState()
//   delete_file tool → removeFileFromState()
//   @ mention        → addFileToState(path, content, pin=true)
//   Branch switch    → resetWorkspaceState()
//   Session end      → resetWorkspaceState()

import { countTokens } from "@/src/lib/token/token-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveFile = {
    path: string;
    content: string;
    tokenCount: number;
    addedAt: number;
    lastAccessed: number;
    accessCount: number;
    isPinned: boolean;   // pinned = never auto-evicted (@ mentions, active edits)
    isDirty: boolean;   // true if agent has written to this file this session
};

type WorkspaceStateSnapshot = {
    files: Map<string, ActiveFile>;
    tokenBudget: number;
    usedTokens: number;
    sessionId: string;
    createdAt: number;
    evictedPaths: string[];   // paths evicted since last consumeEvictionNotices()
    stats: {
        totalFilesAdded: number;
        totalEvictions: number;
        totalTokensSaved: number;  // tokens that would have been in chat history
    };
};

// ── Constants ─────────────────────────────────────────────────────────────────

// How much of the context window to reserve for workspace state.
// 40K is safe for 128K models, appropriate for 200K+ models.
// Agent can have ~10 medium files (4K tokens each) open simultaneously.
const DEFAULT_WORKSPACE_BUDGET = 40_000;

// Files larger than this are never added to workspace state —
// too expensive. Agent reads them in chunks via read_file with line ranges.
const MAX_SINGLE_FILE_TOKENS = 8_000;

// Minimum tokens to keep available for conversation history
// even after workspace state fills up.
const MIN_HISTORY_TOKENS = 20_000;

// ── Module state ──────────────────────────────────────────────────────────────

let _state: WorkspaceStateSnapshot = createEmptyState();

function createEmptyState(sessionId?: string): WorkspaceStateSnapshot {
    return {
        files: new Map(),
        tokenBudget: DEFAULT_WORKSPACE_BUDGET,
        usedTokens: 0,
        sessionId: sessionId ?? `session-${Date.now()}`,
        createdAt: Date.now(),
        evictedPaths: [],
        stats: {
            totalFilesAdded: 0,
            totalEvictions: 0,
            totalTokensSaved: 0,
        },
    };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Called at the start of every agent session.
 * Clears all file state from the previous session.
 */
export function resetWorkspaceState(reason: string = "session start"): void {
    const prev = _state;

    console.log(
        `[WorkspaceState] Reset (${reason}). ` +
        `Previous session: ${prev.files.size} files, ` +
        `${prev.usedTokens} tokens, ` +
        `${prev.stats.totalEvictions} evictions, ` +
        `${prev.stats.totalFilesAdded} files added total`
    );

    _state = createEmptyState();
}

/**
 * Called when the user switches git branches.
 * Files on disk have potentially changed — clear state.
 */
export function resetOnBranchSwitch(newBranch: string): void {
    resetWorkspaceState(`branch switch → ${newBranch}`);
}

/**
 * Adjust token budget based on the current model's context window.
 * Called when the model changes.
 */
export function setTokenBudget(contextWindow: number): void {
    // Workspace state gets 20-25% of the context window
    // Small models (32K): 6K workspace budget
    // Medium models (128K): 25K workspace budget
    // Large models (200K+): 40K workspace budget
    const budget = Math.min(
        Math.floor(contextWindow * 0.22),
        DEFAULT_WORKSPACE_BUDGET
    );

    const previousBudget = _state.tokenBudget;
    _state.tokenBudget = budget;

    console.log(
        `[WorkspaceState] Budget updated: ${previousBudget} → ${budget} tokens ` +
        `(context window: ${contextWindow})`
    );

    // If new budget is smaller, evict to fit
    if (budget < _state.usedTokens) {
        console.warn(
            `[WorkspaceState] Budget reduced below current usage ` +
            `(${_state.usedTokens} > ${budget}). Evicting files...`
        );
        evictToFitBudget();
    }
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Add a file to the active workspace state.
 * Called after read_file, create_file, or @ mention.
 */
export function addFileToState(
    path: string,
    content: string,
    pin: boolean = false,
): void {
    const tokenCount = countTokens(content);

    // Skip files that are too large
    if (tokenCount > MAX_SINGLE_FILE_TOKENS) {
        console.log(
            `[WorkspaceState] Skipping ${path} — too large ` +
            `(${tokenCount} tokens > limit ${MAX_SINGLE_FILE_TOKENS}). ` +
            `Agent will use read_file with line ranges.`
        );
        return;
    }

    // If already in state, update it
    if (_state.files.has(path)) {
        const existing = _state.files.get(path)!;
        const tokenDelta = tokenCount - existing.tokenCount;

        existing.content = content;
        existing.tokenCount = tokenCount;
        existing.lastAccessed = Date.now();
        existing.accessCount++;
        existing.isPinned = pin || existing.isPinned;
        _state.usedTokens += tokenDelta;

        console.log(
            `[WorkspaceState] Updated ${path}: ` +
            `${tokenCount} tokens (delta: ${tokenDelta > 0 ? "+" : ""}${tokenDelta})`
        );

        // Re-evict if update pushed us over budget
        if (_state.usedTokens > _state.tokenBudget) {
            evictToFitBudget();
        }
        return;
    }

    // Evict until there's room for the new file
    while (
        _state.usedTokens + tokenCount > _state.tokenBudget &&
        _state.files.size > 0
    ) {
        const evicted = evictOneLRUFile();
        if (!evicted) {
            console.warn(
                `[WorkspaceState] Cannot evict further — all files pinned. ` +
                `Skipping ${path} (${tokenCount} tokens)`
            );
            return;
        }
    }

    // Add the file
    _state.files.set(path, {
        path,
        content,
        tokenCount,
        addedAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        isPinned: pin,
        isDirty: false,
    });

    _state.usedTokens += tokenCount;
    _state.stats.totalFilesAdded++;

    console.log(
        `[WorkspaceState] Added ${path}: ${tokenCount} tokens ` +
        `| Total: ${_state.usedTokens}/${_state.tokenBudget} tokens ` +
        `| Files: ${_state.files.size} ` +
        `| Pinned: ${pin}`
    );
}

/**
 * Update file content after write_file succeeds.
 * Keeps workspace state in sync with what's actually on disk.
 */
export function updateFileInState(path: string, newContent: string): void {
    const existing = _state.files.get(path);
    const isPinned = existing?.isPinned ?? false;

    // Mark as dirty (agent has written to this file)
    addFileToState(path, newContent, isPinned);

    const file = _state.files.get(path);
    if (file) {
        file.isDirty = true;
        console.log(`[WorkspaceState] Marked ${path} as dirty (written by agent)`);
    }
}

/**
 * Remove a file from workspace state.
 * Called after delete_file, or when user closes a tab.
 */
export function removeFileFromState(path: string): void {
    const file = _state.files.get(path);
    if (!file) return;

    _state.usedTokens -= file.tokenCount;
    _state.files.delete(path);

    console.log(
        `[WorkspaceState] Removed ${path} ` +
        `| Freed ${file.tokenCount} tokens ` +
        `| Remaining: ${_state.usedTokens}/${_state.tokenBudget} tokens`
    );
}

/**
 * Pin a file so it's never auto-evicted.
 * Called when user @mentions a file or agent marks it as actively editing.
 */
export function pinFile(path: string): void {
    const file = _state.files.get(path);
    if (file) {
        file.isPinned = true;
        console.log(`[WorkspaceState] Pinned ${path}`);
    }
}

export function unpinFile(path: string): void {
    const file = _state.files.get(path);
    if (file) {
        file.isPinned = false;
        console.log(`[WorkspaceState] Unpinned ${path}`);
    }
}

/**
 * Mark a file as accessed (bump LRU timestamp).
 * Called when agent reads or references a file that's already in state.
 */
export function touchFile(path: string): void {
    const file = _state.files.get(path);
    if (file) {
        file.lastAccessed = Date.now();
        file.accessCount++;
    }
}

// ── Eviction ──────────────────────────────────────────────────────────────────

function evictOneLRUFile(): string | null {
    // Priority for eviction:
    // 1. Non-pinned, not dirty, least recently accessed
    // 2. Non-pinned, dirty but not accessed recently
    // Never evict: pinned files

    let candidate: ActiveFile | null = null;

    for (const file of _state.files.values()) {
        if (file.isPinned) continue;

        if (!candidate) {
            candidate = file;
            continue;
        }

        // Prefer evicting non-dirty files first
        if (!file.isDirty && candidate.isDirty) {
            candidate = file;
            continue;
        }

        // Among files of same dirty status, evict least recently accessed
        if (
            file.isDirty === candidate.isDirty &&
            file.lastAccessed < candidate.lastAccessed
        ) {
            candidate = file;
        }
    }

    if (!candidate) return null;

    const path = candidate.path;
    _state.evictedPaths.push(path);
    _state.stats.totalEvictions++;
    _state.stats.totalTokensSaved += candidate.tokenCount;

    removeFileFromState(path);

    console.warn(
        `[WorkspaceState] EVICTED ${path} ` +
        `(${candidate.tokenCount} tokens freed, ` +
        `dirty: ${candidate.isDirty}, ` +
        `last accessed: ${Math.round((Date.now() - candidate.lastAccessed) / 1000)}s ago)`
    );

    return path;
}

function evictToFitBudget(): void {
    let evictions = 0;
    while (_state.usedTokens > _state.tokenBudget) {
        const evicted = evictOneLRUFile();
        if (!evicted) break;
        evictions++;
    }
    if (evictions > 0) {
        console.warn(
            `[WorkspaceState] Evicted ${evictions} files to fit budget. ` +
            `Current: ${_state.usedTokens}/${_state.tokenBudget} tokens`
        );
    }
}

// ── Eviction notices ──────────────────────────────────────────────────────────

/**
 * Returns a warning message about files that were evicted since the last call.
 * Clears the eviction queue after returning.
 * Inject this into the system prompt so the agent knows it lost file access.
 */
export function consumeEvictionNotices(): string {
    if (_state.evictedPaths.length === 0) return "";

    const paths = [..._state.evictedPaths];
    _state.evictedPaths = [];   // clear queue

    const notice =
        `[WORKSPACE]: The following files were removed from active context ` +
        `due to token limits: ${paths.join(", ")}. ` +
        `Call read_file to reload any you need before editing them.`;

    console.warn(
        `[WorkspaceState] Emitting eviction notice for: ${paths.join(", ")}`
    );

    return notice;
}

// ── System prompt block ───────────────────────────────────────────────────────

/**
 * Builds the <WorkspaceState> XML block for injection into the system prompt.
 * Returns empty string if no files are in state.
 */
export function buildWorkspaceStateBlock(): string {
    if (_state.files.size === 0) return "";

    const parts: string[] = ["<WorkspaceState>"];

    // Sort: pinned first, then by access recency
    const sorted = [..._state.files.values()].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.lastAccessed - a.lastAccessed;
    });

    for (const file of sorted) {
        const attrs = [
            `path="${file.path}"`,
            `tokens="${file.tokenCount}"`,
            file.isPinned ? `pinned="true"` : "",
            file.isDirty ? `modified="true"` : "",
        ].filter(Boolean).join(" ");

        parts.push(`<file ${attrs}>`);
        parts.push(file.content);
        parts.push(`</file>`);
    }

    parts.push("</WorkspaceState>");

    const block = parts.join("\n");
    const blockTokens = countTokens(block);

    console.log(
        `[WorkspaceState] Built state block: ` +
        `${_state.files.size} files, ` +
        `${blockTokens} tokens ` +
        `(${sorted.filter(f => f.isPinned).length} pinned, ` +
        `${sorted.filter(f => f.isDirty).length} dirty)`
    );

    return block;
}

// ── Introspection ─────────────────────────────────────────────────────────────

export function getWorkspaceStateInfo(): {
    fileCount: number;
    usedTokens: number;
    budgetTokens: number;
    utilizationPct: number;
    files: Array<{
        path: string;
        tokenCount: number;
        isPinned: boolean;
        isDirty: boolean;
        accessCount: number;
        lastAccessedMs: number;
    }>;
    stats: WorkspaceStateSnapshot["stats"];
} {
    const files = [..._state.files.values()].map(f => ({
        path: f.path,
        tokenCount: f.tokenCount,
        isPinned: f.isPinned,
        isDirty: f.isDirty,
        accessCount: f.accessCount,
        lastAccessedMs: f.lastAccessed,
    }));

    return {
        fileCount: _state.files.size,
        usedTokens: _state.usedTokens,
        budgetTokens: _state.tokenBudget,
        // utilizationPct: Math.round((_state.usedTokens / _state.tokenBudget) * 100),
        utilizationPct: Math.min(100, Math.round((_state.usedTokens / _state.tokenBudget) * 100)),
        files,
        stats: { ..._state.stats },
    };
}

export function getWorkspaceStateTokens(): number {
    return _state.usedTokens;
}

export function hasFile(path: string): boolean {
    return _state.files.has(path);
}

export function getFileContent(path: string): string | null {
    const file = _state.files.get(path);
    if (file) {
        touchFile(path);
        return file.content;
    }
    return null;
}

export function getDirtyFiles(): string[] {
    return [..._state.files.values()]
        .filter(f => f.isDirty)
        .map(f => f.path);
}