// src/app/features/ide/extensions/chat/agent/self-corrector.ts
// Self-correction loop: when a tool fails, the agent gets one chance
// to re-read the relevant file and understand why before retrying.
// Prevents the agent from spinning in error loops.

import type { WebToolName } from "../types/types";

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_CORRECTION_ATTEMPTS = 1;   // one retry per tool failure
const CORRECTABLE_TOOLS = new Set<WebToolName>([
    "write_file",
    "run_terminal",
    "create_file",
]);

// ── State per agent run ───────────────────────────────────────────────────────
// Keyed by toolCallId so we don't retry the same call twice

const correctionAttempts = new Map<string, number>();

// ── Main export ───────────────────────────────────────────────────────────────

export function shouldAttemptCorrection(
    toolName: WebToolName,
    toolCallId: string,
    errorMsg: string,
): boolean {
    if (!CORRECTABLE_TOOLS.has(toolName)) return false;

    const attempts = correctionAttempts.get(toolCallId) ?? 0;
    if (attempts >= MAX_CORRECTION_ATTEMPTS) return false;

    // Don't retry permission errors or timeouts — those won't self-heal
    if (errorMsg.includes("permission denied")) return false;
    if (errorMsg.includes("timed out")) return false;
    if (errorMsg.includes("ENOENT") && toolName !== "write_file") return false;

    return true;
}

export function recordCorrectionAttempt(toolCallId: string): void {
    const attempts = correctionAttempts.get(toolCallId) ?? 0;
    correctionAttempts.set(toolCallId, attempts + 1);
}

export function clearCorrectionState(toolCallId: string): void {
    correctionAttempts.delete(toolCallId);
}

// ── Build correction context message ─────────────────────────────────────────
// Injected into the message stream so the LLM understands what went wrong
// and can adjust its approach before retrying.

export function buildCorrectionContext(
    toolName: WebToolName,
    errorMsg: string,
    rawParams: Record<string, unknown>,
): string {
    const filePath = rawParams.filePath as string | undefined;
    const command = rawParams.command as string | undefined;

    const lines = [
        `The previous ${toolName} call failed with: ${errorMsg}`,
        "",
        "Before retrying, consider:",
    ];

    if (toolName === "write_file" && filePath) {
        lines.push(
            `- Read ${filePath} first to understand the current state`,
            `- Check if the parent directory exists`,
            `- Ensure the content is valid for this file type`,
        );
    }

    if (toolName === "run_terminal" && command) {
        lines.push(
            `- The command was: ${command}`,
            `- Check if required dependencies are installed`,
            `- Verify the working directory is correct`,
            `- Consider breaking the command into smaller steps`,
        );
    }

    if (toolName === "create_file" && filePath) {
        lines.push(
            `- Check if ${filePath} already exists`,
            `- Ensure the parent directory exists (create it first if needed)`,
        );
    }

    lines.push("", "Try a corrected approach.");
    return lines.join("\n");
}