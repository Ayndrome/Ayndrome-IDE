// src/app/features/ide/extensions/chat/agent/context-trimmer.ts
// Phase 15: context window is now model-dependent, not hardcoded

import type { ModelMessage } from "ai";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";
import { getContextWindow } from "@/src/lib/model-provider/model-router";

const ALWAYS_KEEP_LAST_N = 12;
const MIN_MESSAGES_TRIM = 6;
// Reserve 20% of context for tools + response
const CONTEXT_USAGE_RATIO = 0.80;

function getMaxChars(threadId?: string): number {
    const store = useProviderStore.getState();
    const selection = store.getEffectiveModel(threadId);
    const tokens = getContextWindow(selection);
    // rough estimate: 4 chars ≈ 1 token, use 80% of window
    return Math.floor(tokens * CONTEXT_USAGE_RATIO * 4);
}

export function trimMessagesForContext(
    messages: ModelMessage[],
    threadId?: string,
): ModelMessage[] {
    if (messages.length < MIN_MESSAGES_TRIM) return messages;

    const MAX_MESSAGE_CHARS = getMaxChars(threadId);
    const totalChars = estimateChars(messages);
    if (totalChars <= MAX_MESSAGE_CHARS) return messages;

    const head = messages.slice(0, 1);
    const tail = messages.slice(-ALWAYS_KEEP_LAST_N);
    const middle = messages.slice(1, -ALWAYS_KEEP_LAST_N);

    if (middle.length === 0) return injectTruncationWarning(messages);

    const summary = buildSummaryMessage(middle);
    const trimmed = [...head, summary, ...tail];

    return trimMessagesForContext(trimmed, threadId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateChars(messages: ModelMessage[]): number {
    return messages.reduce((sum, msg) => {
        const content = typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return sum + content.length;
    }, 0);
}

function buildSummaryMessage(middle: ModelMessage[]): ModelMessage {
    // Build a text summary of what happened in the middle section
    const lines: string[] = [
        "[Earlier conversation summarised — not shown to save context]",
        "",
    ];

    for (const msg of middle) {
        const content = typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        const preview = content.slice(0, 200).replace(/\n+/g, " ");
        const role = msg.role;

        if (role === "user") {
            lines.push(`User asked: ${preview}${content.length > 200 ? "…" : ""}`);
        } else if (role === "assistant") {
            lines.push(`Assistant responded: ${preview}${content.length > 200 ? "…" : ""}`);
        } else if (role === "tool") {
            lines.push(`Tool result: ${preview}${content.length > 200 ? "…" : ""}`);
        }
    }

    lines.push("", "[End of summary — full conversation continues below]");

    return {
        role: "user",
        content: lines.join("\n"),
    };
}

function injectTruncationWarning(messages: ModelMessage[]): ModelMessage[] {
    const warning: ModelMessage = {
        role: "user",
        content: "[Note: conversation is very long. Focus on the most recent messages.]",
    };
    return [warning, ...messages.slice(-ALWAYS_KEEP_LAST_N)];
}