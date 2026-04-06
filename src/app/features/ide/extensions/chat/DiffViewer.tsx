// src/app/features/ide/extensions/chat/components/DiffViewer.tsx
// Inline diff viewer rendered inside a ToolCard when write_file is called.
// Shows before/after with per-hunk accept/reject buttons.
// Cursor-style: red for removed, green for added, line numbers on both sides.

'use client';

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { FileDiff, DiffHunk, DiffLine } from "./agent/diff-engine";
import {
    CheckIcon, XIcon, ChevronDownIcon,
    ChevronRightIcon, FileCodeIcon,
    PlusIcon, MinusIcon,
} from "lucide-react";

// ── Line number gutter ────────────────────────────────────────────────────────

const LineGutter: React.FC<{
    oldNum?: number;
    newNum?: number;
}> = ({ oldNum, newNum }) => (
    <div className="flex shrink-0 select-none" style={{ width: "72px" }}>
        <span
            className="text-right pr-2 text-[10px] font-mono"
            style={{ width: "36px", color: "#6e7681" }}
        >
            {oldNum ?? ""}
        </span>
        <span
            className="text-right pr-2 text-[10px] font-mono"
            style={{ width: "36px", color: "#6e7681" }}
        >
            {newNum ?? ""}
        </span>
    </div>
);

// ── Single diff line ──────────────────────────────────────────────────────────

const DiffLineRow: React.FC<{ line: DiffLine }> = ({ line }) => {
    const isAdded = line.type === "added";
    const isRemoved = line.type === "removed";

    return (
        <div
            className="flex items-start group"
            style={{
                backgroundColor: isAdded
                    ? "rgba(63,185,80,0.08)"
                    : isRemoved
                        ? "rgba(255,123,114,0.08)"
                        : "transparent",
                borderLeft: isAdded
                    ? "2px solid #238636"
                    : isRemoved
                        ? "2px solid #da3633"
                        : "2px solid transparent",
            }}
        >
            <LineGutter
                oldNum={line.oldLineNum}
                newNum={line.newLineNum}
            />

            {/* Sign */}
            <span
                className="w-4 shrink-0 text-center text-xs font-mono select-none"
                style={{
                    color: isAdded
                        ? "#3fb950"
                        : isRemoved
                            ? "#ff7b72"
                            : "transparent",
                }}
            >
                {isAdded ? "+" : isRemoved ? "−" : " "}
            </span>

            {/* Content */}
            <span
                className="flex-1 min-w-0 text-xs font-mono px-1 whitespace-pre-wrap break-all"
                style={{
                    color: isAdded
                        ? "#aff5b4"
                        : isRemoved
                            ? "#ffc2c2"
                            : "#e6edf3",
                }}
            >
                {line.content || " "}
            </span>
        </div>
    );
};

// ── Hunk ──────────────────────────────────────────────────────────────────────

const HunkView: React.FC<{
    hunk: DiffHunk;
    onAccept: (hunkId: string) => void;
    onReject: (hunkId: string) => void;
    showButtons: boolean;
}> = ({ hunk, onAccept, onReject, showButtons }) => {

    const isAccepted = hunk.accepted === true;
    const isRejected = hunk.accepted === false;
    const isDecided = hunk.accepted !== null;

    return (
        <div
            className="rounded overflow-hidden mb-2"
            style={{
                border: isAccepted
                    ? "1px solid #238636"
                    : isRejected
                        ? "1px solid #da3633"
                        : "1px solid #30363d",
            }}
        >
            {/* Hunk header */}
            <div
                className="flex items-center justify-between px-2 py-1"
                style={{
                    backgroundColor: isAccepted
                        ? "rgba(35,134,54,0.12)"
                        : isRejected
                            ? "rgba(218,54,51,0.12)"
                            : "#161b22",
                    borderBottom: "1px solid #21262d",
                }}
            >
                <span className="text-[10px] font-mono" style={{ color: "#6e7681" }}>
                    @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                </span>

                {showButtons && !isDecided && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onAccept(hunk.id)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                            style={{
                                backgroundColor: "rgba(35,134,54,0.2)",
                                color: "#3fb950",
                                border: "1px solid rgba(35,134,54,0.4)",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.35)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.2)";
                            }}
                        >
                            <CheckIcon size={10} />
                            Accept
                        </button>
                        <button
                            onClick={() => onReject(hunk.id)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                            style={{
                                backgroundColor: "rgba(218,54,51,0.2)",
                                color: "#ff7b72",
                                border: "1px solid rgba(218,54,51,0.4)",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.35)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.2)";
                            }}
                        >
                            <XIcon size={10} />
                            Reject
                        </button>
                    </div>
                )}

                {isDecided && (
                    <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded"
                        style={{
                            color: isAccepted ? "#3fb950" : "#ff7b72",
                            backgroundColor: isAccepted
                                ? "rgba(35,134,54,0.15)"
                                : "rgba(218,54,51,0.15)",
                        }}
                    >
                        {isAccepted ? "✓ Accepted" : "✕ Rejected"}
                    </span>
                )}
            </div>

            {/* Lines */}
            <div style={{ backgroundColor: "#0d1117" }}>
                {hunk.lines.map((line, i) => (
                    <DiffLineRow key={i} line={line} />
                ))}
            </div>
        </div>
    );
};

// ── Command bar ───────────────────────────────────────────────────────────────

const CommandBar: React.FC<{
    diff: FileDiff;
    onAcceptAll: () => void;
    onRejectAll: () => void;
    onApply: () => void;
    isApplied: boolean;
}> = ({ diff, onAcceptAll, onRejectAll, onApply, isApplied }) => {
    const decided = diff.hunks.filter(h => h.accepted !== null).length;
    const total = diff.hunks.length;
    const allDone = decided === total;
    const { added, removed } = diff.stats;

    return (
        <div
            className="flex items-center gap-2 px-3 py-2 rounded"
            style={{
                backgroundColor: "#161b22",
                border: "1px solid #30363d",
                marginBottom: "8px",
            }}
        >
            {/* Stats */}
            <div className="flex items-center gap-2 text-xs">
                {added > 0 && (
                    <span className="flex items-center gap-0.5 font-mono"
                        style={{ color: "#3fb950" }}>
                        <PlusIcon size={10} />
                        {added}
                    </span>
                )}
                {removed > 0 && (
                    <span className="flex items-center gap-0.5 font-mono"
                        style={{ color: "#ff7b72" }}>
                        <MinusIcon size={10} />
                        {removed}
                    </span>
                )}
                <span style={{ color: "#6e7681" }}>
                    {decided}/{total} hunks reviewed
                </span>
            </div>

            <div className="flex-1" />

            {/* Actions */}
            {!isApplied && (
                <>
                    <button
                        onClick={onRejectAll}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{
                            color: "#ff7b72",
                            backgroundColor: "transparent",
                            border: "1px solid #30363d",
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#da3633"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
                    >
                        Reject all
                    </button>
                    <button
                        onClick={onAcceptAll}
                        className="px-2 py-1 rounded text-xs transition-colors"
                        style={{
                            color: "#3fb950",
                            backgroundColor: "transparent",
                            border: "1px solid #30363d",
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#238636"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
                    >
                        Accept all
                    </button>
                    <button
                        onClick={onApply}
                        className="px-3 py-1 rounded text-xs font-medium transition-colors"
                        style={{
                            color: "#e6edf3",
                            backgroundColor: "#1f6feb",
                            border: "1px solid #388bfd",
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#388bfd"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = "#1f6feb"}
                    >
                        Apply
                    </button>
                </>
            )}

            {isApplied && (
                <span className="text-xs font-medium" style={{ color: "#3fb950" }}>
                    ✓ Applied to disk
                </span>
            )}
        </div>
    );
};

// ── Main DiffViewer ───────────────────────────────────────────────────────────

interface DiffViewerProps {
    diff: FileDiff;
    onApply: (updatedDiff: FileDiff) => Promise<void>;
    showButtons?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
    diff: initialDiff,
    onApply,
    showButtons = true,
}) => {
    const [diff, setDiff] = useState<FileDiff>(initialDiff);
    const [isApplied, setIsApplied] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [applying, setApplying] = useState(false);

    const handleAccept = useCallback((hunkId: string) => {
        setDiff(prev => ({
            ...prev,
            hunks: prev.hunks.map(h =>
                h.id === hunkId ? { ...h, accepted: true } : h
            ),
        }));
    }, []);

    const handleReject = useCallback((hunkId: string) => {
        setDiff(prev => ({
            ...prev,
            hunks: prev.hunks.map(h =>
                h.id === hunkId ? { ...h, accepted: false } : h
            ),
        }));
    }, []);

    const handleAcceptAll = useCallback(() => {
        setDiff(prev => ({
            ...prev,
            hunks: prev.hunks.map(h => ({ ...h, accepted: true })),
        }));
    }, []);

    const handleRejectAll = useCallback(() => {
        setDiff(prev => ({
            ...prev,
            hunks: prev.hunks.map(h => ({ ...h, accepted: false })),
        }));
    }, []);

    const handleApply = useCallback(async () => {
        setApplying(true);
        try {
            // Accept undecided hunks before applying
            const finalDiff: FileDiff = {
                ...diff,
                hunks: diff.hunks.map(h =>
                    h.accepted === null ? { ...h, accepted: true } : h
                ),
            };
            await onApply(finalDiff);
            setDiff(finalDiff);
            setIsApplied(true);
        } finally {
            setApplying(false);
        }
    }, [diff, onApply]);

    // No changes
    if (diff.hunks.length === 0) {
        return (
            <div
                className="flex items-center gap-2 px-3 py-2 rounded text-xs"
                style={{
                    backgroundColor: "#161b22",
                    border: "1px solid #30363d",
                    color: "#6e7681",
                }}
            >
                <FileCodeIcon size={12} />
                No changes in {diff.filePath}
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* File header */}
            <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-t cursor-pointer"
                style={{
                    backgroundColor: "#161b22",
                    border: "1px solid #30363d",
                    borderBottom: collapsed ? "1px solid #30363d" : "none",
                    borderRadius: collapsed ? "6px" : "6px 6px 0 0",
                }}
                onClick={() => setCollapsed(v => !v)}
            >
                {collapsed
                    ? <ChevronRightIcon size={12} style={{ color: "#6e7681" }} />
                    : <ChevronDownIcon size={12} style={{ color: "#6e7681" }} />
                }
                <FileCodeIcon size={12} style={{ color: "#8b949e" }} />
                <span className="text-xs font-mono flex-1" style={{ color: "#e6edf3" }}>
                    {diff.filePath}
                </span>
                <span className="text-[11px]" style={{ color: "#6e7681" }}>
                    {diff.stats.added > 0 && (
                        <span style={{ color: "#3fb950" }}>+{diff.stats.added} </span>
                    )}
                    {diff.stats.removed > 0 && (
                        <span style={{ color: "#ff7b72" }}>−{diff.stats.removed}</span>
                    )}
                </span>
            </div>

            {!collapsed && (
                <div
                    className="rounded-b overflow-hidden"
                    style={{ border: "1px solid #30363d", borderTop: "none" }}
                >
                    {/* Command bar */}
                    {showButtons && (
                        <div className="p-2" style={{ backgroundColor: "#0d1117" }}>
                            <CommandBar
                                diff={diff}
                                onAcceptAll={handleAcceptAll}
                                onRejectAll={handleRejectAll}
                                onApply={handleApply}
                                isApplied={isApplied}
                            />
                        </div>
                    )}

                    {/* Hunks */}
                    <div
                        className="p-2 overflow-x-auto"
                        style={{ backgroundColor: "#0d1117" }}
                    >
                        {diff.hunks.map(hunk => (
                            <HunkView
                                key={hunk.id}
                                hunk={hunk}
                                onAccept={handleAccept}
                                onReject={handleReject}
                                showButtons={showButtons && !isApplied}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};