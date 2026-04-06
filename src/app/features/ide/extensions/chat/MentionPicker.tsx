// src/app/features/ide/extensions/chat/components/MentionPicker.tsx
// Dropdown that appears below the @ trigger in the textarea.
// Shows fuzzy-matched files with keyboard + click selection.

'use client';

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { FileIcon } from "@react-symbols/icons/utils";
import type { MentionState, MentionItem } from "./hooks/use-mention-picker";

const C = {
    bg: "#2b2d30",
    bg2: "#313438",
    border: "#3c3f41",
    text: "#bcbec4",
    muted: "#8a8d94",
    faint: "#6f737a",
    green: "#59a869",
};

interface MentionPickerProps {
    state: MentionState;
    onSelect: (item: MentionItem) => void;
    onClose: () => void;
}

export const MentionPicker: React.FC<MentionPickerProps> = ({
    state,
    onSelect,
    onClose,
}) => {
    const listRef = useRef<HTMLDivElement>(null);

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.children[state.index] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [state.index]);

    if (!state.open || state.items.length === 0) return null;

    return (
        <div
            className="absolute bottom-full mx-0.5 left-0 right-0 mb-2 z-50 rounded-lg overflow-hidden shadow-xl"
            style={{
                backgroundColor: C.bg,
                border: `1px solid ${C.border}`,
                maxHeight: "280px",
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-1.5"
                style={{
                    backgroundColor: C.bg2,
                    borderBottom: `1px solid ${C.border}`,
                }}
            >
                <span className="text-[10px] font-medium tracking-[.07em]"
                    style={{ color: C.faint }}>
                    Files
                </span>
                <span className="text-[10px]" style={{ color: C.faint }}>
                    {state.query && `"${state.query}"`}
                </span>
            </div>

            {/* File list */}
            <div
                ref={listRef}
                className="overflow-y-auto"
                style={{ maxHeight: "240px" }}
            >
                {state.items.map((item, i) => {
                    const isSelected = i === state.index;
                    // Highlight matching chars in filename
                    const highlighted = highlightMatch(item.fileName, state.query);

                    return (
                        <button
                            key={item.relativePath}
                            type="button"
                            onClick={() => onSelect(item)}
                            onMouseEnter={() => { }}
                            className="w-full flex items-center gap-1 px-3 py-2 text-left transition-colors"
                            style={{
                                backgroundColor: isSelected ? C.bg2 : "transparent",
                                // borderLeft: isSelected
                                //     ? `2px solid ${C.green}`
                                //     : "2px solid transparent",
                            }}
                        >
                            {/* File icon */}
                            <FileIcon
                                fileName={item.fileName}
                                autoAssign
                                className="size-4 shrink-0"
                            />

                            {/* Name + path */}
                            <div className="flex items-baseline justify-between flex-1 min-w-0 gap-3">
                                <span
                                    // Bumbed to 13px for better readability
                                    className="text-xs font-medium truncate shrink-0"
                                    style={{ color: C.text }}
                                    dangerouslySetInnerHTML={{ __html: highlighted }}
                                />
                                <span
                                    // Pushed to the right, truncates if the path is way too long
                                    className="text-[11px] truncate shrink text-right"
                                    style={{ color: C.faint }}
                                >
                                    {item.relativePath}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// ── Highlight matching characters ─────────────────────────────────────────────

function highlightMatch(text: string, query: string): string {
    if (!query) return escapeHtml(text);

    const q = query.toLowerCase();
    const result: string[] = [];
    let qi = 0;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (qi < q.length && ch.toLowerCase() === q[qi]) {
            result.push(
                `<span style="color:#59a869;font-weight:600">${escapeHtml(ch)}</span>`
            );
            qi++;
        } else {
            result.push(escapeHtml(ch));
        }
    }

    return result.join("");
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}





