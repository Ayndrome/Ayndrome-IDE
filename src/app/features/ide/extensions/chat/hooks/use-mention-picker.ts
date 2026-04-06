// src/app/features/ide/extensions/chat/hooks/use-mention-picker.ts
// Manages @ mention state — detects @ trigger in textarea,
// runs fuzzy search against workspace files, returns picker state.

import { useState, useCallback, useRef } from "react";
import { useIDEStore } from "@/src/store/ide-store";

export type MentionItem = {
    relativePath: string;
    fileName: string;
    score: number;   // fuzzy match score — higher = better
};

export type MentionState = {
    open: boolean;
    query: string;
    items: MentionItem[];
    index: number;        // keyboard-selected item index
    trigger: number;        // cursor position where @ was typed
};

const CLOSED: MentionState = {
    open: false, query: "", items: [], index: 0, trigger: -1,
};

// ── Fuzzy match ────────────────────────────────────────────────────────────────
// Simple character-subsequence scoring — fast, no deps needed.

function fuzzyScore(query: string, target: string): number {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0;
    let score = 0;
    let consecutive = 0;

    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) {
            qi++;
            consecutive++;
            score += consecutive;   // reward consecutive matches
            // Reward matches at word boundaries
            if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === ".") {
                score += 4;
            }
        } else {
            consecutive = 0;
        }
    }

    return qi === q.length ? score : 0;   // 0 = no match
}

function fuzzySearch(query: string, files: string[]): MentionItem[] {
    const results: MentionItem[] = [];

    for (const relativePath of files) {
        const fileName = relativePath.split("/").pop() ?? relativePath;

        // Score against both full path and filename
        const pathScore = fuzzyScore(query, relativePath);
        const nameScore = fuzzyScore(query, fileName) * 1.5;   // filename matches rank higher
        const score = Math.max(pathScore, nameScore);

        if (score > 0) {
            results.push({ relativePath, fileName, score });
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);   // max 12 results
}

// ── Fetch file list from workspace ────────────────────────────────────────────

async function fetchWorkspaceFiles(workspaceId: string): Promise<string[]> {
    try {
        const params = new URLSearchParams({ workspaceId, path: "/", type: "dir" });
        // Use the getAllFiles endpoint via /api/files
        const res = await fetch(`/api/files?${params}`);
        if (!res.ok) return [];
        const data = await res.json();

        // Recursively collect all files
        const collect = async (entries: any[], prefix: string): Promise<string[]> => {
            const paths: string[] = [];
            for (const e of entries) {
                const fullPath = prefix ? `${prefix}/${e.name}` : e.name;
                if (e.type === "folder" && !["node_modules", ".git", ".next", "dist"].includes(e.name)) {
                    try {
                        const r2 = await fetch(`/api/files?${new URLSearchParams({ workspaceId, path: fullPath, type: "dir" })}`);
                        if (r2.ok) {
                            const d2 = await r2.json();
                            paths.push(...await collect(d2.entries ?? [], fullPath));
                        }
                    } catch { }
                } else if (e.type === "file") {
                    paths.push(fullPath);
                }
            }
            return paths;
        };

        return collect(data.entries ?? [], "");
    } catch {
        return [];
    }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMentionPicker() {
    const [state, setState] = useState<MentionState>(CLOSED);
    const allFilesRef = useRef<string[]>([]);
    const loadedRef = useRef(false);
    const { workspaceId } = useIDEStore();

    // Lazy-load file list once
    const ensureFilesLoaded = useCallback(async () => {
        if (loadedRef.current || !workspaceId) return;
        loadedRef.current = true;
        allFilesRef.current = await fetchWorkspaceFiles(workspaceId as string);
    }, [workspaceId]);

    // Called on every textarea change
    const onTextChange = useCallback(async (
        text: string,
        cursorPosition: number,
    ) => {
        // Find the last @ before cursor
        const beforeCursor = text.slice(0, cursorPosition);
        const atIdx = beforeCursor.lastIndexOf("@");

        if (atIdx === -1) {
            setState(CLOSED);
            return;
        }

        // Text between @ and cursor
        const query = beforeCursor.slice(atIdx + 1);

        // If query contains a space, @ mention is done
        if (query.includes(" ") || query.includes("\n")) {
            setState(CLOSED);
            return;
        }

        await ensureFilesLoaded();

        const items = fuzzySearch(query, allFilesRef.current);

        setState({
            open: true,
            query,
            items,
            index: 0,
            trigger: atIdx,
        });
    }, [ensureFilesLoaded]);

    // Keyboard navigation
    const onKeyDown = useCallback((
        e: React.KeyboardEvent,
        onSelect: (item: MentionItem) => void,
    ) => {
        if (!state.open) return false;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setState(s => ({ ...s, index: Math.min(s.index + 1, s.items.length - 1) }));
            return true;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setState(s => ({ ...s, index: Math.max(s.index - 1, 0) }));
            return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
            const item = state.items[state.index];
            if (item) {
                e.preventDefault();
                onSelect(item);
                return true;
            }
        }
        if (e.key === "Escape") {
            setState(CLOSED);
            return true;
        }
        return false;
    }, [state]);

    const close = useCallback(() => setState(CLOSED), []);

    return { state, onTextChange, onKeyDown, close };
}