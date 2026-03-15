// src/components/chat/PastThreads.tsx
// Thread list — sorted by recency, with delete/duplicate actions on hover.
// Replaces Void's PastThreadsList.

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChatThread } from "./types/types";
import { useChatStore } from "@/src/store/chat-thread-store";
import {
    Trash2, Copy, Check, X,
    MessageSquare, Loader2, AlertCircle, Clock,
} from "lucide-react";

const NUM_INITIAL = 5;

// ── Date formatting ───────────────────────────────────────────────────────────

function formatThreadDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date >= today) {
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    if (date >= yesterday) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Running indicator ─────────────────────────────────────────────────────────

const ThreadStatusDot: React.FC<{ threadId: string }> = ({ threadId }) => {
    const streamState = useChatStore((s) => s.streamState[threadId]);
    if (!streamState) return null;

    if (streamState.status === "awaiting_user") {
        return (
            <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </span>
        );
    }
    if (streamState.status === "streaming" || streamState.status === "tool_running" || streamState.status === "idle") {
        return <Loader2 size={12} className="flex-shrink-0 text-emerald-400 animate-spin" />;
    }
    if (streamState.status === "error") {
        return <AlertCircle size={12} className="flex-shrink-0 text-red-400" />;
    }
    return null;
};

// ── Delete button with confirm step ──────────────────────────────────────────

const DeleteButton: React.FC<{ threadId: string }> = ({ threadId }) => {
    const deleteThread = useChatStore((s) => s.deleteThread);
    const [confirming, setConfirming] = useState(false);

    if (confirming) {
        return (
            <div className="flex items-center gap-0.5">
                <button
                    onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
                    className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    title="Cancel"
                >
                    <X size={10} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); deleteThread(threadId); }}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                    title="Confirm delete"
                >
                    <Check size={10} />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-red-400 transition-colors"
            title="Delete thread"
        >
            <Trash2 size={10} />
        </button>
    );
};

// ── Duplicate button ──────────────────────────────────────────────────────────

const DuplicateButton: React.FC<{ threadId: string }> = ({ threadId }) => {
    const duplicateThread = useChatStore((s) => s.duplicateThread);
    const [copied, setCopied] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        duplicateThread(threadId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return (
        <button
            onClick={handleClick}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-foreground transition-colors"
            title="Duplicate thread"
        >
            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
        </button>
    );
};

// ── Single thread row ─────────────────────────────────────────────────────────

const ThreadRow: React.FC<{
    thread: ChatThread;
    isActive: boolean;
    onClick: () => void;
}> = ({ thread, isActive, onClick }) => {
    const [hovered, setHovered] = useState(false);

    const firstUserMsg = useMemo(() => {
        const msg = thread.messages.find((m) => m.role === "user");
        return msg?.role === "user" ? msg.displayContent : null;
    }, [thread.messages]);

    const msgCount = useMemo(
        () => thread.messages.filter((m) => m.role === "user" || m.role === "assistant").length,
        [thread.messages]
    );

    const title = thread.title || firstUserMsg || "New thread";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onKeyDown={(e) => e.key === "Enter" && onClick()}
            className={cn(
                "group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg",
                "cursor-pointer select-none transition-all duration-150",
                "border border-transparent",
                isActive
                    ? "bg-muted/60 border-border/30 shadow-sm"
                    : "hover:bg-muted/30 hover:border-border/20"
            )}
        >
            {/* Icon */}
            <div className={cn(
                "flex-shrink-0 mt-0.5 w-5 h-5 rounded-md flex items-center justify-center",
                isActive ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground/60"
            )}>
                <MessageSquare size={10} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <ThreadStatusDot threadId={thread.id} />
                    <span className={cn(
                        "text-[12px] font-medium truncate leading-tight",
                        isActive ? "text-foreground" : "text-muted-foreground"
                    )}>
                        {title}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                        {msgCount > 0 ? `${msgCount} msg${msgCount !== 1 ? "s" : ""}` : "Empty"}
                    </span>
                    <span className="text-muted-foreground/30 text-[10px]">·</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                        <Clock size={8} />
                        {formatThreadDate(thread.lastModified)}
                    </span>
                </div>
            </div>

            {/* Actions — visible on hover */}
            <div className={cn(
                "flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150",
                hovered ? "opacity-100" : "opacity-0"
            )}>
                <DuplicateButton threadId={thread.id} />
                <DeleteButton threadId={thread.id} />
            </div>
        </div>
    );
};

// ── PastThreads (main export) ─────────────────────────────────────────────────

export const PastThreads: React.FC<{ className?: string }> = ({ className }) => {
    const threads = useChatStore((s) => s.threads);
    const currentThreadId = useChatStore((s) => s.currentThreadId);
    const switchToThread = useChatStore((s) => s.switchToThread);
    const [showAll, setShowAll] = useState(false);

    const sorted = useMemo(() => {
        return Object.values(threads)
            .filter((t): t is ChatThread => !!t && t.messages.length > 0)
            .sort((a, b) =>
                new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
            );
    }, [threads]);

    const displayed = showAll ? sorted : sorted.slice(0, NUM_INITIAL);
    const hasMore = sorted.length > NUM_INITIAL;

    if (sorted.length === 0) return null;

    return (
        <div className={cn("flex flex-col gap-0.5", className)}>
            {displayed.map((thread) => (
                <ThreadRow
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === currentThreadId}
                    onClick={() => switchToThread(thread.id)}
                />
            ))}

            {hasMore && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className={cn(
                        "w-full mt-1 py-1.5 text-[11px] text-muted-foreground/50",
                        "hover:text-muted-foreground transition-colors rounded-lg",
                        "hover:bg-muted/20"
                    )}
                >
                    {showAll
                        ? "Show less"
                        : `Show ${sorted.length - NUM_INITIAL} more thread${sorted.length - NUM_INITIAL !== 1 ? "s" : ""}`
                    }
                </button>
            )}
        </div>
    );
};