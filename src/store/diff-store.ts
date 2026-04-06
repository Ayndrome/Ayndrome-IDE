// src/store/diff-store.ts — complete rewrite
// Now drives CodeMirror via StateEffects, not just React state.
// The EditorView is the source of truth for diff state.
// This store holds the FileDiff objects and coordinates
// between the chat panel summary and the editor decoration layer.

import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import type { FileDiff } from "../app/features/ide/extensions/chat/agent/diff-engine";
import { applyPartialDiff } from "../app/features/ide/extensions/chat/agent/diff-engine";
import {
    setDiffEffect,
    acceptHunkEffect,
    rejectHunkEffect,
} from "../app/features/ide/extensions/editor/diff-decoration";
import { useIDEStore } from "./ide-store";
import { useEditorStore } from "./editor-store";

// ── Types ─────────────────────────────────────────────────────────────────────

type PendingDiff = {
    diff: FileDiff;
    appliedAt?: number;    // set when fully applied to disk
};

type DiffStore = {
    // filePath → pending diff
    pendingDiffs: Record<string, PendingDiff>;

    // View registry — one EditorView per open file
    // The CodeEditor registers itself here on mount
    _views: Record<string, EditorView>;

    // Actions
    registerView: (filePath: string, view: EditorView) => void;
    unregisterView: (filePath: string) => void;

    // Called by ChatThreadService when agent writes a file
    setPendingDiff: (diff: FileDiff) => void;

    // Per-hunk decisions (also dispatch to EditorView)
    acceptHunk: (filePath: string, hunkId: string) => void;
    rejectHunk: (filePath: string, hunkId: string) => void;

    // Bulk actions
    acceptAllInFile: (filePath: string) => Promise<void>;
    rejectAllInFile: (filePath: string) => void;
    acceptAll: () => Promise<void>;
    rejectAll: () => void;

    // Apply resolved diff to disk + editor
    _applyToDisk: (filePath: string, diff: FileDiff) => Promise<void>;

    // Navigate to file (opens in editor + file tree)
    navigateToFile: (filePath: string) => void;

    // Derived
    pendingCount: () => number;
    hasPending: () => boolean;
    getSummary: () => Array<{
        filePath: string;
        added: number;
        removed: number;
        hunks: number;
        undecided: number;
    }>;

    _checkAllDecided: (filePath: string) => void;

};

export const useDiffStore = create<DiffStore>((set, get) => ({
    pendingDiffs: {},
    _views: {},

    // ── View registration ─────────────────────────────────────────────────────

    registerView: (filePath, view) => {
        set(s => ({ _views: { ...s._views, [filePath]: view } }));

        // If there's already a pending diff for this file, inject it immediately
        const pending = get().pendingDiffs[filePath];
        if (pending && !pending.appliedAt) {
            view.dispatch({ effects: setDiffEffect.of(pending.diff) });
        }
    },

    unregisterView: (filePath) => {
        set(s => {
            const next = { ...s._views };
            delete next[filePath];
            return { _views: next };
        });
    },

    // ── Set pending diff ──────────────────────────────────────────────────────
    // Called by ChatThreadService after agent writes a file.
    // If the file is open in editor, decorations appear immediately.

    setPendingDiff: (diff) => {
        if (diff.hunks.length === 0) return;

        set(s => ({
            pendingDiffs: {
                ...s.pendingDiffs,
                [diff.filePath]: { diff },
            },
        }));

        // Inject into open editor view
        const view = get()._views[diff.filePath];
        if (view) {
            // First update the doc to the new content
            const currentDoc = view.state.doc.toString();
            if (currentDoc !== diff.newContent) {
                view.dispatch({
                    changes: {
                        from: 0,
                        to: currentDoc.length,
                        insert: diff.newContent,
                    },
                });
            }
            // Then apply diff decorations
            view.dispatch({ effects: setDiffEffect.of(diff) });
        }
    },

    // ── Per-hunk decisions ────────────────────────────────────────────────────

    acceptHunk: (filePath, hunkId) => {
        set(s => {
            const entry = s.pendingDiffs[filePath];
            if (!entry) return s;
            return {
                pendingDiffs: {
                    ...s.pendingDiffs,
                    [filePath]: {
                        ...entry,
                        diff: {
                            ...entry.diff,
                            hunks: entry.diff.hunks.map(h =>
                                h.id === hunkId ? { ...h, accepted: true } : h
                            ),
                        },
                    },
                },
            };
        });

        // Dispatch to editor view
        const view = get()._views[filePath];
        if (view) {
            view.dispatch({ effects: acceptHunkEffect.of(hunkId) });
        }

        // Check if all hunks decided
        get()._checkAllDecided(filePath);
    },

    rejectHunk: (filePath, hunkId) => {
        set(s => {
            const entry = s.pendingDiffs[filePath];
            if (!entry) return s;
            return {
                pendingDiffs: {
                    ...s.pendingDiffs,
                    [filePath]: {
                        ...entry,
                        diff: {
                            ...entry.diff,
                            hunks: entry.diff.hunks.map(h =>
                                h.id === hunkId ? { ...h, accepted: false } : h
                            ),
                        },
                    },
                },
            };
        });

        const view = get()._views[filePath];
        if (view) {
            view.dispatch({ effects: rejectHunkEffect.of(hunkId) });
        }

        get()._checkAllDecided(filePath);
    },

    // ── Bulk actions ──────────────────────────────────────────────────────────

    acceptAllInFile: async (filePath) => {
        const entry = get().pendingDiffs[filePath];
        if (!entry) return;

        const accepted: FileDiff = {
            ...entry.diff,
            hunks: entry.diff.hunks.map(h => ({ ...h, accepted: true })),
        };

        set(s => ({
            pendingDiffs: {
                ...s.pendingDiffs,
                [filePath]: { ...entry, diff: accepted },
            },
        }));

        const view = get()._views[filePath];
        if (view) {
            for (const hunk of accepted.hunks) {
                view.dispatch({ effects: acceptHunkEffect.of(hunk.id) });
            }
        }

        await get()._applyToDisk(filePath, accepted);
    },

    rejectAllInFile: (filePath) => {
        const entry = get().pendingDiffs[filePath];
        if (!entry) return;

        const rejected: FileDiff = {
            ...entry.diff,
            hunks: entry.diff.hunks.map(h => ({ ...h, accepted: false })),
        };

        // Restore old content in editor
        const view = get()._views[filePath];
        if (view) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: entry.diff.oldContent,
                },
                effects: setDiffEffect.of(null),
            });
        }

        // Write old content back to disk
        get()._applyToDisk(filePath, rejected);
    },

    acceptAll: async () => {
        const files = Object.keys(get().pendingDiffs);
        for (const filePath of files) {
            await get().acceptAllInFile(filePath);
        }
    },

    rejectAll: () => {
        const files = Object.keys(get().pendingDiffs);
        for (const filePath of files) {
            get().rejectAllInFile(filePath);
        }
    },

    // ── Apply to disk ─────────────────────────────────────────────────────────

    _applyToDisk: async (filePath, diff) => {
        const workspaceId = useIDEStore.getState().workspaceId;
        if (!workspaceId) return;

        const content = applyPartialDiff(diff);

        try {
            await fetch("/api/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    path: filePath,
                    content,
                    action: "write",
                }),
            });

            // Update editor store so Ctrl+S doesn't re-write old content
            useEditorStore.getState().markSaved(filePath, content);

            // Clear diff decorations from editor
            const view = get()._views[filePath];
            if (view) {
                view.dispatch({ effects: setDiffEffect.of(null) });
            }

            // Remove from pending
            set(s => {
                const next = { ...s.pendingDiffs };
                delete next[filePath];
                return { pendingDiffs: next };
            });

        } catch (err) {
            console.error("[DiffStore] Failed to write to disk:", err);
        }
    },

    // ── Auto-apply when all hunks decided ────────────────────────────────────

    _checkAllDecided: (filePath: string) => {
        const entry = get().pendingDiffs[filePath];
        if (!entry) return;

        const allDecided = entry.diff.hunks.every(h => h.accepted !== null);
        if (allDecided) {
            get()._applyToDisk(filePath, entry.diff);
        }
    },

    // ── Navigate to file ──────────────────────────────────────────────────────
    // Opens file in editor + selects in file tree

    navigateToFile: (filePath) => {
        const editorStore = useEditorStore.getState();
        const tab = editorStore.tabs.find(t => t.relativePath === filePath);

        if (tab) {
            // File already open — just activate it
            editorStore.setActiveFile(filePath);
        } else {
            // Need to open it — fetch content first
            const workspaceId = useIDEStore.getState().workspaceId;
            if (!workspaceId) return;

            const diff = get().pendingDiffs[filePath]?.diff;
            if (diff) {
                // Use the new content from diff
                editorStore.openFile(
                    filePath,
                    useIDEStore.getState().projectId as any,
                    filePath.split("/").pop() ?? filePath,
                    diff.newContent,
                );
            }
        }
    },

    // ── Derived ───────────────────────────────────────────────────────────────

    pendingCount: () => Object.keys(get().pendingDiffs).length,
    hasPending: () => Object.keys(get().pendingDiffs).length > 0,

    getSummary: () => {
        return Object.entries(get().pendingDiffs).map(([filePath, entry]) => ({
            filePath,
            added: entry.diff.stats.added,
            removed: entry.diff.stats.removed,
            hunks: entry.diff.hunks.length,
            undecided: entry.diff.hunks.filter(h => h.accepted === null).length,
        }));
    },
}));