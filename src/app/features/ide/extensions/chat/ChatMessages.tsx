// src/components/chat/ChatMessages.tsx
// Scrollable message list with:
//   - Auto-scroll to bottom (respects user scroll-up)
//   - Live streaming bubble at the bottom
//   - Empty state while first message is generating
//   - Staggered fade-in on messages

import React, { useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { ChatMessage } from "./types/types";
import { ChatBubble } from "./ChatBubble";
import { useScrollToBottom } from "./chat-hook";
import { PlanBubble } from "./plan-bubble";
import type { AgentPlan } from "./types/plan-types";

// ── Fade-in animation injection ───────────────────────────────────────────────

const FADE_STYLES = `
@keyframes msg-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0);   }
}
.msg-in {
    animation: msg-in 0.22s ease-out both;
}
`;
let fadeInjected = false;
function injectFade() {
    if (fadeInjected || typeof document === "undefined") return;
    const s = document.createElement("style");
    s.textContent = FADE_STYLES;
    document.head.appendChild(s);
    fadeInjected = true;
}

// ── ChatMessages (main export) ────────────────────────────────────────────────

export const ChatMessages: React.FC<{ threadId: string }> = ({ threadId }) => {
    useEffect(() => { injectFade(); }, []);

    const thread = useChatStore((s) => s.threads[threadId]);
    const streamState = useChatStore((s) => s.streamState[threadId]);
    const { ref, onScroll, scrollToBottom } = useScrollToBottom<HTMLDivElement>();

    const messages = thread?.messages ?? [];
    const currCheckpointIdx = thread?.state.currentCheckpointIdx ?? null;

    // Build the live streaming message (not yet committed to thread.messages)
    const liveMessage: (ChatMessage & { role: "assistant" }) | null = useMemo(() => {
        if (!streamState) return null;
        if (streamState.status !== "streaming" && streamState.status !== "idle") return null;

        const partialText =
            streamState.status === "streaming" ? streamState.partialText : "";
        const partialReasoning =
            streamState.status === "streaming" ? streamState.partialReasoning : "";

        // Only show live bubble if there's actually something to show
        if (!partialText && !partialReasoning) return null;

        return {
            role: "assistant",
            displayContent: partialText,
            reasoning: partialReasoning,
            anthropicReasoning: null,
        };
    }, [streamState]);

    // Force scroll when live message grows
    useEffect(() => {
        if (liveMessage) scrollToBottom();
    }, [liveMessage?.displayContent, scrollToBottom]);

    // All committed messages + optional live message at end
    const allMessages = liveMessage
        ? [...messages, liveMessage]
        : messages;

    const totalCount = allMessages.length;

    return (
        <div
            ref={ref}
            onScroll={onScroll}
            className={cn(
                "h-full overflow-y-auto overflow-x-hidden",
                "flex flex-col gap-5",
                "px-4 py-5",
                // Custom scrollbar
                "scrollbar-thin scrollbar-track-transparent",
                "scrollbar-thumb-border/30 hover:scrollbar-thumb-border/50",
            )}
        >
            {allMessages.map((msg, i) => {
                if ((msg as any).role === "plan") {
                    return (
                        <div key={i} className="px-4 py-2">
                            <PlanBubble plan={msg as unknown as AgentPlan} />
                        </div>
                    );
                }
                const isLiveMessage = liveMessage !== null && i === totalCount - 1;
                const isCommitted = !isLiveMessage;

                // Stagger delay for initial load — only first 8 messages
                const staggerDelay = i < 8 ? `${i * 28}ms` : "0ms";

                return (
                    <div
                        key={isLiveMessage ? "live" : i}
                        className="msg-in"
                        style={{ animationDelay: isLiveMessage ? "0ms" : staggerDelay }}
                    >
                        <ChatBubble
                            message={msg}
                            messageIdx={i}
                            threadId={threadId}
                            isStreaming={isLiveMessage}
                            currCheckpointIdx={currCheckpointIdx}
                            isLast={i === totalCount - 1}
                        />
                    </div>
                );
            })}

            {/* Bottom padding so last message isn't flush against input */}
            <div className="h-2 flex-shrink-0" />
        </div>
    );
};