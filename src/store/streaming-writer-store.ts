// src/store/streaming-writer-store.ts
// Coordinates live streaming of agent content into editor views.
// Works alongside diff-store: streaming shows content arriving,
// diff decorations appear after streaming ends.

import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import {
    streamStartEffect,
    streamChunkEffect,
    streamEndEffect,
    streamAbortEffect,
} from "../app/features/ide/extensions/editor/streaming-writer";
import { useDiffStore } from "./diff-store";
import { useEditorStore } from "./editor-store";
import { useIDEStore } from "./ide-store";
import { computeFileDiff } from "../app/features/ide/extensions/chat/agent/diff-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

type StreamSession = {
    filePath: string;
    oldContent: string;
    accumulated: string;
    startedAt: number;
    aborted: boolean;
};

type StreamingWriterStore = {
    // Active streaming sessions keyed by filePath
    sessions: Record<string, StreamSession>;

    // View registry (shared with diff-store pattern)
    _views: Record<string, EditorView>;

    registerView: (filePath: string, view: EditorView) => void;
    unregisterView: (filePath: string) => void;

    // Called by ChatThreadService to start streaming a file
    startStream: (opts: {
        filePath: string;
        oldContent: string;
    }) => void;

    // Called for each chunk from the agent
    writeChunk: (filePath: string, chunk: string) => void;

    // Called when agent finishes writing
    endStream: (filePath: string, autoApprove: boolean) => Promise<void>;

    // Called on abort
    abortStream: (filePath: string) => void;

    isStreaming: (filePath: string) => boolean;
};

export const useStreamingWriterStore = create<StreamingWriterStore>((set, get) => ({
    sessions: {},
    _views: {},

    // ── View registration ─────────────────────────────────────────────────────

    registerView: (filePath, view) => {
        set(s => ({ _views: { ...s._views, [filePath]: view } }));
    },

    unregisterView: (filePath) => {
        set(s => {
            const next = { ...s._views };
            delete next[filePath];
            return { _views: next };
        });
    },

    // ── Start stream ──────────────────────────────────────────────────────────
    // Clears the editor document and prepares for incoming chunks.

    startStream: ({ filePath, oldContent }) => {
        const session: StreamSession = {
            filePath,
            oldContent,
            accumulated: "",
            startedAt: Date.now(),
            aborted: false,
        };

        set(s => ({
            sessions: { ...s.sessions, [filePath]: session },
        }));

        const view = get()._views[filePath];
        if (!view) return;

        // Clear editor to empty so we can stream content in fresh
        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: "",
            },
            effects: streamStartEffect.of({ filePath, oldContent }),
        });
    },

    // ── Write chunk ───────────────────────────────────────────────────────────
    // Appends chunk to editor document at current end position.
    // This is called many times per second during streaming.

    writeChunk: (filePath, chunk) => {
        const session = get().sessions[filePath];
        if (!session || session.aborted) return;

        // Accumulate full content
        session.accumulated += chunk;
        set(s => ({
            sessions: {
                ...s.sessions,
                [filePath]: { ...session, accumulated: session.accumulated },
            },
        }));

        const view = get()._views[filePath];
        if (!view) return;

        // Append chunk at end of document
        const docLen = view.state.doc.length;
        view.dispatch({
            changes: {
                from: docLen,
                to: docLen,
                insert: chunk,
            },
            effects: streamChunkEffect.of(chunk),
            // Scroll to keep up with writing
            scrollIntoView: true,
        });
    },

    // ── End stream ────────────────────────────────────────────────────────────
    // Streaming complete. Now compute diff and hand off to diff-store.

    endStream: async (filePath, autoApprove) => {
        const session = get().sessions[filePath];
        if (!session || session.aborted) return;

        const { oldContent, accumulated: newContent } = session;

        // Remove session
        set(s => {
            const next = { ...s.sessions };
            delete next[filePath];
            return { sessions: next };
        });

        const view = get()._views[filePath];

        if (autoApprove) {
            // Auto-approve: write to disk immediately, clear streaming state
            const workspaceId = useIDEStore.getState().workspaceId;
            if (workspaceId) {
                await fetch("/api/files", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId,
                        path: filePath,
                        content: newContent,
                        action: "write",
                    }),
                });
                useEditorStore.getState().markSaved(filePath, newContent);
            }

            if (view) {
                view.dispatch({
                    effects: streamEndEffect.of({ filePath, newContent, oldContent }),
                });
            }
            return;
        }

        // Manual approve: compute diff, hand to diff-store for review
        const diff = computeFileDiff(filePath, oldContent, newContent);

        if (view) {
            view.dispatch({
                effects: streamEndEffect.of({ filePath, newContent, oldContent }),
            });
        }

        // Diff-store applies decorations (green/red highlights + gutter buttons)
        if (diff.hunks.length > 0) {
            useDiffStore.getState().setPendingDiff(diff);
        } else {
            // No changes — write directly
            const workspaceId = useIDEStore.getState().workspaceId;
            if (workspaceId) {
                await fetch("/api/files", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId,
                        path: filePath,
                        content: newContent,
                        action: "write",
                    }),
                });
                useEditorStore.getState().markSaved(filePath, newContent);
            }
        }
    },

    // ── Abort stream ──────────────────────────────────────────────────────────

    abortStream: (filePath) => {
        const session = get().sessions[filePath];
        if (!session) return;

        set(s => ({
            sessions: {
                ...s.sessions,
                [filePath]: { ...session, aborted: true },
            },
        }));

        const view = get()._views[filePath];
        if (view) {
            // Restore old content on abort
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: session.oldContent,
                },
                effects: streamAbortEffect.of(),
            });
        }

        set(s => {
            const next = { ...s.sessions };
            delete next[filePath];
            return { sessions: next };
        });
    },

    isStreaming: (filePath) => !!get().sessions[filePath],
}));