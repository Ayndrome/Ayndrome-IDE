// src/app/features/ide/extensions/chat/agent/reasoning-hooks.ts
// Placeholder hooks for Phase 10.5 autonomous reasoning.
// These are called at key points in the agent loop.
// Right now they are all no-ops — Phase 10.5 fills them in.
// The signatures are fixed — don't change them when implementing.

import type { AgentPlan, PlanStep } from "../types/plan-types";
import type { WebToolName } from "../types/types";

// ── Hook 1: Post-tool reflection ──────────────────────────────────────────────
// Called after every successful tool execution.
// Phase 10.5: returns a reflection string injected into the next LLM message.
// Empty string = no reflection injected (current behavior).

export async function onToolSuccess(
    toolName: WebToolName,
    toolParams: Record<string, unknown>,
    toolResult: unknown,
    currentPlan: AgentPlan | null,
    stepIndex: number | null,
): Promise<string> {
    // Phase 10.5: evaluate result vs plan expectation, return reflection
    return "";  // no-op placeholder
}

// ── Hook 2: Failure strategy resolver ────────────────────────────────────────
// Called when a tool fails.
// Phase 10.5: classifies error type, returns specific recovery strategy.
// Null = use default generic retry (current behavior).

export function onToolFailure(
    toolName: WebToolName,
    errorMsg: string,
    attemptNum: number,
    currentPlan: AgentPlan | null,
): {
    strategy: string | null;   // injected into next LLM message
    shouldEscalate: boolean;      // true = pause loop, ask user
    suggestedActions: string[];   // shown to user if escalating
} {
    // Phase 10.5: classify error + return specific strategy
    return {
        strategy: null,   // no-op placeholder
        shouldEscalate: false,
        suggestedActions: [],
    };
}

// ── Hook 3: Plan revision signal ──────────────────────────────────────────────
// Called after each LLM response to check if the plan should be revised.
// Phase 10.5: parses LLM response for plan change signals.
// Null = no revision needed (current behavior).

export function onAssistantMessage(
    messageContent: string,
    currentPlan: AgentPlan | null,
): {
    revision: PlanRevision | null;
} {
    // Phase 10.5: detect "I need to revise step N" patterns in LLM output
    return { revision: null };  // no-op placeholder
}

// ── Hook 4: Stuck detection ───────────────────────────────────────────────────
// Called before each LLM request.
// Phase 10.5: detects if agent is spinning on same problem.
// False = continue normally (current behavior).

export function isAgentStuck(
    recentToolCalls: Array<{ name: WebToolName; params: Record<string, unknown> }>,
    recentErrors: string[],
): boolean {
    // Phase 10.5: detect repeated identical tool calls, circular patterns
    return false;  // no-op placeholder
}

// ── Types used by hooks ───────────────────────────────────────────────────────

export type PlanRevision = {
    stepIndex: number;
    action: "update" | "skip" | "add_after" | "mark_failed";
    newTitle?: string;
    newDescription?: string;
    reason: string;
};