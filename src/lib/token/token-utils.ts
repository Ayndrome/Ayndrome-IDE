// src/lib/token-utils.ts
// Exact token counting using tiktoken (cl100k_base encoding).
// Overestimates slightly for Claude/Gemini — safe direction to be wrong.
// Warmed up at server startup to avoid 300ms delay on first call.

import { getEncoding, type Tiktoken } from "js-tiktoken";

// ── Singleton encoder ─────────────────────────────────────────────────────────

let _encoder: Tiktoken | null = null;
let _warmedUp = false;

function getEncoder(): Tiktoken {
    if (_encoder) return _encoder;
    _encoder = getEncoding("cl100k_base");
    console.log("[TokenUtils] tiktoken encoder initialized (cl100k_base)");
    return _encoder;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function countTokens(text: string): number {
    if (!text) return 0;
    try {
        return getEncoder().encode(text).length;
    } catch (err: any) {
        console.warn(
            `[TokenUtils] tiktoken failed, using heuristic fallback: ${err.message}`
        );
        // Fallback: 2.5 chars/token — conservative (overestimates) for code
        return Math.ceil(text.length / 2.5);
    }
}

export function countMessagesTokens(
    messages: Array<{ content: string | unknown }>
): number {
    return messages.reduce((sum, m) => {
        const text = typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content);
        return sum + countTokens(text);
    }, 0);
}

// ── Warmup — call at server startup ──────────────────────────────────────────
// Prevents 300ms WASM initialization delay on first real token count call.

export function warmupTokenizer(): void {
    if (_warmedUp) return;
    try {
        getEncoder().encode("warmup");
        _warmedUp = true;
        console.log("[TokenUtils] Tokenizer warmed up");
    } catch (err: any) {
        console.warn(`[TokenUtils] Warmup failed: ${err.message}`);
    }
}

// ── Token budget helpers ──────────────────────────────────────────────────────

export type TokenBudgetBreakdown = {
    contextWindow: number;
    systemPrompt: number;
    workspaceState: number;
    messageHistory: number;
    toolDefinitions: number;
    responseReserve: number;
    safetyMargin: number;
    availableForHistory: number;
    utilizationPct: number;
    isOverBudget: boolean;
};

export function computeTokenBudget(opts: {
    contextWindow: number;
    systemPromptText: string;
    workspaceStateText: string;
    messageHistoryText: string;
}): TokenBudgetBreakdown {
    const TOOL_DEFINITIONS = 2_000;
    const RESPONSE_RESERVE = 8_000;
    const SAFETY_MARGIN = 2_000;

    const systemPrompt = countTokens(opts.systemPromptText);
    const workspaceState = countTokens(opts.workspaceStateText);
    const messageHistory = countTokens(opts.messageHistoryText);
    const toolDefinitions = TOOL_DEFINITIONS;
    const responseReserve = RESPONSE_RESERVE;
    const safetyMargin = SAFETY_MARGIN;

    const reserved = systemPrompt + workspaceState + toolDefinitions +
        responseReserve + safetyMargin;
    const availableForHistory = Math.max(opts.contextWindow - reserved, 8_000);
    const totalUsed = reserved + messageHistory;
    const utilizationPct = Math.round((totalUsed / opts.contextWindow) * 100);

    return {
        contextWindow: opts.contextWindow,
        systemPrompt,
        workspaceState,
        messageHistory,
        toolDefinitions,
        responseReserve,
        safetyMargin,
        availableForHistory,
        utilizationPct,
        isOverBudget: messageHistory > availableForHistory,
    };
}

export function logTokenBudget(
    label: string,
    breakdown: TokenBudgetBreakdown,
): void {
    const bar = "█".repeat(Math.min(Math.round(breakdown.utilizationPct / 5), 20));
    const status = breakdown.isOverBudget ? "⚠ OVER BUDGET" : "✓ within budget";

    console.group(`[TokenBudget] ${label}`);
    console.log(`  Context window:    ${breakdown.contextWindow.toLocaleString()} tokens`);
    console.log(`  System prompt:     ${breakdown.systemPrompt.toLocaleString()} tokens`);
    console.log(`  Workspace state:   ${breakdown.workspaceState.toLocaleString()} tokens`);
    console.log(`  Message history:   ${breakdown.messageHistory.toLocaleString()} tokens`);
    console.log(`  Tool definitions:  ${breakdown.toolDefinitions.toLocaleString()} tokens (est.)`);
    console.log(`  Response reserve:  ${breakdown.responseReserve.toLocaleString()} tokens`);
    console.log(`  Safety margin:     ${breakdown.safetyMargin.toLocaleString()} tokens`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  Available for history: ${breakdown.availableForHistory.toLocaleString()} tokens`);
    console.log(`  Utilization: ${breakdown.utilizationPct}% ${bar} ${status}`);
    if (breakdown.isOverBudget) {
        const overage = breakdown.messageHistory - breakdown.availableForHistory;
        console.warn(`  ⚠ Over by ${overage.toLocaleString()} tokens — compression will run`);
    }
    console.groupEnd();
}