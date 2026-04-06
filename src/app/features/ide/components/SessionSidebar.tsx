// src/app/features/ide/components/SessionSidebar.tsx
// Session history sidebar — thin left panel showing past agent sessions.
// Same bg as chat panel — no contrast fighting.

'use client';

import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { useIDEStore } from "@/src/store/ide-store";

export const C = {
    bg: "#1e1f22",
    bg2: "#2b2d30",
    border: "#3c3f41",
    text: "#bcbec4",
    muted: "#8a8d94",
    faint: "#6f737a",
    green: "#59a869",
    greenBg: "#1e2e22",
    greenBd: "#2e4a34",
    red: "#c75450",
    hover: "#26282e",
} as const;

export const SessionSidebar: React.FC = () => {
    const threads = useChatStore(s => s.threads);
    const openNewThread = useChatStore(s => s.openNewThread);
    const activeThreadId = useChatStore(s => s.currentThreadId);
    const setActiveThread = useChatStore(s => s.switchToThread);
    const streamState = useChatStore(s => s.streamState);

    const threadList = Object.values(threads)
        .filter(Boolean)
        .sort((a, b) =>
            new Date(b!.lastModified ?? 0).getTime() -
            new Date(a!.lastModified ?? 0).getTime()
        );

    // Group by date
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();

    const grouped = threadList.reduce<{
        today: typeof threadList;
        yesterday: typeof threadList;
        older: typeof threadList;
    }>((acc, t) => {
        const d = new Date(t!.createdAt ?? "").toDateString();
        if (d === today) acc.today.push(t);
        else if (d === yesterday) acc.yesterday.push(t);
        else acc.older.push(t);
        return acc;
    }, { today: [], yesterday: [], older: [] });

    return (
        <div
            className="flex flex-col h-full w-full overflow-hidden"
            style={{ backgroundColor: C.bg, borderRight: `1px solid ${C.border}` }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-2 shrink-0"
                style={{ borderBottom: `1px solid ${C.border}` }}
            >
                <span
                    className="text-[10px] font-medium uppercase tracking-[0.07em]"
                    style={{ color: C.faint }}
                >
                    Sessions
                </span>
                <button
                    onClick={openNewThread}
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors"
                    style={{
                        color: C.green,
                        backgroundColor: C.greenBg,
                        border: `1px solid ${C.greenBd}`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                    + New
                </button>
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
                {threadList.length === 0 && (
                    <p
                        className="text-[11px] text-center py-8"
                        style={{ color: C.faint }}
                    >
                        No sessions yet
                    </p>
                )}

                {(["today", "yesterday", "older"] as const).map(group => {
                    const items = grouped[group];
                    if (items.length === 0) return null;
                    const label = group === "today" ? "Today"
                        : group === "yesterday" ? "Yesterday"
                            : "Earlier";

                    return (
                        <div key={group}>
                            <p
                                className="text-[9px] font-medium uppercase tracking-[0.07em] px-2 py-1 mt-1"
                                style={{ color: C.faint }}
                            >
                                {label}
                            </p>
                            {items.map(t => {
                                if (!t) return null;
                                const isActive = t.id === activeThreadId;
                                const ss = streamState[t.id];
                                const isRunning = !!ss && ss.status !== "error";
                                const isFailed = ss?.status === "error";
                                const msgCount = t.messages.length;

                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setActiveThread(t.id)}
                                        className="w-full text-left rounded px-2 py-1.5 mb-0.5 transition-colors"
                                        style={{
                                            backgroundColor: isActive ? C.bg2 : "transparent",
                                            border: isActive
                                                ? `1px solid ${C.border}`
                                                : "1px solid transparent",
                                        }}
                                        onMouseEnter={e => {
                                            if (!isActive)
                                                e.currentTarget.style.backgroundColor = C.hover;
                                        }}
                                        onMouseLeave={e => {
                                            if (!isActive)
                                                e.currentTarget.style.backgroundColor = "transparent";
                                        }}
                                    >
                                        {/* Title row */}
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <div
                                                className="size-[6px] rounded-full shrink-0"
                                                style={{
                                                    backgroundColor: isRunning ? C.green
                                                        : isFailed ? C.red
                                                            : msgCount > 0 ? C.green
                                                                : C.faint,
                                                    animation: isRunning ? "pulse 2s infinite" : "none",
                                                }}
                                            />
                                            <span
                                                className="text-[11px] truncate font-medium"
                                                style={{
                                                    color: isActive ? C.text : C.muted,
                                                    maxWidth: "130px",
                                                }}
                                            >
                                                {t.title || "Untitled session"}
                                            </span>
                                        </div>

                                        {/* Subtitle */}
                                        <p
                                            className="text-[10px] pl-[14px] truncate"
                                            style={{ color: C.faint }}
                                        >
                                            {isRunning
                                                ? ss.status === "tool_running"
                                                    ? `Running ${(ss as any).toolName ?? "tool"}…`
                                                    : "Thinking…"
                                                : msgCount > 0
                                                    ? `${msgCount} message${msgCount !== 1 ? "s" : ""}`
                                                    : "Empty"
                                            }
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};