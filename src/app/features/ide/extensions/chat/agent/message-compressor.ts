// src/app/features/ide/extensions/chat/agent/message-compressor.ts
// Token-budget-based compression with semantic awareness.
// Replaces the turn-count eviction in convertMessagesToLLMWithCompression.

import type { ModelMessage } from "ai";
import type { ChatMessage } from "../types/types";
import { deserializeToolResult } from "./tool-result-schema";
import { getWorkspaceStateTokens } from "./workspace-state";

// ── Token budget constants ────────────────────────────────────────────────────

const CONTEXT_BUDGET_MAP: Record<string, number> = {
    // provider:model → total context tokens
    "anthropic:claude-sonnet-4-5": 200_000,
    "gemini:gemini-2.5-flash-preview-04-17": 1_000_000,
    "openai:gpt-4.1": 1_000_000,
    "deepseek:deepseek-chat": 64_000,
    "default": 128_000,
};

const SYSTEM_PROMPT_BUDGET = 3_000;   // static rules
const RESPONSE_BUDGET = 8_000;   // room for LLM response
const TOOL_DEFINITIONS_BUDGET = 2_000; // tool schemas
const SAFETY_MARGIN = 2_000;   // buffer

function getAvailableForMessages(
    contextWindow: number,
    workspaceTokens: number,
): number {
    const reserved =
        SYSTEM_PROMPT_BUDGET +
        RESPONSE_BUDGET +
        TOOL_DEFINITIONS_BUDGET +
        SAFETY_MARGIN +
        workspaceTokens;     // workspace state is in system prompt

    const available = contextWindow - reserved;
    console.log(
        `[Compressor] Context window: ${contextWindow} | ` +
        `Reserved: ${reserved} (workspace: ${workspaceTokens}) | ` +
        `Available for messages: ${available}`
    );
    return Math.max(available, 10_000);  // never drop below 10K for messages
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
}

// ── Message compression pipeline ──────────────────────────────────────────────

export function convertMessagesToLLMWithCompression(
    messages: ChatMessage[],
    contextWindow: number,
): ModelMessage[] {
    const workspaceTokens = getWorkspaceStateTokens();
    const budget = getAvailableForMessages(contextWindow, workspaceTokens);

    // Step 1: Convert all messages, preserving structure
    const converted = convertAll(messages);

    // Step 2: Measure total size
    const totalTokens = converted.reduce((sum, m) => {
        const c = typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content);
        return sum + estimateTokens(c);
    }, 0);

    console.log(
        `[Compressor] Total message tokens: ${totalTokens} | ` +
        `Budget: ${budget} | ` +
        `${totalTokens > budget ? "OVER BUDGET — compressing" : "within budget"}`
    );

    if (totalTokens <= budget) return converted;

    // Step 3: Compress until within budget
    return compressToFit(converted, budget);
}

function convertAll(messages: ChatMessage[]): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const msg of messages) {
        if (msg.role === "checkpoint") continue;
        if (msg.role === "interrupted_tool") continue;

        if (msg.role === "user") {
            const content = msg.content?.trim();
            if (!content) continue;  // skip empty user messages entirely
            result.push({ role: "user", content });
        }

        // else if (msg.role === "assistant") {
        //     result.push({ role: "assistant", content: msg.displayContent || "(empty)" });
        // } 


        else if (msg.role === "assistant") {
            const content = msg.displayContent?.trim();
            // If assistant message is empty AND next message is a tool result,
            // it means the agent called a tool silently — skip the empty message.
            // The tool result tells the story without a blank preamble.
            if (!content) continue;
            result.push({ role: "assistant", content });
        }

        else if (msg.role === "tool") {
            if (msg.type === "success" || msg.type === "tool_error") {
                result.push({
                    role: "tool",
                    content: [{
                        type: "tool-result",
                        toolCallId: msg.id,
                        toolName: msg.name,
                        output: { type: "text" as const, value: msg.content ?? "" },
                    }],
                });
            }
        }
    }

    return result;
}

function compressToFit(
    messages: ModelMessage[],
    budget: number,
): ModelMessage[] {
    // Strategy: compress oldest messages first, newest last.
    // Never touch the last 4 message pairs (8 messages).
    // Compress in passes — terminal first, then read_file, then assistant text.

    const ALWAYS_KEEP_TAIL = 8;
    const tail = messages.slice(-ALWAYS_KEEP_TAIL);
    const head = messages.slice(0, 1);   // keep first message (task context)
    let middle = messages.slice(1, -ALWAYS_KEEP_TAIL);

    // Pass 1: Compress terminal outputs in middle (huge, low value when old)
    middle = middle.map(m => compressTerminalInMessage(m));

    // Pass 2: Compress read_file results to symbol-only (medium value)
    middle = middle.map(m => compressReadFileInMessage(m));

    // Pass 3: If still over budget, compress assistant text in middle
    const allMessages = [...head, ...middle, ...tail];
    const currentTokens = allMessages.reduce((sum, m) => {
        const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return sum + estimateTokens(c);
    }, 0);

    if (currentTokens > budget) {
        console.log(
            `[Compressor] Still over budget after Pass 1+2: ` +
            `${currentTokens} tokens. Running Pass 3 (assistant text compression)`
        );
        // Summarize multiple old assistant messages into one
        return summarizeOldMessages(allMessages, budget);
    }

    console.log(
        `[Compressor] Compressed to ${currentTokens} tokens ` +
        `(budget: ${budget})`
    );

    return allMessages;
}

// ── Pass 1: Terminal compression ──────────────────────────────────────────────

function compressTerminalInMessage(msg: ModelMessage): ModelMessage {
    if (msg.role !== "tool") return msg;

    const content = msg.content as any[];
    if (!Array.isArray(content)) return msg;

    return {
        ...msg,
        content: content.map(item => {
            if (item.type !== "tool-result") return item;

            const raw = item.output?.value ?? "";
            const struct = deserializeToolResult(raw);

            if (struct?.__type === "terminal") {
                const summary =
                    `[exit ${struct.exitCode}] ${struct.command}\n` +
                    struct.summary;
                console.log(
                    `[Compressor] Terminal compressed: ` +
                    `${raw.length} → ${summary.length} chars`
                );
                return { ...item, output: { type: "text", value: summary } };
            }

            // Unstructured terminal — compress by keeping first+last lines
            if (item.toolName === "run_terminal" || item.toolName === "run_in_terminal") {
                const lines = raw.split("\n").filter(Boolean);
                const exitLine = lines.find((l: any) => l.startsWith("[exit") || l.startsWith("[timed"));
                if (lines.length > 8) {
                    const compressed =
                        (exitLine ?? "") + "\n" +
                        lines.slice(0, 2).join("\n") +
                        `\n[... ${lines.length - 4} lines compressed]\n` +
                        lines.slice(-2).join("\n");
                    return { ...item, output: { type: "text", value: compressed } };
                }
            }

            return item;
        }),
    };
}

// ── Pass 2: read_file compression (SEMANTIC — preserves symbol map) ───────────

function compressReadFileInMessage(msg: ModelMessage): ModelMessage {
    if (msg.role !== "tool") return msg;

    const content = msg.content as any[];
    if (!Array.isArray(content)) return msg;

    return {
        ...msg,
        content: content.map(item => {
            if (item.type !== "tool-result" || item.toolName !== "read_file") return item;

            const raw = item.output?.value ?? "";
            const struct = deserializeToolResult(raw);

            if (struct?.__type === "read_file") {
                // Drop file text, KEEP symbol map — this is the key fix
                const compressed = struct.fullContentInWorkspaceState
                    ? `[${struct.path} is in active workspace state — ${struct.totalLines} lines]`
                    : `[${struct.path} compressed — symbols: ${struct.symbols.join(", ") || "none detected"}]`;

                console.log(
                    `[Compressor] read_file semantic compress: ` +
                    `${raw.length} chars → ${compressed.length} chars ` +
                    `(preserved ${struct.symbols.length} symbols)`
                );
                return { ...item, output: { type: "text", value: compressed } };
            }

            // Unstructured read_file — use symbol extractor on the raw text
            if (item.toolName === "read_file") {
                const lines = raw.split("\n");
                const symbols = extractSymbolsFromLines(lines);
                const compressed = lines.length > 10
                    ? `[File compressed — known symbols: ${symbols.join(", ") || "none"}. Use read_file again if needed.]`
                    : raw;
                return { ...item, output: { type: "text", value: compressed } };
            }

            return item;
        }),
    };
}

function extractSymbolsFromLines(lines: string[]): string[] {
    const symbols: string[] = [];
    const patterns = [
        /^export (?:default )?(?:async function|function|class|const)\s+(\w+)/,
        /^(?:function|class)\s+(\w+)/,
        /^export\s+(?:type|interface|enum)\s+(\w+)/,
    ];
    for (let i = 0; i < lines.length && symbols.length < 8; i++) {
        for (const p of patterns) {
            const m = lines[i].match(p);
            if (m?.[1]) { symbols.push(`${m[1]}:L${i + 1}`); break; }
        }
    }
    return symbols;
}

// ── Pass 3: Conversation summarization ───────────────────────────────────────

function summarizeOldMessages(
    messages: ModelMessage[],
    budget: number,
): ModelMessage[] {
    // Find the oldest block of user/assistant pairs and collapse to summary
    const KEEP_TAIL = 10;
    const tail = messages.slice(-KEEP_TAIL);
    const toSummarize = messages.slice(1, -KEEP_TAIL)   // skip first message
        .filter(m => m.role === "user" || m.role === "assistant");

    const summaryLines: string[] = ["[Earlier conversation summary]"];
    for (const m of toSummarize) {
        const c = typeof m.content === "string" ? m.content : "";
        if (m.role === "user") {
            summaryLines.push(`User: ${c.slice(0, 80)}${c.length > 80 ? "…" : ""}`);
        } else {
            summaryLines.push(`Agent: ${c.slice(0, 80)}${c.length > 80 ? "…" : ""}`);
        }
    }

    const summary: ModelMessage = {
        role: "user",
        content: summaryLines.join("\n"),
    };

    const result = [messages[0], summary, ...tail];
    const finalTokens = result.reduce((sum, m) => {
        const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return sum + estimateTokens(c);
    }, 0);

    console.log(
        `[Compressor] Pass 3 complete: ${finalTokens} tokens ` +
        `(summarized ${toSummarize.length} messages into 1 block)`
    );

    return result;
}