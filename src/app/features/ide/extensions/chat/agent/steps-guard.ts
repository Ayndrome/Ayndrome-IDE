// src/app/features/ide/extensions/chat/agent/steps-guard.ts
// Hard limit on tool calls per agent run.
// Prevents runaway loops from consuming your entire Anthropic quota.

const MAX_TOOL_CALLS = 40;
const WARN_AT_TOOL_CALL = 32;   // warn agent it's approaching the limit

let _toolCallCount = 0;

export function resetStepsGuard(): void {
    _toolCallCount = 0;
}

export function incrementToolCallCount(): void {
    _toolCallCount++;
}

export function getToolCallCount(): number {
    return _toolCallCount;
}

export function hasReachedLimit(): boolean {
    return _toolCallCount >= MAX_TOOL_CALLS;
}

export function isApproachingLimit(): boolean {
    return _toolCallCount >= WARN_AT_TOOL_CALL && _toolCallCount < MAX_TOOL_CALLS;
}

// Injected into the message when approaching limit so agent wraps up
export function buildApproachingLimitWarning(): string {
    const remaining = MAX_TOOL_CALLS - _toolCallCount;
    return (
        `[System: You have used ${_toolCallCount} tool calls. ` +
        `Only ${remaining} tool calls remaining before this session ends. ` +
        `Prioritise completing the most important work first.]`
    );
}

export function buildLimitReachedMessage(): string {
    return (
        `[System: Maximum tool calls (${MAX_TOOL_CALLS}) reached. ` +
        `Stopping agent loop. Please review what was completed and ` +
        `continue in a new message if more work is needed.]`
    );
}