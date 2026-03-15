// src/components/chat/ChatBubble.tsx
// Role dispatcher — routes each ChatMessage to the correct component.
// Also handles checkpoint rendering and interrupted tools.

import React from "react";
import { cn } from "@/lib/utils";
import { ChatMessage, WebToolName, isCheckpoint, isToolMessage } from "./types/types";
import { UserBubble } from "./UserBubble";
import { AssistantBubble } from "./AssistantBubble";
import { ToolCard, ToolCardProps } from "./ToolCard";
import { useChatStore } from "@/src/store/chat-thread-store";
import { RotateCcw } from "lucide-react";

// ── Map ChatMessage tool type → ToolCard toolState ─────────────────────────

function resolveToolState(msg: ChatMessage & { role: "tool" }): ToolCardProps["toolState"] {
    switch (msg.type) {
        case "tool_request": return "pending";
        case "running_now": return "running";
        case "success": return "success";
        case "tool_error": return "error";
        case "rejected": return "rejected";
        case "invalid_params": return "invalid";
        default: return "rejected";
    }
}

// ── Checkpoint marker ─────────────────────────────────────────────────────────

const CheckpointMarker: React.FC<{
    threadId: string;
    messageIdx: number;
    isGhosted: boolean;
}> = ({ threadId, messageIdx, isGhosted }) => {
    const jumpToCheckpoint = useChatStore((s) => s.jumpToCheckpointBeforeMessageIdx);
    const streamState = useChatStore((s) => s.streamState[threadId]);
    const isRunning = !!streamState;

    return (
        <div className={cn(
            "flex items-center justify-center gap-3 py-1",
            isGhosted && "opacity-30"
        )}>
            <div className="flex-1 h-px bg-border/20" />
            <button
                type="button"
                disabled={isRunning}
                onClick={() => {
                    if (isRunning) return;
                    jumpToCheckpoint({ threadId, messageIdx, includeUserModifications: false });
                }}
                className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full",
                    "text-[10px] font-mono text-muted-foreground/35",
                    "border border-border/20",
                    "transition-all duration-150",
                    isRunning
                        ? "cursor-default"
                        : "hover:text-muted-foreground/60 hover:border-border/40 hover:bg-muted/20 cursor-pointer"
                )}
                title={isRunning ? "Disabled while running" : "Jump to this checkpoint"}
            >
                <RotateCcw size={8} />
                checkpoint
            </button>
            <div className="flex-1 h-px bg-border/20" />
        </div>
    );
};

// ── ChatBubble (main export) ──────────────────────────────────────────────────

interface ChatBubbleProps {
    message: ChatMessage;
    messageIdx: number;
    threadId: string;
    isStreaming: boolean;   // only true for the live assistant message
    currCheckpointIdx: number | null;
    isLast: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
    message,
    messageIdx,
    threadId,
    isStreaming,
    currCheckpointIdx,
    isLast,
}) => {
    // A message is "ghosted" when user jumped back in history
    // and this message is after the current checkpoint
    const isGhosted =
        currCheckpointIdx !== null &&
        messageIdx > currCheckpointIdx &&
        !isStreaming;

    // ── Checkpoint ──────────────────────────────────────────────────────────
    if (isCheckpoint(message)) {
        return (
            <CheckpointMarker
                threadId={threadId}
                messageIdx={messageIdx}
                isGhosted={isGhosted}
            />
        );
    }

    // ── Interrupted tool ────────────────────────────────────────────────────
    if (message.role === "interrupted_tool") {
        return (
            <div className={cn(isGhosted && "opacity-30")}>
                <ToolCard
                    toolName={message.name as WebToolName}
                    toolState="interrupted"
                    rawParams={{}}
                    mcpServerName={message.mcpServerName}
                    isInterrupted
                />
            </div>
        );
    }

    // ── User message ─────────────────────────────────────────────────────────
    if (message.role === "user") {
        return (
            <UserBubble
                message={message}
                messageIdx={messageIdx}
                threadId={threadId}
                isGhosted={isGhosted}
            />
        );
    }

    // ── Assistant message ─────────────────────────────────────────────────────
    if (message.role === "assistant") {
        return (
            <AssistantBubble
                message={message}
                isStreaming={isStreaming && isLast}
                isGhosted={isGhosted}
            />
        );
    }

    // ── Tool message ──────────────────────────────────────────────────────────
    if (isToolMessage(message)) {
        const toolState = resolveToolState(message);
        const rawParams = (message.rawParams as Record<string, any>) ?? {};

        return (
            <div className={cn(isGhosted && "opacity-30 pointer-events-none")}>
                <ToolCard
                    toolName={message.name as WebToolName}
                    toolState={toolState}
                    rawParams={rawParams}
                    result={
                        (message.type === "success" || message.type === "tool_error")
                            ? message.result
                            : undefined
                    }
                    errorMessage={
                        (message.type === "tool_error" || message.type === "invalid_params")
                            ? message.content
                            : undefined
                    }
                    mcpServerName={message.mcpServerName}
                />
            </div>
        );
    }

    return null;
};