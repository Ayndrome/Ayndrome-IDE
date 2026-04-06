// src/app/features/ide/extensions/chat/components/ChangedFilesBar.tsx
// Compact summary in chat panel showing which files the agent changed.
// Clicking a file navigates to it in the editor.
// Has accept-all / reject-all for the entire agent turn.

'use client';

import React from "react";
import { useDiffStore } from "@/src/store/diff-store";
import {
    FileCodeIcon, CheckIcon,
    XIcon, PlusIcon, MinusIcon,
    ChevronRightIcon,
} from "lucide-react";

export const ChangedFilesBar: React.FC = () => {
    const {
        hasPending, getSummary,
        acceptAll, rejectAll,
        navigateToFile,
    } = useDiffStore();

    if (!hasPending()) return null;

    const summary = getSummary();

    return (
        <div
            className="mx-3 mb-2 rounded-lg overflow-hidden"
            style={{
                border: "1px solid #30363d",
                backgroundColor: "#161b22",
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: "1px solid #21262d" }}
            >
                <div className="flex items-center gap-2">
                    <FileCodeIcon size={12} style={{ color: "#58a6ff" }} />
                    <span className="text-xs font-medium" style={{ color: "#e6edf3" }}>
                        {summary.length} file{summary.length !== 1 ? "s" : ""} changed
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={rejectAll}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                        style={{
                            color: "#ff7b72",
                            backgroundColor: "rgba(218,54,51,0.1)",
                            border: "1px solid rgba(218,54,51,0.3)",
                        }}
                    >
                        <XIcon size={10} />
                        Reject all
                    </button>
                    <button
                        onClick={acceptAll}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                        style={{
                            color: "#e6edf3",
                            backgroundColor: "#1f6feb",
                            border: "1px solid #388bfd",
                        }}
                    >
                        <CheckIcon size={10} />
                        Accept all
                    </button>
                </div>
            </div>

            {/* File list */}
            {summary.map(file => (
                <button
                    key={file.filePath}
                    onClick={() => navigateToFile(file.filePath)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                    style={{ borderBottom: "1px solid #21262d" }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = "#1c2128";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}
                >
                    {/* File name */}
                    <FileCodeIcon size={11} style={{ color: "#6e7681" }} className="shrink-0" />
                    <span
                        className="flex-1 min-w-0 text-xs font-mono truncate"
                        style={{ color: "#e6edf3" }}
                    >
                        {file.filePath}
                    </span>

                    {/* Stats */}
                    <div className="flex items-center gap-2 shrink-0">
                        {file.added > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px] font-mono"
                                style={{ color: "#3fb950" }}>
                                <PlusIcon size={9} />
                                {file.added}
                            </span>
                        )}
                        {file.removed > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px] font-mono"
                                style={{ color: "#ff7b72" }}>
                                <MinusIcon size={9} />
                                {file.removed}
                            </span>
                        )}
                        {file.undecided > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                    backgroundColor: "#1f3a5f",
                                    color: "#58a6ff",
                                }}>
                                {file.undecided} pending
                            </span>
                        )}
                    </div>

                    <ChevronRightIcon size={11} style={{ color: "#6e7681" }} />
                </button>
            ))}
        </div>
    );
};