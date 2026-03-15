import { api } from "../../../../../../convex/_generated/api"
import { ConvexReactClient } from "convex/react";
import {
    ChatThread,
    ChatMessage,
    SimpleFileSnapshot,
    WebToolName,
    WebToolCallParams,
    WebToolResult,
    ToolParams,
    ToolResult,
    LintError,
    DirectoryEntry,
    RawToolParams,


} from "./types/types";

import { streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { anthropic } from "@ai-sdk/anthropic";
import {

    ToolMessage,
    ThreadStreamState,
    ChatMode,
    CheckpointEntry,

    AnthropicReasoning,
    approvalTypeOfWebTool,

} from "./types/types";


// Singleton Convex client — same instance used by the rest of the app
let _convexClient: ConvexReactClient | null = null;

export function initChatStorage(client: ConvexReactClient) {
    _convexClient = client;
}


function getClient(): ConvexReactClient {
    if (!_convexClient) throw new Error("Chat storage not initialized. Call initChatStorage() first.");
    return _convexClient;
}


// ── Thread persistence ────────────────────────────────────────────────────────

export async function loadAllThreads(): Promise<Record<string, ChatThread>> {
    try {
        const client = getClient();
        const threads = await client.query(api.chatThreads.getAllThreads, {});
        // Convert array → Record<id, thread>
        const result: Record<string, ChatThread> = {};
        for (const t of threads ?? []) {
            // Deserialize — Convex stores JSON, we need to revive the shape
            result[t.threadId] = deserializeThread(t.data);
        }
        return result;
    } catch (e) {
        console.error("[ChatStorage] Failed to load threads:", e);
        return {};
    }
}


export async function saveThread(thread: ChatThread): Promise<void> {
    try {
        const client = getClient();
        await client.mutation(api.chatThreads.upsertThread, {
            threadId: thread.id,
            data: serializeThread(thread),
        });
    } catch (e) {
        console.error("[ChatStorage] Failed to save thread:", e);
    }
}


export async function deleteThreadFromStorage(threadId: string): Promise<void> {
    try {
        const client = getClient();
        await client.mutation(api.chatThreads.deleteThread, { threadId });
    } catch (e) {
        console.error("[ChatStorage] Failed to delete thread:", e);
    }
}

// ── Serialization ─────────────────────────────────────────────────────────────
// Convex stores plain JSON — we just JSON.stringify the thread.
// If you add non-serializable fields later, handle them here.

function serializeThread(thread: ChatThread): string {
    return JSON.stringify(thread);
}

function deserializeThread(data: string): ChatThread {
    return JSON.parse(data) as ChatThread;
}



// Base URL for the file API route
const FILE_API_BASE = process.env.NEXT_PUBLIC_FILE_API_URL ?? "/api/files";

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function fileApiRequest<T>(
    qs: string,
    options?: RequestInit
): Promise<T> {
    const res = await fetch(`${FILE_API_BASE}${qs}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`File API error (${res.status}): ${error}`);
    }
    return res.json() as Promise<T>;
}

// ── Tool implementations factory ──────────────────────────────────────────────
// Returns a typed tool implementation map scoped to a specific Convex project.
// Pass the current project's Convex ID so the server resolves paths in that tree.

export function makeToolImplementations(projectId: string): {
    [T in keyof WebToolCallParams]: (
        params: WebToolCallParams[T],
        signal?: AbortSignal
    ) => Promise<WebToolResult[T]>;
} {
    // Helper: build URLSearchParams with projectId always included
    const p = (base: Record<string, string>) =>
        new URLSearchParams({ ...base, projectId });

    return {
        read_file: async ({ filePath, startLine, endLine }, signal) => {
            const params = p({ action: 'read', path: filePath });
            if (startLine != null) params.set("startLine", String(startLine));
            if (endLine != null) params.set("endLine", String(endLine));
            return fileApiRequest<WebToolResult["read_file"]>(`?${params}`, { signal });
        },

        write_file: async ({ filePath, content }, signal) => {
            return fileApiRequest<WebToolResult["write_file"]>(
                `?${p({ action: 'write' })}`,
                { method: "POST", body: JSON.stringify({ path: filePath, content }), signal }
            );
        },

        create_file: async ({ filePath, isFolder }, signal) => {
            return fileApiRequest<WebToolResult["create_file"]>(
                `?${p({ action: 'create' })}`,
                { method: "POST", body: JSON.stringify({ path: filePath, isFolder: isFolder ?? false }), signal }
            );
        },

        delete_file: async ({ filePath, recursive }, signal) => {
            return fileApiRequest<WebToolResult["delete_file"]>(
                `?${p({ action: 'delete' })}`,
                { method: "DELETE", body: JSON.stringify({ path: filePath, recursive: recursive ?? false }), signal }
            );
        },

        search_in_file: async ({ filePath, query, isRegex }, signal) => {
            const params = p({ action: 'search-in-file', path: filePath, query, isRegex: String(isRegex ?? false) });
            return fileApiRequest<WebToolResult["search_in_file"]>(`?${params}`, { signal });
        },

        search_files: async ({ query, isRegex, includePattern }, signal) => {
            const params = p({ action: 'search', query });
            if (isRegex) params.set("isRegex", "true");
            if (includePattern) params.set("include", includePattern);
            return fileApiRequest<WebToolResult["search_files"]>(`?${params}`, { signal });
        },

        list_directory: async ({ dirPath }, signal) => {
            return fileApiRequest<WebToolResult["list_directory"]>(
                `?${p({ action: 'list', path: dirPath })}`,
                { signal }
            );
        },

        run_terminal: async ({ command, cwd }, signal) => {
            return fileApiRequest<WebToolResult["run_terminal"]>(
                `?${p({ action: 'terminal' })}`,
                { method: "POST", body: JSON.stringify({ command, cwd }), signal }
            );
        },
    };
}

// ── Param validation ──────────────────────────────────────────────────────────
// Validates raw LLM params before executing a tool.
// Returns typed params or throws with a helpful error message.

export function validateToolParams<T extends keyof WebToolCallParams>(
    toolName: T,
    raw: RawToolParams
): WebToolCallParams[T] {
    const validators: {
        [K in keyof WebToolCallParams]: (r: RawToolParams) => WebToolCallParams[K];
    } = {
        read_file: (r) => {
            if (!r.filePath) throw new Error("read_file requires 'filePath'");
            return {
                filePath: r.filePath,
                startLine: r.startLine ? Number(r.startLine) : undefined,
                endLine: r.endLine ? Number(r.endLine) : undefined,
            };
        },
        write_file: (r) => {
            if (!r.filePath) throw new Error("write_file requires 'filePath'");
            if (r.content == null) throw new Error("write_file requires 'content'");
            return { filePath: r.filePath, content: r.content };
        },
        create_file: (r) => {
            if (!r.filePath) throw new Error("create_file requires 'filePath'");
            return { filePath: r.filePath, isFolder: r.isFolder === "true" };
        },
        delete_file: (r) => {
            if (!r.filePath) throw new Error("delete_file requires 'filePath'");
            return { filePath: r.filePath, recursive: r.recursive === "true" };
        },
        search_in_file: (r) => {
            if (!r.filePath) throw new Error("search_in_file requires 'filePath'");
            if (!r.query) throw new Error("search_in_file requires 'query'");
            return { filePath: r.filePath, query: r.query, isRegex: r.isRegex === "true" };
        },
        search_files: (r) => {
            if (!r.query) throw new Error("search_files requires 'query'");
            return { query: r.query, isRegex: r.isRegex === "true", includePattern: r.includePattern };
        },
        list_directory: (r) => {
            if (!r.dirPath) throw new Error("list_directory requires 'dirPath'");
            return { dirPath: r.dirPath };
        },
        run_terminal: (r) => {
            if (!r.command) throw new Error("run_terminal requires 'command'");
            return { command: r.command, cwd: r.cwd };
        },
    };

    return validators[toolName](raw);
}

// ── Result stringification ────────────────────────────────────────────────────
// Converts tool results to strings for the LLM's next message context.

export function stringifyToolResult<T extends keyof WebToolCallParams>(
    toolName: T,
    params: WebToolCallParams[T],
    result: WebToolResult[T]
): string {
    switch (toolName) {
        case "read_file": {
            const r = result as WebToolResult["read_file"];
            const truncNote = r.truncated ? `\n[File truncated — ${r.totalLines} total lines]` : "";
            return `${(params as WebToolCallParams["read_file"]).filePath}:\n${r.content}${truncNote}`;
        }
        case "write_file": {
            const r = result as WebToolResult["write_file"];
            const p = params as WebToolCallParams["write_file"];
            const lintStr =
                r.lintErrors?.length
                    ? `\nLint errors:\n${r.lintErrors.map((e) => `  Line ${e.startLine}: ${e.message}`).join("\n")}`
                    : "";
            return `Successfully wrote ${p.filePath}.${lintStr}`;
        }
        case "create_file": {
            const p = params as WebToolCallParams["create_file"];
            return `Created ${p.filePath}.`;
        }
        case "delete_file": {
            const p = params as WebToolCallParams["delete_file"];
            return `Deleted ${p.filePath}.`;
        }
        case "search_in_file": {
            const r = result as WebToolResult["search_in_file"];
            const p = params as WebToolCallParams["search_in_file"];
            if (!r.matchingLines.length) return `No matches found in ${p.filePath}.`;
            return `Matches in ${p.filePath} at lines: ${r.matchingLines.join(", ")}`;
        }
        case "search_files": {
            const r = result as WebToolResult["search_files"];
            if (!r.filePaths.length) return "No files matched.";
            const moreStr = r.hasMore ? "\n[More results available]" : "";
            return `Matching files:\n${r.filePaths.join("\n")}${moreStr}`;
        }
        case "list_directory": {
            const r = result as WebToolResult["list_directory"];
            const p = params as WebToolCallParams["list_directory"];
            const entries = r.entries
                .map((e) => `  ${e.isDirectory ? "📁" : "📄"} ${e.name}`)
                .join("\n");
            return `Contents of ${p.dirPath}:\n${entries}`;
        }
        case "run_terminal": {
            const r = result as WebToolResult["run_terminal"];
            const exitStr = r.timedOut ? "[timed out]" : `[exit ${r.exitCode ?? "?"}]`;
            return `${exitStr}\n${r.output}`;
        }
        default:
            return JSON.stringify(result);
    }
}

// ── File snapshot helpers ─────────────────────────────────────────────────────
// Used by the checkpoint system to take and restore file snapshots.

export async function takeFileSnapshot(filePath: string): Promise<string | null> {
    try {
        const result = await makeToolImplementations.read_file({ filePath });
        return result.content;
    } catch {
        return null;
    }
}

export async function restoreFileSnapshot(
    filePath: string,
    content: string
): Promise<void> {
    await toolImplementations.write_file({ filePath, content });
}



// ── Constants ─────────────────────────────────────────────────────────────────

const CHAT_RETRIES = 3;
const RETRY_DELAY = 1000;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ── Agent loop callbacks ──────────────────────────────────────────────────────
// The agent loop is pure logic — it communicates back to the store
// via these callbacks instead of directly mutating state.
// This makes it easier to test and keeps concerns separated.

export type AgentCallbacks = {
    // Called whenever stream state changes (streaming/tool_running/idle/etc)
    onStreamStateChange: (state: ThreadStreamState) => void;

    // Called to add a new message to the thread's message array
    onAddMessage: (message: ChatMessage) => void;

    // Called to replace the last message in the thread (for tool state transitions)
    // Returns false if there's nothing to replace (should add instead)
    onReplaceLastMessage: (message: ChatMessage) => boolean;

    // Called when the agent wants to add a checkpoint snapshot
    onAddCheckpoint: (checkpoint: CheckpointEntry) => void;

    // Called to get the current messages array (may have been updated externally)
    getMessages: () => ChatMessage[];

    // Called to show a toast notification
    onNotify: (opts: { message: string; type: "success" | "error" }) => void;

    // Settings
    chatMode: ChatMode;
    autoApproveEdits: boolean;
    autoApproveTerminal: boolean;
};

// ── Raw LLM tool call shape (from Vercel AI SDK) ──────────────────────────────

type RawToolCall = {
    toolCallId: string;
    toolName: string;
    // v6: renamed from 'args' to 'input' on tool-call stream chunks
    input: Record<string, unknown>;
};

// ── Main agent entry point ────────────────────────────────────────────────────

export async function runChatAgent(
    callbacks: AgentCallbacks,
    opts: {
        // If set, run this tool first (resuming after user approved a tool_request)
        callThisToolFirst?: ToolMessage<WebToolName> & { type: "tool_request" };
        abortSignal?: AbortSignal;
    } = {}
): Promise<void> {
    const { callThisToolFirst, abortSignal } = opts;
    const {
        onStreamStateChange,
        onAddMessage,
        onReplaceLastMessage,
        onAddCheckpoint,
        getMessages,
        chatMode,
        autoApproveEdits,
        autoApproveTerminal,
    } = callbacks;

    // Track whether user interrupted during an idle gap
    let interruptedWhenIdle = false;

    // Set initial idle state
    onStreamStateChange({
        status: "idle",
        abort: () => { interruptedWhenIdle = true; },
    });

    // ── Pre-loop: run the pre-approved tool if resuming from tool_request ──────
    if (callThisToolFirst) {
        const { interrupted } = await _runToolCall(
            callThisToolFirst.name as WebToolName,
            callThisToolFirst.id,
            callThisToolFirst.mcpServerName,
            {
                preapproved: true,
                rawParams: callThisToolFirst.rawParams,
                validatedParams: callThisToolFirst.params as any,
            },
            callbacks,
            abortSignal
        );
        if (interrupted) {
            onStreamStateChange(undefined);
            _addUserCheckpoint(callbacks);
            return;
        }
    }

    // ── Main tool-use loop ─────────────────────────────────────────────────────
    let shouldSendAnotherMessage = true;
    let isRunningWhenEnd: "awaiting_user" | undefined = undefined;
    let nMessagesSent = 0;

    while (shouldSendAnotherMessage) {
        shouldSendAnotherMessage = false;
        isRunningWhenEnd = undefined;
        nMessagesSent += 1;

        // Check if user interrupted during idle
        onStreamStateChange({
            status: "idle",
            abort: () => { interruptedWhenIdle = true; },
        });

        if (interruptedWhenIdle || abortSignal?.aborted) {
            onStreamStateChange(undefined);
            return;
        }

        // Convert thread messages to LLM format
        const currentMessages = getMessages();
        const llmMessages = convertMessagesToLLM(currentMessages, chatMode);
        const systemMessage = buildChatSystemMessage(chatMode);

        // ── Retry loop for LLM errors ──────────────────────────────────────────
        let shouldRetry = true;
        let nAttempts = 0;

        while (shouldRetry) {
            shouldRetry = false;
            nAttempts += 1;

            // Track the resolved LLM result
            type LLMResult =
                | { type: "done"; text: string; reasoning: string; anthropicReasoning: AnthropicReasoning[] | null; toolCall: RawToolCall | null }
                | { type: "error"; error: Error }
                | { type: "aborted" };

            let resolveLLM!: (r: LLMResult) => void;
            const llmDonePromise = new Promise<LLMResult>((res) => { resolveLLM = res; });

            // Create abort controller for this specific LLM call
            const llmAbortController = new AbortController();

            // Link outer abort signal to this LLM call
            abortSignal?.addEventListener("abort", () => llmAbortController.abort());

            // Set streaming state
            onStreamStateChange({
                status: "streaming",
                partialText: "",
                partialReasoning: "",
                partialToolCall: null,
                abort: () => llmAbortController.abort(),
            });

            // ── Stream from Claude ─────────────────────────────────────────────
            let accumulatedText = "";
            let accumulatedReasoning = "";
            let detectedToolCall: RawToolCall | null = null;

            try {
                const stream = await streamText({
                    model: anthropic("claude-sonnet-4-6"),
                    system: systemMessage,
                    messages: llmMessages,
                    maxOutputTokens: 4096,
                    temperature: 0.3,
                    abortSignal: llmAbortController.signal,
                    tools: _buildAnthropicTools(chatMode),
                    onChunk: ({ chunk }) => {
                        if (chunk.type === "text-delta") {
                            accumulatedText += chunk.text;
                            onStreamStateChange({
                                status: "streaming",
                                partialText: accumulatedText,
                                partialReasoning: accumulatedReasoning,
                                partialToolCall: detectedToolCall
                                    ? { name: detectedToolCall.toolName, rawParams: detectedToolCall.input as RawToolParams }
                                    : null,
                                abort: () => llmAbortController.abort(),
                            });
                        }
                        // v6: tool-call chunk is a union of StaticToolCall | DynamicToolCall
                        // Both branches have toolName; input replaces args.
                        if (chunk.type === "tool-call" && !chunk.dynamic) {
                            detectedToolCall = {
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                input: chunk.input as Record<string, unknown>,
                            };
                        } else if (chunk.type === "tool-call" && chunk.dynamic) {
                            detectedToolCall = {
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                input: chunk.input as Record<string, unknown>,
                            };
                        }
                    },
                });

                // Await full completion
                await stream.text; // ensures stream is fully consumed

                resolveLLM({
                    type: "done",
                    text: accumulatedText,
                    reasoning: accumulatedReasoning,
                    anthropicReasoning: null,
                    toolCall: detectedToolCall,
                });
            } catch (err: any) {
                if (err?.name === "AbortError" || llmAbortController.signal.aborted) {
                    resolveLLM({ type: "aborted" });
                } else {
                    resolveLLM({ type: "error", error: err });
                }
            }

            const llmResult = await llmDonePromise;

            // ── Handle LLM result ──────────────────────────────────────────────

            if (llmResult.type === "aborted") {
                // Save whatever we accumulated before abort
                if (accumulatedText || detectedToolCall) {
                    onAddMessage({
                        role: "assistant",
                        displayContent: accumulatedText,
                        reasoning: accumulatedReasoning,
                        anthropicReasoning: null,
                    });
                    if (detectedToolCall) {
                        onAddMessage({
                            role: "interrupted_tool",
                            name: detectedToolCall.toolName as WebToolName,
                            mcpServerName: undefined,
                        });
                    }
                }
                onStreamStateChange(undefined);
                return;
            }

            if (llmResult.type === "error") {
                if (nAttempts < CHAT_RETRIES) {
                    // Retry after delay
                    shouldRetry = true;
                    onStreamStateChange({
                        status: "idle",
                        abort: () => { interruptedWhenIdle = true; },
                    });
                    await sleep(RETRY_DELAY);
                    if (interruptedWhenIdle || abortSignal?.aborted) {
                        onStreamStateChange(undefined);
                        return;
                    }
                    continue;
                }

                // Max retries exceeded — save partial and show error
                onAddMessage({
                    role: "assistant",
                    displayContent: accumulatedText,
                    reasoning: "",
                    anthropicReasoning: null,
                });
                onStreamStateChange({
                    status: "error",
                    message: llmResult.error.message ?? "An error occurred.",
                    fullError: llmResult.error,
                });
                _addUserCheckpoint(callbacks);
                return;
            }

            // ── LLM success ────────────────────────────────────────────────────

            const { text, reasoning, anthropicReasoning, toolCall } = llmResult;

            // Always save the assistant message
            onAddMessage({
                role: "assistant",
                displayContent: text,
                reasoning,
                anthropicReasoning,
            });

            onStreamStateChange({ status: "idle", abort: () => { interruptedWhenIdle = true; } });

            // ── Run tool if requested ──────────────────────────────────────────
            if (toolCall) {
                const { awaitingUserApproval, interrupted } = await _runToolCall(
                    toolCall.toolName as WebToolName,
                    toolCall.toolCallId,
                    undefined, // mcpServerName — add MCP support later
                    { preapproved: false, rawParams: toolCall.input as RawToolParams },
                    callbacks,
                    abortSignal
                );

                if (interrupted) {
                    onStreamStateChange(undefined);
                    return;
                }

                if (awaitingUserApproval) {
                    isRunningWhenEnd = "awaiting_user";
                } else {
                    shouldSendAnotherMessage = true;
                }

                onStreamStateChange({ status: "idle", abort: () => { interruptedWhenIdle = true; } });
            }
        } // end retry while
    } // end main agent while

    // ── Loop complete ──────────────────────────────────────────────────────────

    if (isRunningWhenEnd === "awaiting_user") {
        onStreamStateChange({ status: "awaiting_user" });
    } else {
        onStreamStateChange(undefined);
        _addUserCheckpoint(callbacks);
    }
}

// ── Tool call runner ──────────────────────────────────────────────────────────

async function _runToolCall(
    toolName: WebToolName,
    toolId: string,
    mcpServerName: string | undefined,
    opts:
        | { preapproved: true; rawParams: RawToolParams; validatedParams: any }
        | { preapproved: false; rawParams: RawToolParams },
    callbacks: AgentCallbacks,
    abortSignal?: AbortSignal
): Promise<{ awaitingUserApproval?: boolean; interrupted?: boolean }> {
    const {
        onAddMessage,
        onReplaceLastMessage,
        onStreamStateChange,
        onAddCheckpoint,
        autoApproveEdits,
        autoApproveTerminal,
    } = callbacks;

    let validatedParams: any;

    if (!opts.preapproved) {
        // ── Step 1: Validate params ────────────────────────────────────────────
        try {
            if (toolName in toolImplementations) {
                validatedParams = validateToolParams(
                    toolName as keyof typeof toolImplementations,
                    opts.rawParams
                );
            } else {
                // Unknown tool (future MCP) — pass raw
                validatedParams = opts.rawParams;
            }
        } catch (err: any) {
            onAddMessage({
                role: "tool",
                type: "invalid_params",
                id: toolId,
                name: toolName,
                content: err.message ?? "Invalid tool parameters",
                rawParams: opts.rawParams,
                result: null,
                mcpServerName,
            });
            return {};
        }

        // ── Step 2: Snapshot file before write operations ──────────────────────
        if (toolName === "write_file" && validatedParams.filePath) {
            const snapshot = await takeFileSnapshot(validatedParams.filePath);
            if (snapshot !== null) {
                onAddCheckpoint({
                    role: "checkpoint",
                    type: "tool_edit",
                    snapshotByPath: {
                        [validatedParams.filePath]: {
                            content: snapshot,
                            timestamp: Date.now(),
                            filePath: validatedParams.filePath,
                        },
                    },
                    userModifications: { snapshotByPath: {} },
                });
            }
        }

        // ── Step 3: Check if approval is required ─────────────────────────────
        const approvalType = approvalTypeOfWebTool[toolName];
        if (approvalType) {
            const autoApproved =
                (approvalType === "edits" && autoApproveEdits) ||
                (approvalType === "terminal" && autoApproveTerminal);

            // Always add tool_request message first (UI needs it even for auto-approve)
            onAddMessage({
                role: "tool",
                type: "tool_request",
                id: toolId,
                name: toolName,
                content: "(Awaiting user permission...)",
                rawParams: opts.rawParams,
                params: validatedParams,
                result: null,
                mcpServerName,
            });

            if (!autoApproved) {
                // Pause loop — user must click approve/reject in UI
                return { awaitingUserApproval: true };
            }
        }
    } else {
        validatedParams = opts.validatedParams;
    }

    // ── Step 4: Mark tool as running ───────────────────────────────────────────
    const runningMessage: ToolMessage<WebToolName> = {
        role: "tool",
        type: "running_now",
        id: toolId,
        name: toolName,
        content: "(Running...)",
        rawParams: opts.rawParams,
        params: validatedParams,
        result: null,
        mcpServerName,
    };

    // Swap tool_request → running_now (or add if no prior message)
    const swapped = onReplaceLastMessage(runningMessage);
    if (!swapped) onAddMessage(runningMessage);

    // Create abort controller for this tool call
    const toolAbortController = new AbortController();
    abortSignal?.addEventListener("abort", () => toolAbortController.abort());

    let interrupted = false;

    onStreamStateChange({
        status: "tool_running",
        toolName,
        toolParams: opts.rawParams,
        toolId,
        mcpServerName,
        abort: () => {
            interrupted = true;
            toolAbortController.abort();
        },
    });

    // ── Step 5: Execute the tool ───────────────────────────────────────────────
    let toolResult: any;
    let toolResultStr: string;

    try {
        const impl = toolImplementations[toolName as keyof typeof toolImplementations];
        if (!impl) throw new Error(`Tool "${toolName}" is not implemented.`);

        toolResult = await impl(validatedParams, toolAbortController.signal);

        if (interrupted) return { interrupted: true };
    } catch (err: any) {
        if (interrupted) return { interrupted: true };

        const errMsg = err.message ?? "Tool execution failed.";
        const errorMessage: ToolMessage<WebToolName> = {
            role: "tool",
            type: "tool_error",
            id: toolId,
            name: toolName,
            content: errMsg,
            rawParams: opts.rawParams,
            params: validatedParams,
            result: errMsg,
            mcpServerName,
        };
        const swapped = onReplaceLastMessage(errorMessage);
        if (!swapped) onAddMessage(errorMessage);
        return {};
    }

    // ── Step 6: Stringify result for LLM ──────────────────────────────────────
    try {
        toolResultStr = stringifyToolResult(
            toolName as keyof typeof toolImplementations,
            validatedParams,
            toolResult
        );
    } catch (err: any) {
        const errMsg = `Tool succeeded but failed to stringify result: ${err.message}`;
        const errorMessage: ToolMessage<WebToolName> = {
            role: "tool",
            type: "tool_error",
            id: toolId,
            name: toolName,
            content: errMsg,
            rawParams: opts.rawParams,
            params: validatedParams,
            result: errMsg,
            mcpServerName,
        };
        const swapped = onReplaceLastMessage(errorMessage);
        if (!swapped) onAddMessage(errorMessage);
        return {};
    }

    // ── Step 7: Record success ─────────────────────────────────────────────────
    const successMessage: ToolMessage<WebToolName> = {
        role: "tool",
        type: "success",
        id: toolId,
        name: toolName,
        content: toolResultStr,
        rawParams: opts.rawParams,
        params: validatedParams,
        result: toolResult,
        mcpServerName,
    };

    const swappedSuccess = onReplaceLastMessage(successMessage);
    if (!swappedSuccess) onAddMessage(successMessage);

    return {};
}

// ── Checkpoint helper ─────────────────────────────────────────────────────────

function _addUserCheckpoint(callbacks: AgentCallbacks): void {
    // Snapshot files that were written in this session
    // For simplicity we add an empty checkpoint — the store
    // can enrich this with actual file contents before saving
    callbacks.onAddCheckpoint({
        role: "checkpoint",
        type: "user_edit",
        snapshotByPath: {},
        userModifications: { snapshotByPath: {} },
    });
}

// ── Tool definitions (AI SDK v6) ──────────────────────────────────────────────
// Must use tool() + z.object() — plain { description, parameters } objects are
// NOT assignable to ToolSet in v6 and cause a type error.

const READ_TOOLS = {
    read_file: tool({
        description: 'Read the contents of a file at a given path.',
        inputSchema: z.object({
            filePath: z.string().describe('Full path to the file.'),
            startLine: z.number().optional().describe('Optional start line (1-indexed).'),
            endLine: z.number().optional().describe('Optional end line (1-indexed).'),
        }),
    }),
    search_files: tool({
        description: 'Search for files whose content matches a query.',
        inputSchema: z.object({
            query: z.string().describe('Search query or regex.'),
            isRegex: z.boolean().optional(),
            includePattern: z.string().optional().describe('Glob pattern to limit search.'),
        }),
    }),
    search_in_file: tool({
        description: 'Find all line numbers where a query matches in a specific file.',
        inputSchema: z.object({
            filePath: z.string().describe('Full path to the file.'),
            query: z.string().describe('Search query or regex.'),
            isRegex: z.boolean().optional(),
        }),
    }),
    list_directory: tool({
        description: 'List files and folders in a directory.',
        inputSchema: z.object({
            dirPath: z.string().describe('Full path to the directory.'),
        }),
    }),
} as const;

const AGENT_TOOLS = {
    ...READ_TOOLS,
    write_file: tool({
        description: 'Write or overwrite a file with new content.',
        inputSchema: z.object({
            filePath: z.string(),
            content: z.string(),
        }),
    }),
    create_file: tool({
        description: 'Create a new file or folder.',
        inputSchema: z.object({
            filePath: z.string(),
            isFolder: z.boolean().optional(),
        }),
    }),
    delete_file: tool({
        description: 'Delete a file or folder.',
        inputSchema: z.object({
            filePath: z.string(),
            recursive: z.boolean().optional(),
        }),
    }),
    run_terminal: tool({
        description: 'Run a terminal command and return the output.',
        inputSchema: z.object({
            command: z.string(),
            cwd: z.string().optional(),
        }),
    }),
} as const;

function _buildAnthropicTools(chatMode: ChatMode) {
    if (chatMode === 'normal') return undefined;
    if (chatMode === 'gather') return READ_TOOLS;
    return AGENT_TOOLS;
}


export function buildChatSystemMessage(chatMode: ChatMode): string {
    const modeDesc =
        chatMode === "agent"
            ? "an expert coding agent. You can read files, write files, run terminal commands, and search the codebase to complete tasks."
            : chatMode === "gather"
                ? "an expert coding assistant. You can read files and search the codebase to answer questions."
                : "an expert coding assistant.";

    return `You are ${modeDesc}

Rules:
1. Always think step by step before making changes.
2. When editing files, read them first to understand context.
3. Be concise — prefer code over lengthy explanations.
4. If you use a tool, wait for the result before proceeding.
5. Never modify files outside the user's workspace.
6. Today's date is ${new Date().toDateString()}.`;
}

// Converts our ChatMessage array to AI SDK v6 ModelMessage format.
// Handles all message roles including tool calls and results.
// v6: ModelMessage replaces CoreMessage — import { type ModelMessage } from 'ai'
export function convertMessagesToLLM(
    messages: ChatMessage[],
    chatMode: ChatMode
): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const msg of messages) {
        // Skip checkpoints — they're internal state, not LLM context
        if (msg.role === "checkpoint") continue;
        if (msg.role === "interrupted_tool") continue;

        if (msg.role === "user") {
            // Replace empty content with placeholder so Anthropic doesn't reject it
            result.push({
                role: "user",
                content: msg.content || "(empty)",
            });
            continue;
        }

        if (msg.role === "assistant") {
            const content = msg.displayContent || "(empty)";
            result.push({ role: "assistant", content });
            continue;
        }

        if (msg.role === "tool") {
            // Only send completed tool calls to LLM
            if (msg.type === "success" || msg.type === "tool_error") {
                result.push({
                    role: "tool",
                    content: [
                        {
                            type: "tool-result",
                            toolCallId: msg.id,
                            toolName: msg.name,
                            // v6: ToolResultOutput = { type: 'text', value: string }
                            output: { type: 'text' as const, value: msg.content },
                        },
                    ],
                });
            }
        }
    }

    return result;
}