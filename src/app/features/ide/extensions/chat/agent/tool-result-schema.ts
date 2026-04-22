// src/app/features/ide/extensions/chat/agent/tool-result-schema.ts
// Structured tool results — compressor uses this to make smart decisions.

export type StructuredReadFileResult = {
    __type: "read_file";
    path: string;
    topLines: string;          // first N lines (peek content)
    symbols: string[];        // "functionName:L120", "ClassName:L200"
    totalLines: number;
    omittedLines: number;
    fullContentInWorkspaceState: boolean;  // true = full content in system prompt block
};

export type StructuredTerminalResult = {
    __type: "terminal";
    command: string;
    exitCode: number;
    summary: string;          // "Installed 342 packages successfully"
    fullOutput: string;        // kept for recent turns, stripped when old
    timedOut: boolean;
};

export type StructuredWriteFileResult = {
    __type: "write_file";
    path: string;
    linesAdded: number;
    linesRemoved: number;
    success: boolean;
};

export type StructuredToolResult =
    | StructuredReadFileResult
    | StructuredTerminalResult
    | StructuredWriteFileResult;

// ── Serialization ─────────────────────────────────────────────────────────────
// The LLM sees a human-readable string.
// The compressor sees the structured JSON.
// We embed both in the tool result content.

export function serializeToolResult(result: StructuredToolResult): string {
    // Human-readable display + machine-readable metadata embedded
    const json = JSON.stringify(result);
    const encoded = Buffer.from(json).toString("base64");

    switch (result.__type) {
        case "read_file": {
            const symbolStr = result.symbols.length > 0
                ? `\nSymbols: ${result.symbols.join(", ")}`
                : "";
            const omitStr = result.omittedLines > 0
                ? `\n[${result.omittedLines} lines not shown — use startLine/endLine]`
                : "";
            return (
                `${result.path} (${result.totalLines} lines):` +
                `\n${result.topLines}` +
                omitStr +
                symbolStr +
                `\n<!--__STRUCT__${encoded}-->`  // hidden metadata for compressor
            );
        }

        case "terminal": {
            const exit = result.timedOut ? "[timed out]" : `[exit ${result.exitCode}]`;
            return (
                `${exit} ${result.command}\n${result.fullOutput}` +
                `\n<!--__STRUCT__${encoded}-->`
            );
        }

        case "write_file": {
            return (
                `Wrote ${result.path} (+${result.linesAdded} -${result.linesRemoved})` +
                `\n<!--__STRUCT__${encoded}-->`
            );
        }
    }
}

export function deserializeToolResult(content: string): StructuredToolResult | null {
    const match = content.match(/<!--__STRUCT__(.+?)-->/);
    if (!match) return null;
    try {
        return JSON.parse(Buffer.from(match[1], "base64").toString()) as StructuredToolResult;
    } catch {
        return null;
    }
}