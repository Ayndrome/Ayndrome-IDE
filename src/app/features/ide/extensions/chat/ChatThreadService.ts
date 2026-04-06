// src/app/features/ide/extensions/chat/ChatThreadService.ts
// Phase 6 update: wires context trimming, self-correction, workspace context,
// tool deduplication, auto-lint heal, and max steps guard into the agent loop.

import { api } from "../../../../../../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { streamText, tool, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
    ChatThread, ChatMessage, WebToolName,
    WebToolCallParams, WebToolResult,
    ToolMessage, ThreadStreamState, ChatMode,
    CheckpointEntry, AnthropicReasoning,
    approvalTypeOfWebTool, RawToolParams, LintError,
} from "./types/types";

// ── Phase 6 imports ───────────────────────────────────────────────────────────
import { trimMessagesForContext } from "./agent/context-trimmer";
import {
    shouldAttemptCorrection,
    recordCorrectionAttempt,
    clearCorrectionState,
    buildCorrectionContext,
} from "./agent/self-corrector";
import {
    buildWorkspaceContextBlock,
    fetchWorkspaceSnapshot,
    type WorkspaceSnapshot,
} from "./agent/workspace-context";
import {
    startNewRun,
    clearCache,
    getCachedFile,
    setCachedFile,
    invalidateFile,
} from "./agent/tool-cache";
import {
    runLinter,
    canHeal,
    recordHealRound,
    resetHealState,
    buildLintFeedback,
} from "./agent/lint-healer";
import {
    resetStepsGuard,
    incrementToolCallCount,
    hasReachedLimit,
    isApproachingLimit,
    buildApproachingLimitWarning,
    buildLimitReachedMessage,
} from "./agent/steps-guard";

import {
    classifyTaskComplexity,
    generatePlan,
    markStepStarted,
    markStepDone,
    markStepFailed,
    finalizePlan,
    matchMessageToStep,
} from "./agent/task-planner";
import type { AgentPlan } from "./types/plan-types";
import {
    onToolSuccess,
    onToolFailure,
    onAssistantMessage,
    isAgentStuck,
} from "./hooks/reasoning-hooks";
import { Id } from "@/convex/_generated/dataModel";
import { getModelInstance, getProviderOptions, getMaxOutputTokens }
    from "@/src/lib/model-provider/model-router";
import { useProviderStore }
    from "@/src/lib/model-provider/provider-store";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAT_RETRIES = 3;
const RETRY_DELAY = 1000;
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const API_BASE = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE ?? "")
    : "";

// ── Convex storage ────────────────────────────────────────────────────────────

let _convexClient: ConvexReactClient | null = null;

let _globalAutoApproveEdits = false;

export function setAutoApproveEdits(value: boolean): void {
    _globalAutoApproveEdits = value;
}

export function initChatStorage(client: ConvexReactClient): void {
    _convexClient = client;
}

function getClient(): ConvexReactClient {
    if (!_convexClient) throw new Error(
        "Chat storage not initialized. Call initChatStorage() first."
    );
    return _convexClient;
}

export async function loadAllThreads(
    workspaceId: string
): Promise<Record<string, ChatThread>> {
    try {
        const client = getClient();
        const threads = await client.query(
            api.chatThreads.getAllThreads,
            { workspaceId: workspaceId as Id<"workspaces"> }
        );
        const result: Record<string, ChatThread> = {};
        for (const t of threads ?? []) {
            try {
                result[t.threadId] = JSON.parse(t.data) as ChatThread;
            } catch {
                console.error(`[ChatStorage] Corrupt thread ${t.threadId} — skipping`);
            }
        }
        return result;
    } catch (e) {
        console.error("[ChatStorage] Failed to load threads:", e);
        return {};
    }
}

export async function saveThread(
    thread: ChatThread,
    workspaceId: string
): Promise<void> {
    try {
        const client = getClient();
        await client.mutation(api.chatThreads.upsertThread, {
            threadId: thread.id,
            workspaceId: workspaceId as Id<"workspaces">,
            title: thread.title,
            data: JSON.stringify(thread),
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

// ── Workspace context ─────────────────────────────────────────────────────────

let _currentWorkspaceId: string | null = null;
let _currentWorkspaceName: string | null = null;

export function setAgentWorkspace(
    workspaceId: string,
    workspaceName?: string,
): void {
    _currentWorkspaceId = workspaceId;
    _currentWorkspaceName = workspaceName ?? "workspace";
    console.log(`[ChatThreadService] Agent workspace: ${workspaceId}`);
}

export function getAgentWorkspace(): string | null {
    return _currentWorkspaceId;
}

function requireWorkspaceId(): string {
    if (!_currentWorkspaceId) throw new Error(
        "No workspace set. Call setAgentWorkspace() first."
    );
    return _currentWorkspaceId;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiPost<T>(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`API error (${res.status}): ${err}`);
    }
    return res.json() as Promise<T>;
}

async function apiGet<T>(
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}${path}?${qs}`, { signal });
    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`API error (${res.status}): ${err}`);
    }
    return res.json() as Promise<T>;
}

// ── Tool implementations ──────────────────────────────────────────────────────

export const toolImplementations: {
    [T in keyof WebToolCallParams & keyof WebToolResult]: (
        params: WebToolCallParams[T],
        signal?: AbortSignal,
        onProgress?: (chunk: string) => void,
    ) => Promise<WebToolResult[T]>;
} = {

    read_file: async ({ filePath, startLine, endLine }, signal) => {
        const workspaceId = requireWorkspaceId();

        // ── Phase 6: tool cache ────────────────────────────────────────────
        // Only use cache for full-file reads (no line range)
        if (!startLine && !endLine) {
            const cached = getCachedFile(filePath);
            if (cached !== null) {
                return {
                    content: cached,
                    totalLines: cached.split("\n").length,
                    truncated: false,
                };
            }
        }

        const params: Record<string, string> = { workspaceId, path: filePath, type: "file" };
        if (startLine != null) params.startLine = String(startLine);
        if (endLine != null) params.endLine = String(endLine);

        const result = await apiGet<WebToolResult["read_file"]>(
            "/api/files", params, signal
        );

        // Cache full reads
        if (!startLine && !endLine && result.content) {
            setCachedFile(filePath, result.content);
        }

        return result;
    },

    // write_file: async ({ filePath, content }, signal) => {
    //     const workspaceId = requireWorkspaceId();

    //     const result = await apiPost<WebToolResult["write_file"]>("/api/files", {
    //         workspaceId, path: filePath, content, action: "write",
    //     }, signal);

    //     // ── Phase 6: invalidate cache on write ─────────────────────────────
    //     invalidateFile(filePath);

    //     return result;
    // },

    // src/app/features/ide/extensions/chat/ChatThreadService.ts
    // Replace write_file implementation with streaming version

    write_file: async ({ filePath, content }, signal) => {
        const workspaceId = requireWorkspaceId();

        // Dynamic imports avoid circular deps
        const { useStreamingWriterStore } = await import(
            "@/src/store/streaming-writer-store"
        );
        const { useEditorStore } = await import("@/src/store/editor-store");
        const { useIDEStore } = await import("@/src/store/ide-store");
        const { computeFileDiff } = await import("./agent/diff-engine");
        const { useDiffStore } = await import("@/src/store/diff-store");

        const streamStore = useStreamingWriterStore.getState();
        const editorStore = useEditorStore.getState();
        const ideStore = useIDEStore.getState();

        // ── Step 1: read current file content ─────────────────────────────────────
        let oldContent = "";
        try {
            const res = await apiGet<{ content?: string }>(
                "/api/files",
                { workspaceId, path: filePath, type: "file" },
                signal,
            );
            oldContent = res.content ?? "";
        } catch {
            oldContent = "";  // new file
        }

        // ── Step 2: ensure file is open in editor ─────────────────────────────────
        const isOpen = editorStore.tabs.find(t => t.relativePath === filePath);
        if (!isOpen) {
            editorStore.openFile(
                filePath,
                ideStore.projectId as any,
                filePath.split("/").pop() ?? filePath,
                oldContent,
            );
            // Small delay so CodeEditor mounts and registers its view
            await new Promise(r => setTimeout(r, 80));
        }

        // ── Step 3: start streaming session ──────────────────────────────────────
        streamStore.startStream({ filePath, oldContent });

        // ── Step 4: stream content chunk by chunk ─────────────────────────────────
        // Simulate streaming by splitting content into character chunks.
        // In production, the agent would stream via SSE — this gives the
        // same visual effect for content the agent generates all at once.

        const CHUNK_SIZE = 8;       // chars per chunk — tune for visual effect
        const CHUNK_DELAY = 6;      // ms between chunks — ~166 chunks/sec

        if (signal?.aborted) {
            streamStore.abortStream(filePath);
            invalidateFile(filePath);
            return { success: false, lintErrors: [] };
        }

        // Stream in chunks
        for (let i = 0; i < content.length; i += CHUNK_SIZE) {
            if (signal?.aborted) {
                streamStore.abortStream(filePath);
                invalidateFile(filePath);
                return { success: false, lintErrors: [] };
            }

            const chunk = content.slice(i, i + CHUNK_SIZE);
            streamStore.writeChunk(filePath, chunk);

            // Yield to browser between chunks so UI stays responsive
            await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }

        // ── Step 5: streaming done — hand off to diff-store ───────────────────────
        await streamStore.endStream(filePath, _globalAutoApproveEdits);

        invalidateFile(filePath);
        return { success: true, lintErrors: [] };
    },

    create_file: async ({ filePath, isFolder }, signal) => {
        const workspaceId = requireWorkspaceId();
        return apiPost<WebToolResult["create_file"]>("/api/files", {
            workspaceId, path: filePath, isFolder: isFolder ?? false, action: "create",
        }, signal);
    },

    delete_file: async ({ filePath, recursive }, signal) => {
        const workspaceId = requireWorkspaceId();
        invalidateFile(filePath);
        return apiPost<WebToolResult["delete_file"]>("/api/files", {
            workspaceId, path: filePath, recursive: recursive ?? false, action: "delete",
        }, signal);
    },

    search_in_file: async ({ filePath, query, isRegex }, signal) => {
        const workspaceId = requireWorkspaceId();
        return apiGet<WebToolResult["search_in_file"]>("/api/files", {
            workspaceId, path: filePath, query,
            isRegex: String(isRegex ?? false), type: "search-in-file",
        }, signal);
    },

    search_files: async ({ query, isRegex, includePattern }, signal) => {
        const workspaceId = requireWorkspaceId();
        const params: Record<string, string> = { workspaceId, query, type: "search" };
        if (isRegex) params.isRegex = "true";
        if (includePattern) params.includePattern = includePattern;
        return apiGet<WebToolResult["search_files"]>("/api/files", params, signal);
    },

    list_directory: async ({ dirPath }, signal) => {
        const workspaceId = requireWorkspaceId();
        return apiGet<WebToolResult["list_directory"]>("/api/files", {
            workspaceId, path: dirPath, type: "dir",
        }, signal);
    },

    run_terminal: async ({ command, cwd }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();

        if (onProgress) {
            return new Promise<WebToolResult["run_terminal"]>(async (resolve, reject) => {
                try {
                    const res = await fetch(`${API_BASE}/api/terminal`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            workspaceId, command,
                            cwd: cwd ?? "/workspace", stream: true,
                        }),
                        signal,
                    });
                    if (!res.ok) throw new Error(`Terminal API error: ${res.statusText}`);
                    if (!res.body) throw new Error("No response body");

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    let output = "";
                    let exitCode = 0;
                    let timedOut = false;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n\n");
                        buffer = lines.pop() ?? "";
                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const event = JSON.parse(line.slice(6));
                                if (event.type === "chunk") {
                                    output += event.data;
                                    onProgress(event.data);
                                } else if (event.type === "done") {
                                    exitCode = event.exitCode ?? 0;
                                    timedOut = event.timedOut ?? false;
                                } else if (event.type === "error") {
                                    throw new Error(event.message);
                                }
                            } catch { }
                        }
                    }
                    resolve({ output, exitCode, timedOut });
                } catch (err: any) {
                    if (err?.name === "AbortError") {
                        resolve({ output: "", exitCode: -1, timedOut: false });
                    } else {
                        reject(err);
                    }
                }
            });
        }


        return apiPost<WebToolResult["run_terminal"]>("/api/terminal", {
            workspaceId, command, cwd: cwd ?? "/workspace", stream: false,
        }, signal);
    },

    start_terminal: async ({ name, command }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();

        const res = await apiPost<{ session: any }>("/api/terminal/persistent?action=start", {
            workspaceId, name, command,
        }, signal);

        onProgress?.(`Started terminal session "${name}"${command ? ` → running: ${command}` : ""}\n`);
        return { success: true, sessionName: name, pid: res.session.pid };
    },

    run_in_terminal: async ({ name, command, timeoutMs }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();

        return new Promise(async (resolve, reject) => {
            try {
                const res = await fetch(`/api/terminal/persistent?action=run`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ workspaceId, name, command, timeoutMs }),
                    signal,
                });

                if (!res.ok) throw new Error(`Terminal error: ${res.statusText}`);
                if (!res.body) throw new Error("No response body");

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let output = "";
                let exitCode = 0;
                let timedOut = false;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        if (!line.startsWith("data: ")) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === "chunk") {
                                output += event.data;
                                onProgress?.(event.data);
                            } else if (event.type === "done") {
                                exitCode = event.exitCode ?? 0;
                                timedOut = event.timedOut ?? false;
                            } else if (event.type === "error") {
                                throw new Error(event.message);
                            }
                        } catch { }
                    }
                }

                resolve({ output, exitCode, timedOut });
            } catch (err: any) {
                if (err?.name === "AbortError") {
                    resolve({ output: "", exitCode: -1, timedOut: false });
                } else {
                    reject(err);
                }
            }
        });
    },

    read_terminal: async ({ name, lines }, signal) => {
        const workspaceId = requireWorkspaceId();
        const params = new URLSearchParams({
            workspaceId,
            name,
            action: "read",
            lines: String(lines ?? 50),
        });
        const res = await fetch(`/api/terminal/persistent?${params}`, { signal });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return { output: data.output };
    },

    kill_terminal: async ({ name }, signal) => {
        const workspaceId = requireWorkspaceId();
        await apiPost("/api/terminal/persistent?action=kill", { workspaceId, name }, signal);
        return { success: true };
    },

    start_server: async ({ command, port, name }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();

        // Start as a named persistent session
        await apiPost("/api/terminal/persistent?action=start", {
            workspaceId,
            name: name ?? `dev-server-${port}`,
            command,
        }, signal);

        onProgress?.(`Starting server: ${command}\n`);

        // Wait until port is accepting connections
        const waitResult = await apiPost<{ ready: boolean; timeMs: number; error?: string }>(
            "/api/playwright",
            {
                action: "wait_ready",
                url: `http://localhost:${port}`,
                timeoutMs: 45_000,
            },
            signal,
        );

        if (!waitResult.ready) {
            throw new Error(`Server didn't start within 45s on port ${port}: ${waitResult.error}`);
        }

        onProgress?.(`Server ready on port ${port} (${waitResult.timeMs}ms)\n`);
        return { success: true, port, timeMs: waitResult.timeMs };
    },

    take_screenshot: async ({ url, fullPage, viewport, selector }, signal) => {
        const workspaceId = requireWorkspaceId();
        const result = await apiPost<{
            base64: string; width: number; height: number; url: string; timestamp: number;
        }>("/api/playwright", {
            action: "screenshot",
            workspaceId,
            url: url ?? "http://localhost:3000",
            fullPage: fullPage ?? false,
            viewport: viewport ?? { width: 1280, height: 800 },
            selector,
        }, signal);
        return result;
    },

    capture_page_state: async ({ url, viewport }, signal) => {
        const workspaceId = requireWorkspaceId();
        return apiPost<{
            screenshot: { base64: string; width: number; height: number };
            consoleErrors: string[];
            networkErrors: string[];
            domSnapshot: string;
            title: string;
            url: string;
        }>("/api/playwright", {
            action: "page_state",
            workspaceId,
            url: url ?? "http://localhost:3000",
            viewport: viewport ?? { width: 1280, height: 800 },
        }, signal);
    },

    interact_with_page: async ({ url, steps, screenshotOnEachStep }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();
        const result = await apiPost<{
            steps: Array<{ step: any; success: boolean; error?: string; screenshotBase64?: string }>;
            finalScreenshot: { base64: string };
            passed: boolean;
            errors: string[];
        }>("/api/playwright", {
            action: "interact",
            workspaceId,
            url: url ?? "http://localhost:3000",
            steps,
            screenshotOnEachStep: screenshotOnEachStep ?? false,
        }, signal);

        const failedSteps = result.steps.filter(s => !s.success);
        if (failedSteps.length > 0) {
            onProgress?.(`⚠ ${failedSteps.length} step(s) failed:\n`);
            for (const s of failedSteps) {
                onProgress?.(`  - ${s.step.action}: ${s.error}\n`);
            }
        } else {
            onProgress?.(`✓ All ${result.steps.length} steps passed\n`);
        }

        return result;
    },

    run_tests: async ({ testFile, pattern, stream: streamOutput }, signal, onProgress) => {
        const workspaceId = requireWorkspaceId();

        if (streamOutput && onProgress) {
            return new Promise(async (resolve, reject) => {
                try {
                    const res = await fetch("/api/playwright", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "run_tests",
                            workspaceId,
                            testFile,
                            pattern,
                            stream: true,
                            timeout: 120_000,
                        }),
                        signal,
                    });

                    if (!res.ok) throw new Error(`Test runner error: ${res.statusText}`);
                    const reader = res.body!.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    let finalResult: any = null;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n\n");
                        buffer = lines.pop() ?? "";
                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const event = JSON.parse(line.slice(6));
                                if (event.type === "chunk") onProgress(event.data);
                                if (event.type === "done") finalResult = event.result;
                                if (event.type === "error") throw new Error(event.message);
                            } catch { }
                        }
                    }
                    resolve(finalResult ?? { passed: 0, failed: 0, skipped: 0, output: "", duration: 0, failures: [] });
                } catch (err: any) {
                    if (err?.name === "AbortError") {
                        resolve({ passed: 0, failed: 0, skipped: 0, output: "Aborted", duration: 0, failures: [] });
                    } else {
                        reject(err);
                    }
                }
            });
        }

        return apiPost("/api/playwright", {
            action: "run_tests",
            workspaceId,
            testFile,
            pattern,
            timeout: 120_000,
        }, signal);
    },

};

// ── File snapshot helpers ─────────────────────────────────────────────────────

export async function takeFileSnapshot(filePath: string): Promise<string | null> {
    try {
        const result = await toolImplementations.read_file({ filePath });
        return result.content;
    } catch { return null; }
}

export async function restoreFileSnapshot(
    filePath: string,
    content: string,
): Promise<void> {
    await toolImplementations.write_file({ filePath, content });
}

// ── Param validation ──────────────────────────────────────────────────────────

export function validateToolParams<T extends keyof WebToolCallParams>(
    toolName: T,
    raw: RawToolParams,
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
            return {
                query: r.query,
                isRegex: r.isRegex === "true",
                includePattern: r.includePattern,
            };
        },
        list_directory: (r) => {
            if (!r.dirPath) throw new Error("list_directory requires 'dirPath'");
            return { dirPath: r.dirPath };
        },
        run_terminal: (r) => {
            if (!r.command) throw new Error("run_terminal requires 'command'");
            return { command: r.command, cwd: r.cwd };
        },
        start_terminal: (r) => {
            if (!r.name) throw new Error("start_terminal requires 'name'");
            return { name: r.name, command: r.command };
        },
        run_in_terminal: (r) => {
            if (!r.name) throw new Error("run_in_terminal requires 'name'");
            if (!r.command) throw new Error("run_in_terminal requires 'command'");
            return { name: r.name, command: r.command, timeoutMs: r.timeoutMs ? Number(r.timeoutMs) : undefined };
        },
        read_terminal: (r) => {
            if (!r.name) throw new Error("read_terminal requires 'name'");
            return { name: r.name, lines: r.lines ? Number(r.lines) : undefined };
        },
        kill_terminal: (r) => {
            if (!r.name) throw new Error("kill_terminal requires 'name'");
            return { name: r.name };
        },
        start_server: (r) => {
            if (!r.command) throw new Error("start_server requires 'command'");
            if (!r.port) throw new Error("start_server requires 'port'");
            return { command: r.command, port: Number(r.port), name: r.name };
        },
        take_screenshot: (r) => {
            return {
                url: r.url,
                fullPage: r.fullPage === "true",
                selector: r.selector,
                viewport: r.viewport ? JSON.parse(r.viewport) : undefined,
            };
        },
        capture_page_state: (r) => {
            return {
                url: r.url,
                viewport: r.viewport ? JSON.parse(r.viewport) : undefined,
            };
        },
        interact_with_page: (r) => {
            if (!r.steps) throw new Error("interact_with_page requires 'steps'");
            return {
                url: r.url,
                steps: typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps as any,
                screenshotOnEachStep: r.screenshotOnEachStep === "true",
            };
        },
        run_tests: (r) => {
            return {
                testFile: r.testFile,
                pattern: r.pattern,
                stream: r.stream !== "false",
            };
        },
    };
    return validators[toolName](raw);
}

// ── Result stringification ────────────────────────────────────────────────────

export function stringifyToolResult<T extends keyof WebToolCallParams & keyof WebToolResult>(
    toolName: T,
    params: WebToolCallParams[T],
    result: WebToolResult[T],
): string {
    switch (toolName) {
        case "read_file": {
            const r = result as WebToolResult["read_file"];
            const p = params as WebToolCallParams["read_file"];
            const note = r.truncated ? `\n[Truncated — ${r.totalLines} total lines]` : "";
            return `${p.filePath}:\n${r.content}${note}`;
        }
        case "write_file": {
            const r = result as WebToolResult["write_file"];
            const p = params as WebToolCallParams["write_file"];
            const lint = r.lintErrors?.length
                ? `\nLint errors:\n${r.lintErrors.map(e => `  L${e.startLine}: ${e.message}`).join("\n")}`
                : "";
            return `Successfully wrote ${p.filePath}.${lint}`;
        }
        case "create_file":
            return `Created ${(params as WebToolCallParams["create_file"]).filePath}.`;
        case "delete_file":
            return `Deleted ${(params as WebToolCallParams["delete_file"]).filePath}.`;
        case "search_in_file": {
            const r = result as WebToolResult["search_in_file"];
            const p = params as WebToolCallParams["search_in_file"];
            return r.matchingLines.length
                ? `Matches in ${p.filePath} at lines: ${r.matchingLines.join(", ")}`
                : `No matches for "${p.query}" in ${p.filePath}.`;
        }
        case "search_files": {
            const r = result as WebToolResult["search_files"];
            if (!r.filePaths.length) return "No files matched.";
            return `Matching files:\n${r.filePaths.join("\n")}${r.hasMore ? "\n[More results exist]" : ""}`;
        }
        case "list_directory": {
            const r = result as WebToolResult["list_directory"];
            const p = params as WebToolCallParams["list_directory"];
            return `Contents of ${p.dirPath}:\n${r.entries.map(e =>
                `  ${e.isDirectory ? "📁" : "📄"} ${e.name}`
            ).join("\n")}`;
        }
        case "run_terminal": {
            const r = result as WebToolResult["run_terminal"];
            const exit = r.timedOut ? "[timed out]" : `[exit ${r.exitCode ?? "?"}]`;
            return `${exit}\n${r.output}`;
        }
        default: return JSON.stringify(result);
    }
}

// ── Agent callbacks type ──────────────────────────────────────────────────────

export type AgentCallbacks = {
    threadId: string;
    onStreamStateChange: (state: ThreadStreamState) => void;
    onAddMessage: (message: ChatMessage) => void;
    onReplaceLastMessage: (message: ChatMessage) => boolean;
    onAddCheckpoint: (checkpoint: CheckpointEntry) => void;
    getMessages: () => ChatMessage[];
    onNotify: (opts: { message: string; type: "success" | "error" }) => void;
    chatMode: ChatMode;
    autoApproveEdits: boolean;
    autoApproveTerminal: boolean;
    // Phase 6: editor state for workspace context injection
    activeFilePath?: string | null;
    openFilePaths?: string[];
    workspaceName?: string;

    planMode: boolean;    // true = plan first, false = quick mode
    onAddPlan: (plan: AgentPlan) => void;
    onUpdatePlan: (plan: AgentPlan) => void;
    getCurrentPlan: () => AgentPlan | null;
};

// ── Main agent entry point ────────────────────────────────────────────────────

export async function runChatAgent(
    callbacks: AgentCallbacks,
    opts: {
        callThisToolFirst?: ToolMessage<WebToolName> & { type: "tool_request" };
        abortSignal?: AbortSignal;
    } = {}
): Promise<void> {
    const { callThisToolFirst, abortSignal } = opts;
    const {
        onStreamStateChange, onAddMessage,
        chatMode,
    } = callbacks;

    // ── Phase 6: init per-run state ───────────────────────────────────────────
    const runId = `run-${Date.now()}`;
    startNewRun(runId);
    resetStepsGuard();
    resetHealState();

    // ── Phase 6: fetch workspace context snapshot ─────────────────────────────
    let workspaceSnapshot: WorkspaceSnapshot | null = null;
    let activePlan: AgentPlan | null = null;

    if (callbacks.planMode && chatMode === "agent" && !callThisToolFirst) {
        const messages = callbacks.getMessages();
        const lastUserMsg = [...messages].reverse().find(m => m.role === "user");

        if (lastUserMsg) {
            const complexity = classifyTaskComplexity(
                typeof lastUserMsg.content === "string"
                    ? lastUserMsg.content
                    : ""
            );

            if (complexity === "complex") {
                const plan = await generatePlan(
                    typeof lastUserMsg.content === "string"
                        ? lastUserMsg.content
                        : "",
                    workspaceSnapshot,
                    abortSignal,
                );

                if (plan) {
                    activePlan = plan;
                    callbacks.onAddPlan(plan);
                }
            }
        }
    }


    if (_currentWorkspaceId && chatMode !== "normal") {
        try {
            workspaceSnapshot = await fetchWorkspaceSnapshot(
                _currentWorkspaceId,
                callbacks.workspaceName ?? _currentWorkspaceName ?? "workspace",
                callbacks.activeFilePath ?? null,
                callbacks.openFilePaths ?? [],
            );
        } catch {
            // best-effort — continue without context
        }
    }

    let interruptedWhenIdle = false;

    onStreamStateChange({
        status: "idle",
        workspaceId: requireWorkspaceId(),
        abort: () => { interruptedWhenIdle = true; },
    });

    // Pre-approved tool run (resume after user approval)
    if (callThisToolFirst) {
        incrementToolCallCount();
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
            abortSignal,
        );
        if (interrupted) {
            onStreamStateChange(undefined);
            _addUserCheckpoint(callbacks);
            return;
        }
    }

    let shouldSendAnotherMessage = true;
    let isRunningWhenEnd: "awaiting_user" | undefined = undefined;

    while (shouldSendAnotherMessage) {
        shouldSendAnotherMessage = false;
        isRunningWhenEnd = undefined;

        // ── Phase 6: steps guard ──────────────────────────────────────────────
        if (hasReachedLimit()) {
            onAddMessage({
                role: "assistant",
                displayContent: buildLimitReachedMessage(),
                reasoning: "",
                anthropicReasoning: null,
            });
            onStreamStateChange(undefined);
            break;
        }

        onStreamStateChange({
            status: "idle",
            workspaceId: requireWorkspaceId(),
            abort: () => { interruptedWhenIdle = true; },
        });

        if (interruptedWhenIdle || abortSignal?.aborted) {
            onStreamStateChange(undefined);
            return;
        }

        const currentMessages = callbacks.getMessages();

        // ── Phase 6: context trimming ─────────────────────────────────────────
        const rawLLMMessages = convertMessagesToLLM(currentMessages, chatMode);
        const llmMessages = trimMessagesForContext(rawLLMMessages);

        // ── Phase 6: approaching limit warning ────────────────────────────────
        const systemMessage = isApproachingLimit()
            ? buildChatSystemMessage(chatMode, workspaceSnapshot) +
            "\n\n" + buildApproachingLimitWarning()
            : buildChatSystemMessage(chatMode, workspaceSnapshot);

        let shouldRetry = true;
        let nAttempts = 0;

        while (shouldRetry) {
            shouldRetry = false;
            nAttempts += 1;

            type LLMResult =
                | { type: "done"; text: string; reasoning: string; anthropicReasoning: AnthropicReasoning[] | null; toolCall: RawToolCall | null }
                | { type: "error"; error: Error }
                | { type: "aborted" };

            let resolveLLM!: (r: LLMResult) => void;
            const llmDonePromise = new Promise<LLMResult>(
                (res) => { resolveLLM = res; }
            );

            const llmAbortController = new AbortController();
            abortSignal?.addEventListener(
                "abort",
                () => llmAbortController.abort(),
                { once: true }
            );

            onStreamStateChange({
                status: "streaming",
                workspaceId: requireWorkspaceId(),
                partialText: "",
                partialReasoning: "",
                partialToolCall: null,
                abort: () => llmAbortController.abort(),
            });

            let accumulatedText = "";
            let accumulatedReasoning = "";
            let detectedToolCall: RawToolCall | null = null;
            let streamSettled = false;

            try {
                // const thinkingEnabled = chatMode === "agent";

                // const stream = streamText({
                //     model: anthropic("claude-sonnet-4-6"),
                //     system: systemMessage,
                //     messages: llmMessages,
                //     maxOutputTokens: thinkingEnabled ? 16000 : 4096,
                //     temperature: thinkingEnabled ? 1 : 0.3,
                //     abortSignal: llmAbortController.signal,
                //     tools: _buildAnthropicTools(chatMode),
                //     ...(thinkingEnabled && {
                //         providerOptions: {
                //             anthropic: {
                //                 thinking: { type: "enabled", budgetTokens: 10000 },
                //             },
                //         },
                //     }),
                // });


                const providerStore = useProviderStore.getState();
                const modelSelection = providerStore.getEffectiveModel(callbacks.threadId);
                const credentials = providerStore.credentials[modelSelection.provider] ?? {};
                const providerOptions = getProviderOptions(modelSelection);
                const maxOutputTokens = getMaxOutputTokens(modelSelection, chatMode);

                let modelInstance: Awaited<ReturnType<typeof getModelInstance>>;
                try {
                    modelInstance = await getModelInstance(modelSelection, credentials);
                } catch (err: any) {
                    resolveLLM({ type: "error", error: new Error(`Model init failed: ${err.message}`) });
                    continue;
                }

                const thinkingEnabled =
                    chatMode === "agent" &&
                    (modelSelection.reasoningEnabled ?? false);

                const stream = streamText({
                    model: modelInstance,
                    system: systemMessage,
                    messages: llmMessages,
                    maxOutputTokens,
                    temperature: thinkingEnabled ? 1 : 0.3,
                    abortSignal: llmAbortController.signal,
                    tools: _buildAnthropicTools(chatMode),
                    ...(providerOptions && { providerOptions: providerOptions as any }),
                });

                for await (const chunk of stream.fullStream) {
                    if (llmAbortController.signal.aborted) break;

                    switch (chunk.type) {
                        case "text-delta": {
                            accumulatedText += chunk.text;
                            onStreamStateChange({
                                status: "streaming",
                                workspaceId: requireWorkspaceId(),
                                partialText: accumulatedText,
                                partialReasoning: accumulatedReasoning,
                                partialToolCall: detectedToolCall
                                    ? { name: detectedToolCall.toolName, rawParams: detectedToolCall.input as RawToolParams }
                                    : null,
                                abort: () => llmAbortController.abort(),
                            });
                            break;
                        }
                        case "reasoning-delta": {
                            accumulatedReasoning += (chunk as any).text ?? "";
                            break;
                        }
                        case "tool-call": {
                            detectedToolCall = {
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                input: (chunk as any).input ?? {},
                            };
                            break;
                        }
                        case "finish": {
                            if (!streamSettled) {
                                streamSettled = true;
                                resolveLLM({
                                    type: "done",
                                    text: accumulatedText,
                                    reasoning: accumulatedReasoning,
                                    anthropicReasoning: null,
                                    toolCall: detectedToolCall,
                                });
                            }
                            break;
                        }
                        case "error": {
                            if (!streamSettled) {
                                streamSettled = true;
                                resolveLLM({ type: "error", error: (chunk as any).error as Error });
                            }
                            break;
                        }
                    }
                }

                if (!streamSettled) {
                    streamSettled = true;
                    if (llmAbortController.signal.aborted) {
                        resolveLLM({ type: "aborted" });
                    } else {
                        resolveLLM({
                            type: "done", text: accumulatedText,
                            reasoning: accumulatedReasoning,
                            anthropicReasoning: null, toolCall: detectedToolCall,
                        });
                    }
                }

            } catch (err: any) {
                if (!streamSettled) {
                    streamSettled = true;
                    if (err?.name === "AbortError" || llmAbortController.signal.aborted) {
                        resolveLLM({ type: "aborted" });
                    } else {
                        resolveLLM({ type: "error", error: err });
                    }
                }
            }

            const llmResult = await llmDonePromise;

            if (llmResult.type === "aborted") {
                if (accumulatedText || detectedToolCall) {
                    onAddMessage({
                        role: "assistant", displayContent: accumulatedText,
                        reasoning: accumulatedReasoning, anthropicReasoning: null,
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
                    shouldRetry = true;
                    onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });
                    await sleep(RETRY_DELAY * nAttempts);
                    if (interruptedWhenIdle || abortSignal?.aborted) {
                        onStreamStateChange(undefined);
                        return;
                    }
                    continue;
                }
                onAddMessage({
                    role: "assistant", displayContent: accumulatedText,
                    reasoning: "", anthropicReasoning: null,
                });
                onStreamStateChange({
                    status: "error",
                    message: llmResult.error.message ?? "An error occurred.",
                    fullError: llmResult.error,
                });
                _addUserCheckpoint(callbacks);
                return;
            }

            // LLM success
            const { text, reasoning, anthropicReasoning, toolCall } = llmResult;

            onAddMessage({
                role: "assistant", displayContent: text,
                reasoning, anthropicReasoning,
            });

            onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });

            if (toolCall) {
                // ── Phase 6: increment step counter ──────────────────────────
                incrementToolCallCount();

                const { awaitingUserApproval, interrupted } = await _runToolCall(
                    toolCall.toolName as WebToolName,
                    toolCall.toolCallId,
                    undefined,
                    { preapproved: false, rawParams: toolCall.input as RawToolParams },
                    callbacks,
                    abortSignal,
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

                onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });
            }

        } // end retry while
    } // end agent while

    if (activePlan) {
        const allDone = activePlan.steps.every(
            s => s.status === "done" || s.status === "skipped"
        );
        const anyFailed = activePlan.steps.some(s => s.status === "failed");
        const finalStatus = anyFailed ? "failed" : allDone ? "completed" : "aborted";
        callbacks.onUpdatePlan?.(finalizePlan(activePlan, finalStatus));
    }

    // Cleanup
    clearCache();

    if (isRunningWhenEnd === "awaiting_user") {
        onStreamStateChange({ status: "awaiting_user", workspaceId: requireWorkspaceId() });
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
    abortSignal?: AbortSignal,
): Promise<{ awaitingUserApproval?: boolean; interrupted?: boolean }> {
    const {
        onAddMessage, onReplaceLastMessage,
        onStreamStateChange, onAddCheckpoint,
        autoApproveEdits, autoApproveTerminal,
    } = callbacks;

    let validatedParams: any;

    if (!opts.preapproved) {
        try {
            if (toolName in toolImplementations) {
                validatedParams = validateToolParams(
                    toolName as keyof typeof toolImplementations,
                    opts.rawParams,
                );
            } else {
                validatedParams = opts.rawParams;
            }
        } catch (err: any) {
            onAddMessage({
                role: "tool", type: "invalid_params", id: toolId,
                name: toolName, content: err.message ?? "Invalid tool parameters",
                rawParams: opts.rawParams, result: null, mcpServerName,
            });
            return {};
        }

        if (toolName === "write_file" && validatedParams.filePath) {
            const snapshot = await takeFileSnapshot(validatedParams.filePath);
            if (snapshot !== null) {
                onAddCheckpoint({
                    role: "checkpoint", type: "tool_edit",
                    snapshotByPath: {
                        [validatedParams.filePath]: {
                            content: snapshot, timestamp: Date.now(),
                            filePath: validatedParams.filePath,
                        },
                    },
                    userModifications: { snapshotByPath: {} },
                });
            }
        }

        const approvalType = approvalTypeOfWebTool[toolName];
        if (approvalType) {
            const autoApproved =
                (approvalType === "edits" && autoApproveEdits) ||
                (approvalType === "terminal" && autoApproveTerminal);

            onAddMessage({
                role: "tool", type: "tool_request", id: toolId,
                name: toolName, content: "(Awaiting user permission...)",
                rawParams: opts.rawParams, params: validatedParams,
                result: null, mcpServerName,
            });

            if (!autoApproved) return { awaitingUserApproval: true };
        }
    } else {
        validatedParams = opts.validatedParams;
    }

    // Mark running
    const runningMsg: ToolMessage<WebToolName> = {
        role: "tool", type: "running_now", id: toolId, name: toolName,
        content: "(Running...)", rawParams: opts.rawParams,
        params: validatedParams, result: null, mcpServerName,
    };

    const currentPlan = callbacks.getCurrentPlan?.();
    if (currentPlan?.status === "executing") {
        const stepIdx = matchMessageToStep(currentPlan, toolName);
        if (stepIdx !== null) {
            const updated = markStepStarted(currentPlan, stepIdx, toolName);
            callbacks.onUpdatePlan?.(updated);
        }
    }

    const swapped = onReplaceLastMessage(runningMsg);
    if (!swapped) onAddMessage(runningMsg);

    const toolAbortController = new AbortController();
    abortSignal?.addEventListener("abort", () => toolAbortController.abort(), { once: true });

    let interrupted = false;

    const onProgress = (_chunk: string) => {
        // progress chunks handled by ToolCard — no state update needed here
    };

    onStreamStateChange({
        status: "tool_running", workspaceId: requireWorkspaceId(),
        toolName, toolParams: opts.rawParams,
        toolId, mcpServerName,
        abort: () => {
            interrupted = true;
            toolAbortController.abort();
        },
    });

    // Execute tool
    let toolResult: any;
    let toolResultStr: string;

    try {
        const impl = toolImplementations[toolName as keyof typeof toolImplementations];
        if (!impl) throw new Error(`Tool "${toolName}" is not implemented.`);

        toolResult = await impl(
            validatedParams,
            toolAbortController.signal,
            toolName === "run_terminal" ? onProgress : undefined,
        );

        if (interrupted) return { interrupted: true };

    } catch (err: any) {
        if (interrupted) return { interrupted: true };

        const errMsg = err.message ?? "Tool execution failed.";

        // ── Phase 6: self-correction ──────────────────────────────────────────
        if (shouldAttemptCorrection(toolName, toolId, errMsg)) {
            recordCorrectionAttempt(toolId);

            const correctionMsg = buildCorrectionContext(
                toolName, errMsg, opts.rawParams as Record<string, unknown>
            );

            // Add an assistant message with correction guidance
            // then return without error so the loop continues
            onAddMessage({
                role: "tool", type: "tool_error", id: toolId, name: toolName,
                content: `${errMsg}\n\n${correctionMsg}`,
                rawParams: opts.rawParams, params: validatedParams,
                result: errMsg, mcpServerName,
            });
            return {};
        }

        clearCorrectionState(toolId);

        const errorMsg: ToolMessage<WebToolName> = {
            role: "tool", type: "tool_error", id: toolId, name: toolName,
            content: errMsg, rawParams: opts.rawParams,
            params: validatedParams, result: errMsg, mcpServerName,
        };
        const s = onReplaceLastMessage(errorMsg);
        if (!s) onAddMessage(errorMsg);
        return {};
    }

    // Stringify result
    try {
        toolResultStr = stringifyToolResult(
            toolName as keyof typeof toolImplementations,
            validatedParams,
            toolResult,
        );
    } catch (err: any) {
        const errMsg = `Tool succeeded but failed to stringify: ${err.message}`;
        const errorMsg: ToolMessage<WebToolName> = {
            role: "tool", type: "tool_error", id: toolId, name: toolName,
            content: errMsg, rawParams: opts.rawParams,
            params: validatedParams, result: errMsg, mcpServerName,
        };
        const s = onReplaceLastMessage(errorMsg);
        if (!s) onAddMessage(errorMsg);
        return {};
    }

    // ── Phase 6: auto-lint heal after write_file ──────────────────────────────
    if (toolName === "write_file" && _currentWorkspaceId && validatedParams.filePath) {
        const filePath = validatedParams.filePath as string;

        if (canHeal(filePath)) {
            recordHealRound(filePath);

            try {
                const lintResult = await runLinter(_currentWorkspaceId, filePath);

                if (lintResult.hasErrors) {
                    const healRound = 1; // first heal
                    const feedback = buildLintFeedback(filePath, lintResult, healRound);

                    // Append lint feedback to the tool result
                    toolResultStr += `\n\n${feedback}`;

                    console.log(
                        `[LintHealer] Found ${lintResult.errorCount} errors in ${filePath} — feeding back to agent`
                    );
                }
            } catch {
                // lint check failing is never fatal
            }
        }
    }

    const planBeforeSuccess = callbacks.getCurrentPlan?.();
    if (planBeforeSuccess?.status === "executing") {
        const idx = planBeforeSuccess.currentStepIndex;
        const step = planBeforeSuccess.steps[idx];
        if (step?.status === "in_progress") {
            const updated = markStepDone(planBeforeSuccess, idx);
            callbacks.onUpdatePlan?.(updated);
        }
    }

    // chain of thought
    const reflectionContext = await onToolSuccess(
        toolName,
        opts.rawParams as Record<string, unknown>,
        toolResult,
        callbacks.getCurrentPlan?.() ?? null,
        callbacks.getCurrentPlan?.()?.currentStepIndex ?? null,
    );

    if (reflectionContext) {
        // Phase 10.5: inject reflection into next message
    }

    // Phase 10.5 stubs — disabled until reasoning hooks are implemented.
    // These hooks are currently no-ops; the variables they need (errMsg, text)
    // are only available in their respective scopes (error handler, LLM result).
    // Will be wired in when Phase 10.5 is implemented.

    // const failureStrategy = onToolFailure(
    //     toolName,
    //     errMsg,
    //     correctionAttempts.get(toolId) ?? 0,
    //     callbacks.getCurrentPlan?.() ?? null,
    // );
    // if (failureStrategy.shouldEscalate) { }

    // const planRevisionSignal = onAssistantMessage(
    //     text,
    //     callbacks.getCurrentPlan?.() ?? null,
    // );
    // if (planRevisionSignal.revision) { }

    // const stuck = isAgentStuck([], []);
    // if (stuck) { }

    // Record success
    const successMsg: ToolMessage<WebToolName> = {
        role: "tool", type: "success", id: toolId, name: toolName,
        content: toolResultStr, rawParams: opts.rawParams,
        params: validatedParams, result: toolResult, mcpServerName,
    };
    const s = onReplaceLastMessage(successMsg);
    if (!s) onAddMessage(successMsg);

    clearCorrectionState(toolId);
    return {};
}

// ── Checkpoint helper ─────────────────────────────────────────────────────────

function _addUserCheckpoint(callbacks: AgentCallbacks): void {
    callbacks.onAddCheckpoint({
        role: "checkpoint", type: "user_edit",
        snapshotByPath: {}, userModifications: { snapshotByPath: {} },
    });
}

// ── LLM tool definitions ──────────────────────────────────────────────────────

type RawToolCall = {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
};

const READ_TOOLS = {
    read_file: tool({
        description: "Read the contents of a file.",
        inputSchema: z.object({
            filePath: z.string().describe("Relative path from workspace root."),
            startLine: z.number().optional(),
            endLine: z.number().optional(),
        }),
    }),
    search_files: tool({
        description: "Search for files whose content matches a query.",
        inputSchema: z.object({
            query: z.string(),
            isRegex: z.boolean().optional(),
            includePattern: z.string().optional(),
        }),
    }),
    search_in_file: tool({
        description: "Find line numbers matching a query in a specific file.",
        inputSchema: z.object({
            filePath: z.string(),
            query: z.string(),
            isRegex: z.boolean().optional(),
        }),
    }),
    list_directory: tool({
        description: "List files and folders in a directory.",
        inputSchema: z.object({ dirPath: z.string() }),
    }),
} as const;

const AGENT_TOOLS = {
    ...READ_TOOLS,
    write_file: tool({
        description: "Write or overwrite a file with new content.",
        inputSchema: z.object({ filePath: z.string(), content: z.string() }),
    }),
    create_file: tool({
        description: "Create a new file or folder.",
        inputSchema: z.object({
            filePath: z.string(),
            isFolder: z.boolean().optional(),
        }),
    }),
    delete_file: tool({
        description: "Delete a file or folder.",
        inputSchema: z.object({
            filePath: z.string(),
            recursive: z.boolean().optional(),
        }),
    }),
    run_terminal: tool({
        description: "Run a terminal command in the workspace container.",
        inputSchema: z.object({
            command: z.string(),
            cwd: z.string().optional(),
        }),
    }),

    start_server: tool({
        description: [
            "Start a development server and wait until it's ready to accept requests.",
            "Use before taking screenshots or running browser tests.",
            "The server runs as a persistent terminal session.",
        ].join(" "),
        inputSchema: z.object({
            command: z.string().describe("Start command e.g. 'npm run dev'"),
            port: z.number().describe("Port the server will listen on"),
            name: z.string().optional().describe("Session name (default: dev-server-PORT)"),
        }),
    }),

    take_screenshot: tool({
        description: [
            "Take a screenshot of a URL and see what it looks like.",
            "Use to verify UI changes, check layout, or inspect visual bugs.",
            "The screenshot is shown in the preview pane.",
        ].join(" "),
        inputSchema: z.object({
            url: z.string().optional().describe("URL to screenshot (default: http://localhost:3000)"),
            fullPage: z.boolean().optional().describe("Capture full page scroll (default: false)"),
            selector: z.string().optional().describe("CSS selector to screenshot specific element"),
            viewport: z.object({
                width: z.number(),
                height: z.number(),
            }).optional().describe("Viewport size (default: 1280x800)"),
        }),
    }),

    capture_page_state: tool({
        description: [
            "Capture screenshot + console errors + network errors + DOM structure.",
            "More detailed than take_screenshot — use when debugging issues.",
            "Returns what's visible AND any errors happening behind the scenes.",
        ].join(" "),
        inputSchema: z.object({
            url: z.string().optional(),
            viewport: z.object({ width: z.number(), height: z.number() }).optional(),
        }),
    }),

    interact_with_page: tool({
        description: [
            "Interact with a web page — click, type, navigate, assert.",
            "Use to test user flows: login, form submission, navigation, etc.",
            "Each step is executed in sequence. Stops on assertion failure.",
        ].join(" "),
        inputSchema: z.object({
            url: z.string().optional(),
            steps: z.array(z.object({
                action: z.enum(["click", "type", "navigate", "wait", "waitForUrl", "hover",
                    "select", "press", "screenshot", "scroll", "clear", "assert"]),
                selector: z.string().optional(),
                text: z.string().optional(),
                url: z.string().optional(),
                key: z.string().optional(),
                value: z.string().optional(),
                direction: z.enum(["up", "down"]).optional(),
                timeoutMs: z.number().optional(),
                visible: z.boolean().optional(),
                pattern: z.string().optional(),
            })).describe("Ordered list of browser interaction steps"),
            screenshotOnEachStep: z.boolean().optional()
                .describe("Take screenshot after each step for debugging"),
        }),
    }),

    run_tests: tool({
        description: [
            "Run Playwright tests and return results.",
            "Write tests first with write_file to tests/*.spec.ts,",
            "then call this to execute them.",
            "Results stream live to the terminal panel.",
        ].join(" "),
        inputSchema: z.object({
            testFile: z.string().optional().describe("Specific test file to run"),
            pattern: z.string().optional().describe("Filter tests by name pattern"),
            stream: z.boolean().optional().describe("Stream output live (default: true)"),
        }),
    }),
} as const;

function _buildAnthropicTools(chatMode: ChatMode) {
    if (chatMode === "normal") return undefined;
    if (chatMode === "gather") return READ_TOOLS;
    return AGENT_TOOLS;
}

// ── Phase 6: system message now includes workspace context ────────────────────

export function buildChatSystemMessage(
    chatMode: ChatMode,
    snapshot?: WorkspaceSnapshot | null,
): string {
    const base =
        chatMode === "agent"
            ? "an expert coding agent with full access to read files, write files, run terminal commands, and search the codebase."
            : chatMode === "gather"
                ? "an expert coding assistant with read-only access to files and search."
                : "an expert coding assistant.";

    //     const rules = `
    // Rules:
    // 1. Think step by step before making changes.
    // 2. Read files before editing them — understand context first.
    // 3. After writing code, verify it compiles/runs using the terminal.
    // 4. If a command fails, read the error carefully and fix the root cause.
    // 5. Never modify files outside /workspace.
    // 6. Be concise — prefer code over lengthy explanations.
    // 7. Use 'tsx file.ts' directly instead of 'npx tsx file.ts' — tsx is pre-installed.
    // 8. Today's date: ${new Date().toDateString()}.`.trim();

    const rules = `
Rules:
1. Think step by step before making changes.
2. Read files before editing them — understand context first.
3. After writing code, run it to verify it works.
4. If a command fails, read the error carefully and fix the root cause.
5. Never modify files outside /workspace.
6. Be concise — prefer code over lengthy explanations.
7. Use 'tsx file.ts' directly instead of 'npx tsx file.ts'.
8. Today's date: ${new Date().toDateString()}.

Terminal guidance:
- Use run_terminal for quick one-off commands (build, lint, single test).
- Use start_terminal + run_in_terminal for stateful workflows:
    start_terminal({ name: "dev", command: "npm run dev" })
    → wait 2s →
    read_terminal({ name: "dev", lines: 20 })  ← check it started
    → now run tests in a separate session
    run_in_terminal({ name: "test", command: "npm test" })
- Use read_terminal to check if a server is ready before making requests.
- Always kill_terminal when done with a long-running session.
- Session names should be descriptive: "dev-server", "test-runner", "build".

Visual feedback rules:
- Always start_server before taking screenshots
- Use take_screenshot for quick visual checks after UI changes
- Use capture_page_state when debugging — it shows console errors too
- Use interact_with_page to verify user flows work end-to-end
- Screenshot after every significant UI change to verify result
- When a test fails, read the error carefully, fix the code, rerun
- write_test files to tests/*.spec.ts before calling run_tests
- Mobile viewport: { width: 390, height: 844 }
- Tablet viewport: { width: 768, height: 1024 }

`.trim();



    // ── Phase 6: inject workspace context ─────────────────────────────────────
    const contextBlock = snapshot
        ? "\n\n" + buildWorkspaceContextBlock(snapshot)
        : "";

    return `You are ${base}\n\n${rules}${contextBlock}`;
}

// ── LLM message conversion ────────────────────────────────────────────────────

export function convertMessagesToLLM(
    messages: ChatMessage[],
    chatMode: ChatMode,
): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const msg of messages) {
        if (msg.role === "checkpoint") continue;
        if (msg.role === "interrupted_tool") continue;

        if (msg.role === "user") {
            result.push({ role: "user", content: msg.content || "(empty)" });
            continue;
        }

        if (msg.role === "assistant") {
            result.push({ role: "assistant", content: msg.displayContent || "(empty)" });
            continue;
        }

        if (msg.role === "tool") {
            if (msg.type === "success" || msg.type === "tool_error") {
                result.push({
                    role: "tool",
                    content: [{
                        type: "tool-result",
                        toolCallId: msg.id,
                        toolName: msg.name,
                        output: { type: "text" as const, value: msg.content },
                    }],
                });
            }
        }
    }

    return result;
}

