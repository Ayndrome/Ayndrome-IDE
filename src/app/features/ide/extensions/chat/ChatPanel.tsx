// src/components/chat/ChatPanel.tsx
// Top-level layout: landing page vs thread page, thread switcher header,
// message list, and input. Wires everything together.

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    useMemo,
} from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { useStreamStatus, useCurrentThread, useScrollToBottom } from "./chat-hook";
import { ChatInput } from "./ChatInput";
import { PastThreads } from "./PastThreads";
import { StatusRing, StatusLabel } from "./StatusRing";
import { Plus, ChevronLeft, Sparkles } from "lucide-react";
import { ChangedFilesBar } from "./ChangedFilesBar";
import Image from "next/image";
// Forward-declare — Part 2 will fill these in
// (importing here so the wiring is complete)
import { ChatMessages } from "./ChatMessages";

// ── Status bar ────────────────────────────────────────────────────────────────
// Thin bar above the input showing what the agent is currently doing.

const AgentStatusBar: React.FC<{ threadId: string }> = ({ threadId }) => {
    const status = useStreamStatus(threadId);

    if (status.kind === "idle" || status.kind === "error") return null;

    const ringStatus =
        status.kind === "thinking" ? "thinking" :
            status.kind === "streaming" ? "streaming" :
                status.kind === "tool" ? "tool" :
                    status.kind === "awaiting" ? "awaiting" : "idle";

    const toolName = status.kind === "tool" ? status.toolName : undefined;

    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-1.5",
            "border-t border-border/30",
            "bg-card/30 backdrop-blur-sm",
            "transition-all duration-300 animate-in slide-in-from-bottom-1"
        )}>
            <StatusRing status={ringStatus} size={16} />
            <StatusLabel status={ringStatus} toolName={toolName} />

            {/* Awaiting-user: show approve/reject inline */}
            {status.kind === "awaiting" && (
                <ApproveRejectInline threadId={threadId} />
            )}
        </div>
    );
};

// ── Approve / Reject inline buttons ──────────────────────────────────────────

const ApproveRejectInline: React.FC<{ threadId: string }> = ({ threadId }) => {
    const approve = useChatStore((s) => s.approveLatestToolRequest);
    const reject = useChatStore((s) => s.rejectLatestToolRequest);

    return (
        <div className="ml-auto flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => reject(threadId)}
                className={cn(
                    "px-2 py-0.5 rounded-md text-[11px] font-medium",
                    "border border-border/40 text-muted-foreground",
                    "hover:border-red-400/40 hover:text-red-400 hover:bg-red-400/5",
                    "transition-all duration-150"
                )}
            >
                Reject
            </button>
            <button
                type="button"
                onClick={() => approve(threadId)}
                className={cn(
                    "px-2 py-0.5 rounded-md text-[11px] font-medium",
                    "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400",
                    "hover:bg-emerald-500/20 hover:border-emerald-400/50",
                    "transition-all duration-150"
                )}
            >
                Approve
            </button>
        </div>
    );
};

// ── Error banner ──────────────────────────────────────────────────────────────

const ErrorBanner: React.FC<{ threadId: string }> = ({ threadId }) => {
    const streamState = useChatStore((s) => s.streamState[threadId]);
    const dismiss = useChatStore((s) => s.dismissStreamError);
    const [expanded, setExpanded] = useState(false);

    if (streamState?.status !== "error") return null;

    return (
        <div className={cn(
            "mx-3 mb-2 rounded-lg border border-red-500/20 bg-red-500/5",
            "text-[12px] overflow-hidden transition-all duration-200"
        )}>
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-red-400 font-medium flex-1 truncate">
                    {streamState.message}
                </span>
                {streamState.fullError && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-red-400/60 hover:text-red-400 text-[10px] font-mono transition-colors"
                    >
                        {expanded ? "less" : "details"}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => dismiss(threadId)}
                    className="text-red-400/60 hover:text-red-400 transition-colors ml-1"
                >
                    <X size={12} />
                </button>
            </div>
            {expanded && streamState.fullError && (
                <div className="px-3 pb-2 border-t border-red-500/10">
                    <pre className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap overflow-auto max-h-32 mt-1.5">
                        {streamState.fullError.stack ?? streamState.fullError.message}
                    </pre>
                </div>
            )}
        </div>
    );
};

// Import X here since we use it above
import { X } from "lucide-react";

// ── Thread header ─────────────────────────────────────────────────────────────

const ThreadHeader: React.FC<{
    threadId: string;
    title: string;
    onNewThread: () => void;
    onBack?: () => void;
}> = ({ threadId, title, onNewThread, onBack }) => {
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-2.5",
            "border-b border-border/30",
            "bg-card/40 backdrop-blur-sm",
            "flex-shrink-0"
        )}>
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={14} />
                </button>
            )}

            <span className="flex-1 text-[12px] font-medium text-foreground truncate">
                {title}
            </span>

            <button
                type="button"
                onClick={onNewThread}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md",
                    "text-[11px] text-muted-foreground/60 hover:text-foreground",
                    "hover:bg-muted/50 transition-all duration-150",
                    "border border-transparent hover:border-border/30"
                )}
                title="New thread"
            >
                <Plus size={12} />
                <span>New</span>
            </button>
        </div>
    );
};

// ── Landing page ──────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
    "Summarize this codebase",
    "Find all TODO comments",
    "Explain how authentication works",
    "Write tests for the current file",
];

const LandingPage: React.FC<{
    onSubmit: (text: string) => void;
    threadId: string;
    isStreaming: boolean;
    onAbort: () => void;
}> = ({ onSubmit, threadId, isStreaming, onAbort }) => {
    const threads = useChatStore((s) => s.threads);
    const hasHistory = useMemo(
        () => Object.values(threads).some((t) => t && t.messages.length > 0),
        [threads]
    );

    return (
        <div className="relative flex flex-col items-center justify-center flex-1 px-4 pb-4 pt-8 text-center overflow-hidden">

    {/* 🌌 Background gradient */}
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1e1f22] to-[#141414]" />

    {/* 🌀 Curved dashed paths */}
    <svg
  className="absolute inset-0 w-full h-full opacity-70 blur-[0.2px]"
  viewBox="0 0 1200 800"
  preserveAspectRatio="xMidYMid meet"
  fill="none"
>
  <defs>
    {/* Gradient for fading effect */}
    <linearGradient id="fadeCurve" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="40%" stopColor="#ffffff" stopOpacity="0.35" />
      <stop offset="60%" stopColor="#ffffff" stopOpacity="0.35" />
      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
  </defs>

  {/* Top arc */}
  <path
    d="M -200 -150 C 200 50, 100 150, 1400 150"
    stroke="url(#fadeCurve)"
    strokeWidth="1"
    strokeDasharray="20 20"
  />

  {/* Middle arc */}
  <path
    d="M -200 300 C 200 250, 1000 250, 1400 350"
    stroke="url(#fadeCurve)"
    strokeWidth="1"
    strokeDasharray="20 20"
  />

  {/* Bottom arc */}
  <path
    d="M -200 1550 C 200 450, 1000 450, 1400 550"
    stroke="url(#fadeCurve)"
    strokeWidth="1"
    strokeDasharray="20 20"
  />
</svg>

    {/* ✨ Glow behind logo */}
    <div className="absolute w-40 h-40 bg-[#58a6ff]/10 blur-3xl rounded-full" />

    {/* 🧠 Logo */}
   <div className="relative z-10 flex flex-col items-center">
    <div className="w-10 h-10 mb-4 flex items-center justify-center">
        <Image 
            src="/logoipsum-280.svg"
            alt="Logo"
            width={48}
            height={48}
            className="opacity-90 z-100"
        />
    </div>

    {/* Subtitle with Curtain Effect */}
    <p className="text-[12px] text-[#8b949e] leading-relaxed min-w-0 whitespace-nowrap overflow-hidden">
        Kick off a new project. Make changes across your entire codebase.
    </p>
</div>


            {/* Input */}
            <div className="px-3 pb-3">
                <ChangedFilesBar />
                <ChatInput
                    threadId={threadId}
                    isStreaming={isStreaming}
                    onSubmit={onSubmit}
                    onAbort={onAbort}
                />
            </div>

            {/* Past threads */}
            {hasHistory && (
                <div className="border-t border-border/20 px-3 py-3 overflow-y-auto max-h-[240px]">
                    <p className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-2 px-1">
                        Recent
                    </p>
                    <PastThreads />
                </div>
            )}
        </div>
    );
};

// ── ChatPanel (main export) ───────────────────────────────────────────────────

export const ChatPanel: React.FC<{ className?: string }> = ({ className }) => {
    const { thread, threadId } = useCurrentThread();
    const openNewThread = useChatStore((s) => s.openNewThread);
    const addUserMessage = useChatStore((s) => s.addUserMessageAndStreamResponse);
    const abortRunning = useChatStore((s) => s.abortRunning);
    const streamState = useChatStore((s) => s.streamState[threadId]);
    const isLoaded = useChatStore((s) => s.isLoaded);

    const isStreaming = !!streamState && streamState.status !== "error";
    const hasMessages = (thread?.messages.length ?? 0) > 0;

    const handleSubmit = useCallback(async (text: string) => {
        await addUserMessage({ userMessage: text, threadId });
    }, [addUserMessage, threadId]);

    const handleAbort = useCallback(async () => {
        await abortRunning(threadId);
    }, [abortRunning, threadId]);

    // Loading skeleton
    if (!isLoaded) {
        return (
            <div className={cn("flex flex-col h-full items-center justify-center", className)}>
                <StatusRing status="thinking" size={24} />
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col h-full w-full overflow-hidden min-w-0",
            "bg-[#181818] text-foreground",
            className
        )}>
            {hasMessages ? (
                <>
                    {/* Header */}
                    <ThreadHeader
                        threadId={threadId}
                        title={thread?.title ?? "Thread"}
                        onNewThread={openNewThread}
                    />

                    {/* Messages — fills remaining space */}
                    <div className="flex-1 overflow-hidden min-w-0">
                        <ChatMessages threadId={threadId} />
                    </div>

                    {/* Error banner */}
                    <ErrorBanner threadId={threadId} />

                    {/* Agent status bar */}
                    <AgentStatusBar threadId={threadId} />

                    {/* Input */}
                    <div className="flex-shrink-0 px-3 pb-3 pt-2 min-w-0">
                        <ChatInput
                            threadId={threadId}
                            isStreaming={isStreaming}
                            onSubmit={handleSubmit}
                            onAbort={handleAbort}
                        />
                    </div>
                </>
            ) : (
                <LandingPage
                    onSubmit={handleSubmit}
                    threadId={threadId}
                    isStreaming={isStreaming}
                    onAbort={handleAbort}
                />
            )}
        </div>
    );
};