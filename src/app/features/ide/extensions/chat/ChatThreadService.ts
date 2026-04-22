// src/app/features/ide/extensions/chat/ChatThreadService.ts
// Phase 6 update: wires context trimming, self-correction, workspace context,
// tool deduplication, auto-lint heal, and max steps guard into the agent loop.

import { api } from "../../../../../../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { streamText, tool, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  ChatThread,
  ChatMessage,
  WebToolName,
  WebToolCallParams,
  WebToolResult,
  ToolMessage,
  ThreadStreamState,
  ChatMode,
  CheckpointEntry,
  AnthropicReasoning,
  approvalTypeOfWebTool,
  RawToolParams,
  LintError,
} from "./types/types";

import { trimMessagesForContext } from "./agent/context-trimmer";
import {
  shouldAttemptCorrection,
  recordCorrectionAttempt,
  clearCorrectionState,
  buildCorrectionContext,
} from "./agent/self-corrector";
import {
  fetchWorkspaceSnapshot,
  buildContextBlock,
  type WorkspaceSnapshot,
} from "./agent/workspace-context";
import { classifyQuery, estimateTokens } from "./agent/query-classifier";
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
import {
  addFileToState,
  updateFileInState,
  removeFileFromState,
  buildWorkspaceStateBlock,
  consumeEvictionNotices,
  resetWorkspaceState,
  setTokenBudget,
  getWorkspaceStateInfo,
} from "./agent/workspace-state";
import { serializeToolResult } from "./agent/tool-result-schema";
import { convertMessagesToLLMWithCompression } from "./agent/message-compressor";
import { computeFileDiff } from "./agent/diff-engine";
import { useDiffStore } from "@/src/store/diff-store";

import {
  getModelInstance,
  getProviderOptions,
  getMaxOutputTokens,
  getContextWindow,
} from "@/src/lib/model-provider/model-router";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";
import {
  computeTokenBudget,
  logTokenBudget,
  countTokens,
} from "@/src/lib/token/token-utils";
import {
  analyzeTaskContext,
  shouldRespondWithoutTools,
  type TaskContextResult,
} from "./agent/task-tracker";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAT_RETRIES = 3;
const RETRY_DELAY = 1000;
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const API_BASE =
  typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_BASE ?? "") : "";

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
  if (!_convexClient)
    throw new Error(
      "Chat storage not initialized. Call initChatStorage() first.",
    );
  return _convexClient;
}

// ── extractSymbolsFromContent helper ─────────────────────────────────────────────────────────

// Need to implement Tree-sitter for better symbol extraction
function extractSymbolsFromContent(content: string): string[] {
  const symbols: string[] = [];
  const lines = content.split("\n");
  const patterns = [
    /^export (?:default )?(?:async function|function|class|const)\s+(\w+)/,
    /^(?:function|class)\s+(\w+)/,
    /^export\s+(?:type|interface|enum)\s+(\w+)/,
    /^\s{0,4}(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/,
  ];
  for (let i = 0; i < lines.length && symbols.length < 10; i++) {
    for (const p of patterns) {
      const m = lines[i].match(p);
      if (m?.[1] && m[1].length > 2) {
        symbols.push(`${m[1]}:L${i + 1}`);
        break;
      }
    }
  }
  return symbols;
}

export async function loadAllThreads(
  workspaceId: string,
): Promise<Record<string, ChatThread>> {
  try {
    const client = getClient();
    const threads = await client.query(api.chatThreads.getAllThreads, {
      workspaceId: workspaceId as Id<"workspaces">,
    });
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
  workspaceId: string,
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
  if (!_currentWorkspaceId)
    throw new Error("No workspace set. Call setAgentWorkspace() first.");
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
  // ─────────────────────────────────────────────────────────────
  // SECTION 3: toolImplementations — read_file and write_file
  // Full replacement of both implementations.
  // delete_file also gets workspace state wiring.
  // ─────────────────────────────────────────────────────────────

  read_file: async ({ filePath, startLine, endLine }, signal) => {
    const workspaceId = requireWorkspaceId();

    // ── L1+L2 cache (full reads only) ────────────────────────────────────────
    if (!startLine && !endLine) {
      const cached = await getCachedFile(filePath);
      if (cached !== null) {
        console.log(
          `[read_file] Cache hit: ${filePath} ` +
            `(${cached.length} chars, ` +
            `~${countTokens(cached)} tokens saved from API call)`,
        );
        // Touch in workspace state so LRU is accurate
        const { touchFile } = await import("./agent/workspace-state");
        touchFile(filePath);
        return {
          content: cached,
          totalLines: cached.split("\n").length,
          truncated: false,
        };
      }
    }

    // ── Fetch from disk ───────────────────────────────────────────────────────
    const params: Record<string, string> = {
      workspaceId,
      path: filePath,
      type: "file",
    };
    // Use peek mode for full reads — avoids sending huge files to LLM
    if (!startLine && !endLine) params.peek = "true";
    if (startLine != null) params.startLine = String(startLine);
    if (endLine != null) params.endLine = String(endLine);

    console.log(`[read_file] Fetching: ${filePath}`, {
      startLine,
      endLine,
      peek: !startLine && !endLine,
    });

    const result = await apiGet<WebToolResult["read_file"]>(
      "/api/files",
      params,
      signal,
    );

    const tokenEst = countTokens(result.content);
    console.log(
      `[read_file] Received: ${filePath} — ` +
        `${result.totalLines} lines total, ` +
        `${result.content.length} chars, ` +
        `~${tokenEst} tokens, ` +
        `truncated: ${result.truncated}`,
    );

    // ── Cache non-truncated full reads ────────────────────────────────────────
    if (!startLine && !endLine && result.content && !result.truncated) {
      await setCachedFile(filePath, result.content);
    }

    // ── Add to workspace state (full reads only) ──────────────────────────────
    // Workspace state holds the current version of files being actively worked on.
    // This is separate from chat history — survives message compression.
    if (!startLine && !endLine) {
      addFileToState(filePath, result.content);
      console.log(
        `[read_file] Added to workspace state: ${filePath} ` +
          `(${getWorkspaceStateInfo().usedTokens}/${getWorkspaceStateInfo().budgetTokens} tokens used)`,
      );
    }

    // ── Build structured result (enables smart compression later) ────────────
    const symbols = extractSymbolsFromContent(result.content);
    const structured = serializeToolResult({
      __type: "read_file",
      path: filePath,
      topLines: result.content,
      symbols,
      totalLines: result.totalLines,
      omittedLines: result.truncated ? result.totalLines - 100 : 0,
      fullContentInWorkspaceState: !startLine && !endLine,
    });

    console.log(
      `[read_file] Structured result: ${filePath} — ` +
        `${symbols.length} symbols extracted: ${symbols.join(", ")}`,
    );

    return {
      content: structured,
      totalLines: result.totalLines,
      truncated: result.truncated,
    };
  },

  write_file: async ({ filePath, content }, signal) => {
    const workspaceId = requireWorkspaceId();

    console.log(
      `[write_file] Starting: ${filePath} ` +
        `(${content.length} chars, ~${countTokens(content)} tokens)`,
    );

    // ── Dynamic imports to avoid circular deps ────────────────────────────────
    const { useStreamingWriterStore } =
      await import("@/src/store/streaming-writer-store");
    const { useEditorStore } = await import("@/src/store/editor-store");
    const { useIDEStore } = await import("@/src/store/ide-store");

    const streamStore = useStreamingWriterStore.getState();
    const editorStore = useEditorStore.getState();
    const ideStore = useIDEStore.getState();

    // ── Step 1: read current content for diff ─────────────────────────────────
    let oldContent = "";
    try {
      const res = await apiGet<{ content?: string }>(
        "/api/files",
        { workspaceId, path: filePath, type: "file" },
        signal,
      );
      oldContent = res.content ?? "";
    } catch {
      oldContent = ""; // new file — diff will show all lines as added
    }

    // ── Step 2: ensure file is open in editor ─────────────────────────────────
    const isOpen = editorStore.tabs.find((t) => t.relativePath === filePath);
    if (!isOpen) {
      editorStore.openFile(
        filePath,
        ideStore.projectId as any,
        filePath.split("/").pop() ?? filePath,
        oldContent,
      );
      await new Promise((r) => setTimeout(r, 80));
      console.log(`[write_file] Opened ${filePath} in editor`);
    }

    // ── Step 3: stream to editor ──────────────────────────────────────────────
    streamStore.startStream({ filePath, oldContent });

    const CHUNK_SIZE = 8;
    const CHUNK_DELAY = 6;

    if (signal?.aborted) {
      streamStore.abortStream(filePath);
      await invalidateFile(filePath);
      return { success: false, lintErrors: [] };
    }

    let chunksWritten = 0;
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      if (signal?.aborted) {
        streamStore.abortStream(filePath);
        await invalidateFile(filePath);
        console.log(
          `[write_file] Aborted mid-stream: ${filePath} (chunk ${chunksWritten})`,
        );
        return { success: false, lintErrors: [] };
      }
      streamStore.writeChunk(filePath, content.slice(i, i + CHUNK_SIZE));
      chunksWritten++;
      await new Promise((r) => setTimeout(r, CHUNK_DELAY));
    }

    // ── Step 4: finalize diff ─────────────────────────────────────────────────
    await streamStore.endStream(filePath, _globalAutoApproveEdits);
    console.log(
      `[write_file] Stream complete: ${filePath} ` +
        `(${chunksWritten} chunks, ${content.length} chars)`,
    );

    // ── Step 5: sync workspace state ─────────────────────────────────────────
    // Update workspace state with new content so it reflects what's on disk.
    // This is critical — if agent reads this file again, it gets current content.
    updateFileInState(filePath, content);
    console.log(
      `[write_file] Workspace state updated: ${filePath} ` +
        `(${getWorkspaceStateInfo().usedTokens}/${getWorkspaceStateInfo().budgetTokens} tokens used)`,
    );

    // ── Step 6: invalidate cache ──────────────────────────────────────────────
    await invalidateFile(filePath);

    // ── Step 7: compute real diff stats + wire decorations ───────────────────
    const fileDiff = computeFileDiff(filePath, oldContent, content);
    // Push decorations into the editor (if file is open)
    useDiffStore.getState().setPendingDiff(fileDiff);

    // ── Step 8: lint heal ─────────────────────────────────────────────────────
    // (handled in _runToolCall after this returns)

    return {
      success: true,
      lintErrors: [],
      content: serializeToolResult({
        __type: "write_file",
        path: filePath,
        linesAdded: fileDiff.stats.added,
        linesRemoved: fileDiff.stats.removed,
        success: true,
      }) as any,
    };
  },

  // src/app/features/ide/extensions/chat/ChatThreadService.ts
  // SURGICAL ADDITIONS only — add these to toolImplementations

  // ── ADD create_directory implementation ──────────────────────────────────────
  create_directory: async ({ dirPath }, signal) => {
    const workspaceId = requireWorkspaceId();

    console.log(`[create_directory] Creating directory: ${dirPath}`);

    const result = await apiPost<{ success: boolean; path: string }>(
      "/api/files",
      {
        workspaceId,
        path: dirPath,
        isFolder: true, // always true — no ambiguity possible
        action: "create",
      },
      signal,
    );

    console.log(`[create_directory] Created: ${dirPath}`);
    return result;
  },

  // ── UPDATE create_file — now only creates empty files, never folders ──────────
  create_file: async ({ filePath }, signal) => {
    const workspaceId = requireWorkspaceId();

    console.log(`[create_file] Creating empty file: ${filePath}`);

    return apiPost<WebToolResult["create_file"]>(
      "/api/files",
      {
        workspaceId,
        path: filePath,
        isFolder: false, // always false — use create_directory for folders
        action: "create",
      },
      signal,
    );
  },

  // ── UPDATE delete_file — wire workspace state removal ────────────────────────
  delete_file: async ({ filePath, recursive }, signal) => {
    const workspaceId = requireWorkspaceId();

    console.log(
      `[delete_file] Deleting: ${filePath} (recursive: ${recursive})`,
    );

    // Remove from workspace state and cache before deleting
    removeFileFromState(filePath);
    await invalidateFile(filePath);

    // Close tab in editor
    try {
      const { useEditorStore } = await import("@/src/store/editor-store");
      useEditorStore.getState().closeTab?.(filePath);
    } catch {}

    return apiPost<WebToolResult["delete_file"]>(
      "/api/files",
      {
        workspaceId,
        path: filePath,
        recursive: recursive ?? false,
        action: "delete",
      },
      signal,
    );
  },

  // delete_file: async ({ filePath, recursive }, signal) => {
  //     const workspaceId = requireWorkspaceId();

  //     console.log(`[delete_file] Deleting: ${filePath} (recursive: ${recursive})`);

  //     // Remove from workspace state and cache before deleting
  //     removeFileFromState(filePath);
  //     await invalidateFile(filePath);

  //     // Also close the tab in the editor
  //     try {
  //         const { useEditorStore } = await import("@/src/store/editor-store");
  //         useEditorStore.getState().closeTab(filePath);
  //         console.log(`[delete_file] Closed editor tab: ${filePath}`);
  //     } catch {
  //         // Non-fatal — tab may not be open
  //     }

  //     return apiPost<WebToolResult["delete_file"]>("/api/files", {
  //         workspaceId,
  //         path: filePath,
  //         recursive: recursive ?? false,
  //         action: "delete",
  //     }, signal);
  // },

  // create_directory: async ({ dirPath }, signal) => {
  //     const workspaceId = requireWorkspaceId();
  //     console.log(`[create_directory] Creating directory: ${dirPath}`);
  //     return apiPost<WebToolResult["create_file"]>("/api/files", {
  //         workspaceId,
  //         path: dirPath,
  //         isFolder: true,        // always true — no ambiguity
  //         action: "create",
  //     }, signal);
  // },

  // create_file: async ({ filePath }, signal) => {
  //     const workspaceId = requireWorkspaceId();
  //     console.log(`[create_file] Creating file: ${filePath}`);
  //     return apiPost<WebToolResult["create_file"]>("/api/files", {
  //         workspaceId,
  //         path: filePath,
  //         isFolder: false,       // always false — no ambiguity
  //         action: "create",
  //     }, signal);
  // },

  search_in_file: async ({ filePath, query, isRegex }, signal) => {
    const workspaceId = requireWorkspaceId();
    return apiGet<WebToolResult["search_in_file"]>(
      "/api/files",
      {
        workspaceId,
        path: filePath,
        query,
        isRegex: String(isRegex ?? false),
        type: "search-in-file",
      },
      signal,
    );
  },

  search_files: async ({ query, isRegex, includePattern }, signal) => {
    const workspaceId = requireWorkspaceId();
    const params: Record<string, string> = {
      workspaceId,
      query,
      type: "search",
    };
    if (isRegex) params.isRegex = "true";
    if (includePattern) params.includePattern = includePattern;
    return apiGet<WebToolResult["search_files"]>("/api/files", params, signal);
  },

  list_directory: async ({ dirPath }, signal) => {
    const workspaceId = requireWorkspaceId();
    return apiGet<WebToolResult["list_directory"]>(
      "/api/files",
      {
        workspaceId,
        path: dirPath,
        type: "dir",
      },
      signal,
    );
  },

  run_terminal: async ({ command, cwd }, signal, onProgress) => {
    const workspaceId = requireWorkspaceId();

    if (onProgress) {
      return new Promise<WebToolResult["run_terminal"]>(
        async (resolve, reject) => {
          try {
            const res = await fetch(`${API_BASE}/api/terminal`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                command,
                cwd: cwd ?? "/workspace",
                stream: true,
              }),
              signal,
            });
            if (!res.ok)
              throw new Error(`Terminal API error: ${res.statusText}`);
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
                } catch {}
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
        },
      );
    }

    return apiPost<WebToolResult["run_terminal"]>(
      "/api/terminal",
      {
        workspaceId,
        command,
        cwd: cwd ?? "/workspace",
        stream: false,
      },
      signal,
    );
  },

  start_terminal: async ({ name, command }, signal, onProgress) => {
    const workspaceId = requireWorkspaceId();

    const res = await apiPost<{ session: any }>(
      "/api/terminal/persistent?action=start",
      {
        workspaceId,
        name,
        command,
      },
      signal,
    );

    onProgress?.(
      `Started terminal session "${name}"${command ? ` → running: ${command}` : ""}\n`,
    );
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
            } catch {}
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
    await apiPost(
      "/api/terminal/persistent?action=kill",
      { workspaceId, name },
      signal,
    );
    return { success: true };
  },

  start_server: async ({ command, port, name }, signal, onProgress) => {
    const workspaceId = requireWorkspaceId();

    // Start as a named persistent session
    await apiPost(
      "/api/terminal/persistent?action=start",
      {
        workspaceId,
        name: name ?? `dev-server-${port}`,
        command,
      },
      signal,
    );

    onProgress?.(`Starting server: ${command}\n`);

    // Wait until port is accepting connections
    const waitResult = await apiPost<{
      ready: boolean;
      timeMs: number;
      error?: string;
    }>(
      "/api/playwright",
      {
        action: "wait_ready",
        url: `http://localhost:${port}`,
        timeoutMs: 45_000,
      },
      signal,
    );

    if (!waitResult.ready) {
      throw new Error(
        `Server didn't start within 45s on port ${port}: ${waitResult.error}`,
      );
    }

    onProgress?.(`Server ready on port ${port} (${waitResult.timeMs}ms)\n`);
    return { success: true, port, timeMs: waitResult.timeMs };
  },

  take_screenshot: async ({ url, fullPage, viewport, selector }, signal) => {
    const workspaceId = requireWorkspaceId();
    const result = await apiPost<{
      base64: string;
      width: number;
      height: number;
      url: string;
      timestamp: number;
    }>(
      "/api/playwright",
      {
        action: "screenshot",
        workspaceId,
        url: url ?? "http://localhost:3000",
        fullPage: fullPage ?? false,
        viewport: viewport ?? { width: 1280, height: 800 },
        selector,
      },
      signal,
    );
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
    }>(
      "/api/playwright",
      {
        action: "page_state",
        workspaceId,
        url: url ?? "http://localhost:3000",
        viewport: viewport ?? { width: 1280, height: 800 },
      },
      signal,
    );
  },

  interact_with_page: async (
    { url, steps, screenshotOnEachStep },
    signal,
    onProgress,
  ) => {
    const workspaceId = requireWorkspaceId();
    const result = await apiPost<{
      steps: Array<{
        step: any;
        success: boolean;
        error?: string;
        screenshotBase64?: string;
      }>;
      finalScreenshot: { base64: string };
      passed: boolean;
      errors: string[];
    }>(
      "/api/playwright",
      {
        action: "interact",
        workspaceId,
        url: url ?? "http://localhost:3000",
        steps,
        screenshotOnEachStep: screenshotOnEachStep ?? false,
      },
      signal,
    );

    const failedSteps = result.steps.filter((s) => !s.success);
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

  run_tests: async (
    { testFile, pattern, stream: streamOutput },
    signal,
    onProgress,
  ) => {
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
              } catch {}
            }
          }
          resolve(
            finalResult ?? {
              passed: 0,
              failed: 0,
              skipped: 0,
              output: "",
              duration: 0,
              failures: [],
            },
          );
        } catch (err: any) {
          if (err?.name === "AbortError") {
            resolve({
              passed: 0,
              failed: 0,
              skipped: 0,
              output: "Aborted",
              duration: 0,
              failures: [],
            });
          } else {
            reject(err);
          }
        }
      });
    }

    return apiPost(
      "/api/playwright",
      {
        action: "run_tests",
        workspaceId,
        testFile,
        pattern,
        timeout: 120_000,
      },
      signal,
    );
  },
};

// ── File snapshot helpers ─────────────────────────────────────────────────────

export async function takeFileSnapshot(
  filePath: string,
): Promise<string | null> {
  try {
    const result = await toolImplementations.read_file({ filePath });
    return result.content;
  } catch {
    return null;
  }
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
    create_directory: (r) => {
      if (!r.dirPath) throw new Error("create_directory requires 'dirPath'");
      return { dirPath: r.dirPath };
    },
    delete_file: (r) => {
      if (!r.filePath) throw new Error("delete_file requires 'filePath'");
      return { filePath: r.filePath, recursive: r.recursive === "true" };
    },
    search_in_file: (r) => {
      if (!r.filePath) throw new Error("search_in_file requires 'filePath'");
      if (!r.query) throw new Error("search_in_file requires 'query'");
      return {
        filePath: r.filePath,
        query: r.query,
        isRegex: r.isRegex === "true",
      };
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
      return {
        name: r.name,
        command: r.command,
        timeoutMs: r.timeoutMs ? Number(r.timeoutMs) : undefined,
      };
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
        steps:
          typeof r.steps === "string" ? JSON.parse(r.steps) : (r.steps as any),
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

export function stringifyToolResult<
  T extends keyof WebToolCallParams & keyof WebToolResult,
>(toolName: T, params: WebToolCallParams[T], result: WebToolResult[T]): string {
  switch (toolName) {
    case "read_file": {
      const r = result as WebToolResult["read_file"];
      const p = params as WebToolCallParams["read_file"];
      const note = r.truncated
        ? `\n[Truncated — ${r.totalLines} total lines]`
        : "";
      return `${p.filePath}:\n${r.content}${note}`;
    }
    case "create_directory": {
      const p = params as WebToolCallParams["create_directory"];
      return `Created directory: ${p.dirPath}`;
    }
    case "write_file": {
      const r = result as WebToolResult["write_file"];
      const p = params as WebToolCallParams["write_file"];
      const lint = r.lintErrors?.length
        ? `\nLint errors:\n${r.lintErrors.map((e) => `  L${e.startLine}: ${e.message}`).join("\n")}`
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
      return `Contents of ${p.dirPath}:\n${r.entries
        .map((e) => `  ${e.isDirectory ? "📁" : "📄"} ${e.name}`)
        .join("\n")}`;
    }
    case "run_terminal": {
      const r = result as WebToolResult["run_terminal"];
      const exit = r.timedOut ? "[timed out]" : `[exit ${r.exitCode ?? "?"}]`;
      return `${exit}\n${r.output}`;
    }
    default:
      return JSON.stringify(result);
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

  planMode: boolean; // true = plan first, false = quick mode
  onAddPlan: (plan: AgentPlan) => void;
  onUpdatePlan: (plan: AgentPlan) => void;
  getCurrentPlan: () => AgentPlan | null;
};

// ── Main agent entry point ────────────────────────────────────────────────────

// export async function runChatAgent(
//     callbacks: AgentCallbacks,
//     opts: {
//         callThisToolFirst?: ToolMessage<WebToolName> & { type: "tool_request" };
//         abortSignal?: AbortSignal;
//     } = {}
// ): Promise<void> {
//     const { callThisToolFirst, abortSignal } = opts;
//     const {
//         onStreamStateChange, onAddMessage,
//         chatMode,
//     } = callbacks;

//     // ── Phase 6: init per-run state ───────────────────────────────────────────
//     const runId = `run-${Date.now()}`;
//     startNewRun(`run-${Date.now()}`, _currentWorkspaceId ?? undefined);
//     resetStepsGuard();
//     resetHealState();

//     // ── Phase 6: fetch workspace context snapshot ─────────────────────────────
//     // ── Phase 0-A: context injection (ONCE, not every iteration) ─────────────────

//     let contextMessageInjected = false;
//     let workspaceSnapshot: WorkspaceSnapshot | null = null;

//     // Get last user message for query classification
//     const firstMessages = callbacks.getMessages();
//     const lastUserMsg = [...firstMessages].reverse().find(m => m.role === "user");
//     const userMsgText = typeof lastUserMsg?.content === "string"
//         ? lastUserMsg.content : "";

//     const isFirstMessage = firstMessages.filter(m => m.role === "user").length <= 1;

//     // Build context snapshot ONCE before the loop
//     if (_currentWorkspaceId && chatMode !== "normal") {
//         try {
//             workspaceSnapshot = await fetchWorkspaceSnapshot(
//                 _currentWorkspaceId,
//                 callbacks.workspaceName ?? _currentWorkspaceName ?? "workspace",
//                 callbacks.activeFilePath ?? null,
//                 callbacks.openFilePaths ?? [],
//                 userMsgText,
//             );
//             console.log(
//                 `[Agent] Workspace snapshot ready: ` +
//                 `${workspaceSnapshot.tokenEstimate} tokens, ` +
//                 `intent: ${workspaceSnapshot.intent}`
//             );
//         } catch (err: any) {
//             console.error("[Agent] Failed to fetch workspace snapshot:", err.message);
//         }
//     }

//     // (Message building moved INSIDE the while loop below)

//     let interruptedWhenIdle = false;

//     onStreamStateChange({
//         status: "idle",
//         workspaceId: requireWorkspaceId(),
//         abort: () => { interruptedWhenIdle = true; },
//     });

//     // Pre-approved tool run (resume after user approval)
//     if (callThisToolFirst) {
//         incrementToolCallCount();
//         const { interrupted } = await _runToolCall(
//             callThisToolFirst.name as WebToolName,
//             callThisToolFirst.id,
//             callThisToolFirst.mcpServerName,
//             {
//                 preapproved: true,
//                 rawParams: callThisToolFirst.rawParams,
//                 validatedParams: callThisToolFirst.params as any,
//             },
//             callbacks,
//             abortSignal,
//         );
//         if (interrupted) {
//             onStreamStateChange(undefined);
//             _addUserCheckpoint(callbacks);
//             return;
//         }
//     }

//     let shouldSendAnotherMessage = true;
//     let isRunningWhenEnd: "awaiting_user" | undefined = undefined;

//     while (shouldSendAnotherMessage) {
//         shouldSendAnotherMessage = false;
//         isRunningWhenEnd = undefined;

//         // ── Phase 6: steps guard ──────────────────────────────────────────────
//         if (hasReachedLimit()) {
//             onAddMessage({
//                 role: "assistant",
//                 displayContent: buildLimitReachedMessage(),
//                 reasoning: "",
//                 anthropicReasoning: null,
//             });
//             onStreamStateChange(undefined);
//             break;
//         }

//         onStreamStateChange({
//             status: "idle",
//             workspaceId: requireWorkspaceId(),
//             abort: () => { interruptedWhenIdle = true; },
//         });

//         if (interruptedWhenIdle || abortSignal?.aborted) {
//             onStreamStateChange(undefined);
//             return;
//         }

//         // ── Build LLM messages (rebuilt every iteration for fresh tool results) ──
//         const currentMessages = callbacks.getMessages();
//         const rawLLMMessages = convertMessagesToLLMWithCompression(currentMessages, chatMode);
//         const trimmedMessages = trimMessagesForContext(rawLLMMessages, callbacks.threadId);

//         // Inject context as FIRST message (only on first iteration of this run)
//         let llmMessages = trimmedMessages;
//         if (!contextMessageInjected && workspaceSnapshot && isFirstMessage) {
//             const contextMsg = {
//                 role: "user" as const,
//                 content: [
//                     "## Workspace context",
//                     buildContextBlock(workspaceSnapshot),
//                     "",
//                     "Use list_directory, read_file, or search_files for more context when needed.",
//                 ].join("\n"),
//             };

//             // Insert context as SECOND message (after first user message)
//             if (llmMessages.length > 0) {
//                 llmMessages = [
//                     llmMessages[0],
//                     contextMsg,
//                     ...llmMessages.slice(1),
//                 ];
//             } else {
//                 llmMessages = [contextMsg];
//             }

//             contextMessageInjected = true;
//             console.log(
//                 `[Agent] Context injected as message #2: ` +
//                 `~${workspaceSnapshot.tokenEstimate} tokens`
//             );
//         }

//         // ── Static system prompt (no context — that's in messages now) ────────
//         const systemMessage = isApproachingLimit()
//             ? buildStaticSystemPrompt(chatMode) + "\n\n" + buildApproachingLimitWarning()
//             : buildStaticSystemPrompt(chatMode);

//         // ── Log token budget ──────────────────────────────────────────────────
//         logTokenBudget(
//             `LLM call (turn ${currentMessages.length})`,
//             systemMessage,
//             llmMessages,
//             workspaceSnapshot ? buildContextBlock(workspaceSnapshot) : "",
//         );

//         let shouldRetry = true;
//         let nAttempts = 0;

//         while (shouldRetry) {
//             shouldRetry = false;
//             nAttempts += 1;

//             type LLMResult =
//                 | { type: "done"; text: string; reasoning: string; anthropicReasoning: AnthropicReasoning[] | null; toolCall: RawToolCall | null }
//                 | { type: "error"; error: Error }
//                 | { type: "aborted" };

//             let resolveLLM!: (r: LLMResult) => void;
//             const llmDonePromise = new Promise<LLMResult>(
//                 (res) => { resolveLLM = res; }
//             );

//             const llmAbortController = new AbortController();
//             abortSignal?.addEventListener(
//                 "abort",
//                 () => llmAbortController.abort(),
//                 { once: true }
//             );

//             onStreamStateChange({
//                 status: "streaming",
//                 workspaceId: requireWorkspaceId(),
//                 partialText: "",
//                 partialReasoning: "",
//                 partialToolCall: null,
//                 abort: () => llmAbortController.abort(),
//             });

//             let accumulatedText = "";
//             let accumulatedReasoning = "";
//             let detectedToolCall: RawToolCall | null = null;
//             let streamSettled = false;

//             try {
//                 // const thinkingEnabled = chatMode === "agent";

//                 // const stream = streamText({
//                 //     model: anthropic("claude-sonnet-4-6"),
//                 //     system: systemMessage,
//                 //     messages: llmMessages,
//                 //     maxOutputTokens: thinkingEnabled ? 16000 : 4096,
//                 //     temperature: thinkingEnabled ? 1 : 0.3,
//                 //     abortSignal: llmAbortController.signal,
//                 //     tools: _buildAnthropicTools(chatMode),
//                 //     ...(thinkingEnabled && {
//                 //         providerOptions: {
//                 //             anthropic: {
//                 //                 thinking: { type: "enabled", budgetTokens: 10000 },
//                 //             },
//                 //         },
//                 //     }),
//                 // });

//                 const providerStore = useProviderStore.getState();
//                 const modelSelection = providerStore.getEffectiveModel(callbacks.threadId);
//                 const credentials = providerStore.credentials[modelSelection.provider] ?? {};
//                 const providerOptions = getProviderOptions(modelSelection);
//                 const maxOutputTokens = getMaxOutputTokens(modelSelection, chatMode);

//                 let modelInstance: Awaited<ReturnType<typeof getModelInstance>>;
//                 try {
//                     modelInstance = await getModelInstance(modelSelection, credentials);
//                 } catch (err: any) {
//                     resolveLLM({ type: "error", error: new Error(`Model init failed: ${err.message}`) });
//                     continue;
//                 }

//                 const thinkingEnabled =
//                     chatMode === "agent" &&
//                     (modelSelection.reasoningEnabled ?? false);

//                 const stream = streamText({
//                     model: modelInstance,
//                     system: systemMessage,
//                     messages: llmMessages,
//                     maxOutputTokens,
//                     temperature: thinkingEnabled ? 1 : 0.3,
//                     abortSignal: llmAbortController.signal,
//                     tools: _buildAnthropicTools(chatMode),
//                     ...(providerOptions && { providerOptions: providerOptions as any }),
//                 });

//                 for await (const chunk of stream.fullStream) {
//                     if (llmAbortController.signal.aborted) break;

//                     switch (chunk.type) {
//                         case "text-delta": {
//                             accumulatedText += chunk.text;
//                             onStreamStateChange({
//                                 status: "streaming",
//                                 workspaceId: requireWorkspaceId(),
//                                 partialText: accumulatedText,
//                                 partialReasoning: accumulatedReasoning,
//                                 partialToolCall: detectedToolCall
//                                     ? { name: detectedToolCall.toolName, rawParams: detectedToolCall.input as RawToolParams }
//                                     : null,
//                                 abort: () => llmAbortController.abort(),
//                             });
//                             break;
//                         }
//                         case "reasoning-delta": {
//                             accumulatedReasoning += (chunk as any).text ?? "";
//                             break;
//                         }
//                         case "tool-call": {
//                             detectedToolCall = {
//                                 toolCallId: chunk.toolCallId,
//                                 toolName: chunk.toolName,
//                                 input: (chunk as any).input ?? {},
//                             };
//                             break;
//                         }
//                         case "finish": {
//                             if (!streamSettled) {
//                                 streamSettled = true;
//                                 resolveLLM({
//                                     type: "done",
//                                     text: accumulatedText,
//                                     reasoning: accumulatedReasoning,
//                                     anthropicReasoning: null,
//                                     toolCall: detectedToolCall,
//                                 });
//                             }
//                             break;
//                         }
//                         case "error": {
//                             if (!streamSettled) {
//                                 streamSettled = true;
//                                 resolveLLM({ type: "error", error: (chunk as any).error as Error });
//                             }
//                             break;
//                         }
//                     }
//                 }

//                 if (!streamSettled) {
//                     streamSettled = true;
//                     if (llmAbortController.signal.aborted) {
//                         resolveLLM({ type: "aborted" });
//                     } else {
//                         resolveLLM({
//                             type: "done", text: accumulatedText,
//                             reasoning: accumulatedReasoning,
//                             anthropicReasoning: null, toolCall: detectedToolCall,
//                         });
//                     }
//                 }

//             } catch (err: any) {
//                 if (!streamSettled) {
//                     streamSettled = true;
//                     if (err?.name === "AbortError" || llmAbortController.signal.aborted) {
//                         resolveLLM({ type: "aborted" });
//                     } else {
//                         resolveLLM({ type: "error", error: err });
//                     }
//                 }
//             }

//             const llmResult = await llmDonePromise;

//             if (llmResult.type === "aborted") {
//                 if (accumulatedText || detectedToolCall) {
//                     onAddMessage({
//                         role: "assistant", displayContent: accumulatedText,
//                         reasoning: accumulatedReasoning, anthropicReasoning: null,
//                     });
//                     if (detectedToolCall) {
//                         onAddMessage({
//                             role: "interrupted_tool",
//                             name: detectedToolCall.toolName as WebToolName,
//                             mcpServerName: undefined,
//                         });
//                     }
//                 }
//                 onStreamStateChange(undefined);
//                 return;
//             }

//             if (llmResult.type === "error") {
//                 if (nAttempts < CHAT_RETRIES) {
//                     shouldRetry = true;
//                     onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });
//                     await sleep(RETRY_DELAY * nAttempts);
//                     if (interruptedWhenIdle || abortSignal?.aborted) {
//                         onStreamStateChange(undefined);
//                         return;
//                     }
//                     continue;
//                 }
//                 onAddMessage({
//                     role: "assistant", displayContent: accumulatedText,
//                     reasoning: "", anthropicReasoning: null,
//                 });
//                 onStreamStateChange({
//                     status: "error",
//                     message: llmResult.error.message ?? "An error occurred.",
//                     fullError: llmResult.error,
//                 });
//                 _addUserCheckpoint(callbacks);
//                 return;
//             }

//             // LLM success
//             const { text, reasoning, anthropicReasoning, toolCall } = llmResult;

//             onAddMessage({
//                 role: "assistant", displayContent: text,
//                 reasoning, anthropicReasoning,
//             });

//             onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });

//             if (toolCall) {
//                 // ── Phase 6: increment step counter ──────────────────────────
//                 incrementToolCallCount();

//                 const { awaitingUserApproval, interrupted } = await _runToolCall(
//                     toolCall.toolName as WebToolName,
//                     toolCall.toolCallId,
//                     undefined,
//                     { preapproved: false, rawParams: toolCall.input as RawToolParams },
//                     callbacks,
//                     abortSignal,
//                 );

//                 if (interrupted) {
//                     onStreamStateChange(undefined);
//                     return;
//                 }

//                 if (awaitingUserApproval) {
//                     isRunningWhenEnd = "awaiting_user";
//                 } else {
//                     shouldSendAnotherMessage = true;
//                 }

//                 onStreamStateChange({ status: "idle", workspaceId: requireWorkspaceId(), abort: () => { interruptedWhenIdle = true; } });
//             }

//         } // end retry while
//     } // end agent while

//     // if (activePlan) {
//     //     const allDone = activePlan.steps.every(
//     //         s => s.status === "done" || s.status === "skipped"
//     //     );
//     //     const anyFailed = activePlan.steps.some(s => s.status === "failed");
//     //     const finalStatus = anyFailed ? "failed" : allDone ? "completed" : "aborted";
//     //     callbacks.onUpdatePlan?.(finalizePlan(activePlan, finalStatus));
//     // }

//     // Cleanup
//     clearCache();

//     if (isRunningWhenEnd === "awaiting_user") {
//         onStreamStateChange({ status: "awaiting_user", workspaceId: requireWorkspaceId() });
//     } else {
//         onStreamStateChange(undefined);
//         _addUserCheckpoint(callbacks);
//     }
// }

export async function runChatAgent(
  callbacks: AgentCallbacks,
  opts: {
    callThisToolFirst?: ToolMessage<WebToolName> & { type: "tool_request" };
    abortSignal?: AbortSignal;
    isToolApprovalContinuation?: boolean;
  } = {},
): Promise<void> {
  const { callThisToolFirst, abortSignal, isToolApprovalContinuation } = opts;
  const { onStreamStateChange, onAddMessage, chatMode } = callbacks;
  let _sessionTokensInput = 0;
  let _sessionTokensOutput = 0;

  // ── Init per-run state ────────────────────────────────────────────────────
  startNewRun(`run-${Date.now()}`, _currentWorkspaceId ?? undefined);
  resetStepsGuard();
  resetHealState();

  // ── Reset workspace state for this session ────────────────────────────────
  // Each agent run gets a clean workspace state.
  // Files accumulate as the agent reads/writes them during the run.
  // resetWorkspaceState("agent run start"); // < ----------  workspace state is getting cleared on every tool calls. Active memory is being flushed out it's a bug ------------ >

  if (!isToolApprovalContinuation) {
    resetWorkspaceState("new user message");
    console.log("[Agent] Fresh run — workspace state reset");
    _sessionTokensInput = 0;
    _sessionTokensOutput = 0;
  } else {
    console.log(
      "[Agent] Tool approval continuation — preserving workspace state: " +
        `${getWorkspaceStateInfo().fileCount} files, ` +
        `${getWorkspaceStateInfo().usedTokens} tokens`,
    );
  }

  // ── Set token budget based on current model ───────────────────────────────
  const providerStore = useProviderStore.getState();
  const modelSelection = providerStore.getEffectiveModel(callbacks.threadId);
  const contextWindow = getContextWindow(modelSelection);
  setTokenBudget(contextWindow);

  console.log(
    `[Agent] Run started | model: ${modelSelection.provider}/${modelSelection.modelId} ` +
      `| context window: ${contextWindow} tokens`,
  );

  // ── Build workspace context snapshot ONCE ─────────────────────────────────
  // This is a lightweight snapshot (file tree + package.json deps + branch).
  // Injected as the second message, not the system prompt.
  // Never repeated on subsequent iterations.
  let contextMessageInjected = false;
  let workspaceSnapshot: WorkspaceSnapshot | null = null;

  const firstMessages = callbacks.getMessages();
  const lastUserMsg = [...firstMessages]
    .reverse()
    .find((m) => m.role === "user");
  const userMsgText =
    typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
  const isFirstMessage =
    firstMessages.filter((m) => m.role === "user").length <= 1;

  if (_currentWorkspaceId && chatMode !== "normal") {
    try {
      workspaceSnapshot = await fetchWorkspaceSnapshot(
        _currentWorkspaceId,
        callbacks.workspaceName ?? _currentWorkspaceName ?? "workspace",
        callbacks.activeFilePath ?? null,
        callbacks.openFilePaths ?? [],
        userMsgText,
      );
      console.log(
        `[Agent] Context snapshot: ` +
          `~${workspaceSnapshot.tokenEstimate} tokens, ` +
          `intent: ${workspaceSnapshot.intent}`,
      );
    } catch (err: any) {
      console.error(
        "[Agent] Snapshot failed (continuing without):",
        err.message,
      );
    }
  }

  // ── Analyze task context (what did we do before? what is this request?) ────
  const taskContext: TaskContextResult = analyzeTaskContext(
    callbacks.getMessages(),
  );

  console.log(
    `[Agent] Task context: ${taskContext.tasks.length} tasks analyzed | ` +
      `current intent: "${taskContext.currentIntent}" | ` +
      `~${taskContext.tokenEstimate} tokens for context block`,
  );

  const noToolsMode =
    chatMode === "agent" &&
    shouldRespondWithoutTools(taskContext.currentIntent);

  if (noToolsMode) {
    console.log(
      `[Agent] Intent "${taskContext.currentIntent}" — ` +
        `responding without tools (no file reads, no terminal)`,
    );
  }

  // ── Plan mode ─────────────────────────────────────────────────────────────
  let activePlan: AgentPlan | null = null;

  if (callbacks.planMode && chatMode === "agent" && !callThisToolFirst) {
    const complexity = classifyTaskComplexity(userMsgText);
    if (complexity === "complex") {
      try {
        const plan = await generatePlan(
          userMsgText,
          workspaceSnapshot,
          abortSignal,
        );
        if (plan) {
          activePlan = plan;
          callbacks.onAddPlan(plan);
          console.log(
            `[Agent] Plan generated: "${plan.title}" (${plan.steps.length} steps)`,
          );
        }
      } catch (err: any) {
        console.warn("[Agent] Plan generation failed:", err.message);
      }
    }
  }

  // ── Idle state ────────────────────────────────────────────────────────────
  let interruptedWhenIdle = false;
  onStreamStateChange({
    status: "idle",
    workspaceId: requireWorkspaceId(),
    abort: () => {
      interruptedWhenIdle = true;
    },
  });

  // ── Pre-approved tool resume ──────────────────────────────────────────────
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

  // ── Derive casual mode + tool set from task context ─────────────────────
  // isCasual: true when the intent is a greeting or simple question.
  // In casual mode, skip heavy workspace state injection and tool calls.
  const isCasual =
    taskContext.currentIntent === "greeting" ||
    taskContext.currentIntent === "question";

  // agentTools: undefined when casual (forces text-only LLM response)
  const agentTools = noToolsMode ? undefined : _buildAgentTools(chatMode);

  // ── Main agent loop ───────────────────────────────────────────────────────
  let shouldSendAnotherMessage = true;
  let isRunningWhenEnd: "awaiting_user" | undefined = undefined;

  while (shouldSendAnotherMessage) {
    shouldSendAnotherMessage = false;
    isRunningWhenEnd = undefined;

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
      abort: () => {
        interruptedWhenIdle = true;
      },
    });

    if (interruptedWhenIdle || abortSignal?.aborted) {
      onStreamStateChange(undefined);
      return;
    }

    // ── Build message array ───────────────────────────────────────────────
    const currentMessages = callbacks.getMessages();

    // Token-budget compression (replaces turn-count compression)
    const compressedMessages = convertMessagesToLLMWithCompression(
      currentMessages,
      contextWindow,
    );

    // Still run through context trimmer as final safety net
    const trimmedMessages = trimMessagesForContext(
      compressedMessages,
      callbacks.threadId,
    );

    // Inject workspace context as message #2 (first iteration only)
    let llmMessages = trimmedMessages;
    if (!contextMessageInjected && workspaceSnapshot && isFirstMessage) {
      const contextContent = [
        "## Workspace context",
        buildContextBlock(workspaceSnapshot),
        "",
        "Files you read will appear in <WorkspaceState> in the system prompt.",
        "Use list_directory, read_file, or search_files for more context when needed.",
      ].join("\n");

      if (llmMessages.length > 0) {
        llmMessages = [
          llmMessages[0], // first user message
          { role: "user" as const, content: contextContent },
          ...llmMessages.slice(1), // rest of history
        ];
      } else {
        llmMessages = [{ role: "user" as const, content: contextContent }];
      }

      contextMessageInjected = true;
      console.log(
        `[Agent] Context injected as message #2: ` +
          `~${workspaceSnapshot.tokenEstimate} tokens`,
      );
    }

    // ── Build system prompt (static rules + workspace state block) ────────
    // const workspaceBlock = buildWorkspaceStateBlock();
    const workspaceBlock =
      !isCasual && chatMode === "agent" ? buildWorkspaceStateBlock() : "";
    const evictionWarning = consumeEvictionNotices();

    const taskContextBlock = taskContext.contextBlock;

    // const systemMessage = [
    //   buildStaticSystemPrompt(chatMode),
    //   workspaceBlock ? `\n\n${workspaceBlock}` : "",
    //   evictionWarning ? `\n\n${evictionWarning}` : "",
    //   isApproachingLimit() ? `\n\n${buildApproachingLimitWarning()}` : "",
    // ]
    //   .filter(Boolean)
    //   .join("");

    const systemMessage = [
      buildStaticSystemPrompt(chatMode),
      workspaceBlock ? `\n\n${workspaceBlock}` : "",
      taskContextBlock ? `\n\n${taskContextBlock}` : "",
      evictionWarning ? `\n\n${evictionWarning}` : "",
      isApproachingLimit() ? `\n\n${buildApproachingLimitWarning()}` : "",
    ]
      .filter(Boolean)
      .join("");
    // ── Log full token budget before every LLM call ───────────────────────
    const messagesText = llmMessages
      .map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      )
      .join("\n");

    const budgetBreakdown = computeTokenBudget({
      contextWindow,
      systemPromptText: systemMessage,
      workspaceStateText: workspaceBlock,
      messageHistoryText: messagesText,
    });

    logTokenBudget(
      `Turn ${currentMessages.length} | ${modelSelection.provider}/${modelSelection.modelId}`,
      budgetBreakdown,
    );

    if (budgetBreakdown.isOverBudget) {
      console.warn(
        `[Agent] Message history over budget by ` +
          `${budgetBreakdown.messageHistory - budgetBreakdown.availableForHistory} tokens. ` +
          `Compressor should have caught this — check compressMessages().`,
      );
    }

    // ── LLM call ─────────────────────────────────────────────────────────
    let shouldRetry = true;
    let nAttempts = 0;

    while (shouldRetry) {
      shouldRetry = false;
      nAttempts++;

      type LLMResult =
        | {
            type: "done";
            text: string;
            reasoning: string;
            anthropicReasoning: AnthropicReasoning[] | null;
            toolCall: RawToolCall | null;
          }
        | { type: "error"; error: Error }
        | { type: "aborted" };

      let resolveLLM!: (r: LLMResult) => void;
      const llmDonePromise = new Promise<LLMResult>((res) => {
        resolveLLM = res;
      });

      const llmAbortController = new AbortController();
      abortSignal?.addEventListener("abort", () => llmAbortController.abort(), {
        once: true,
      });

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
        const credentials =
          providerStore.credentials[modelSelection.provider] ?? {};
        const providerOptions = getProviderOptions(modelSelection);
        const maxOutputTokens = getMaxOutputTokens(modelSelection, chatMode);

        let modelInstance: Awaited<ReturnType<typeof getModelInstance>>;
        try {
          modelInstance = await getModelInstance(modelSelection, credentials);
        } catch (err: any) {
          resolveLLM({
            type: "error",
            error: new Error(`Model init failed: ${err.message}`),
          });
          continue;
        }

        const thinkingEnabled =
          chatMode === "agent" && (modelSelection.reasoningEnabled ?? false);

        console.log(
          `[Agent] Streaming LLM call: ` +
            `attempt ${nAttempts}, ` +
            `${llmMessages.length} messages, ` +
            `maxOutputTokens: ${maxOutputTokens}, ` +
            `thinking: ${thinkingEnabled}`,
        );

        const stream = streamText({
          model: modelInstance,
          system: systemMessage,
          messages: llmMessages,
          maxOutputTokens,
          temperature: thinkingEnabled ? 1 : 0.3,
          abortSignal: llmAbortController.signal,
          tools: agentTools, // undefined for greeting/question → text-only response
          ...(providerOptions && { providerOptions: providerOptions as any }),
        });

        const usage = await stream.usage; // AI SDK exposes this

        console.group(`[ActualCost] Turn ${currentMessages.length}`);
        console.log(
          ` Cache Input tokens:     ${usage?.inputTokenDetails.cacheReadTokens ?? "unknown"}`,
        );
        console.log(
          ` Write Input tokens:     ${usage?.inputTokenDetails.cacheWriteTokens ?? "unknown"}`,
        );
        console.log(
          ` Reasoning Output tokens:    ${usage?.outputTokenDetails.reasoningTokens ?? "unknown"}`,
        );
        console.log(
          ` Text Output tokens:    ${usage?.outputTokenDetails.textTokens ?? "unknown"}`,
        );
        // console.log(`  Total billed:     ${(usage?.inputTokenDetails ?? 0) + (usage?.outputTokenDetails ?? 0)}`);
        console.log(`  Reasoning model:  ${thinkingEnabled}`);

        // Accumulate session total
        if (
          usage?.inputTokenDetails?.cacheReadTokens &&
          usage?.inputTokenDetails?.cacheWriteTokens &&
          usage?.outputTokenDetails?.reasoningTokens &&
          usage?.outputTokenDetails?.textTokens
        ) {
          _sessionTokensInput +=
            usage?.inputTokenDetails?.cacheReadTokens +
            usage?.inputTokenDetails?.cacheWriteTokens;
          _sessionTokensOutput +=
            usage?.outputTokenDetails?.reasoningTokens +
            usage?.outputTokenDetails?.textTokens;
        }
        console.log(
          `  Session total:    ${_sessionTokensInput + _sessionTokensOutput} tokens ` +
            `(in: ${_sessionTokensInput}, out: ${_sessionTokensOutput})`,
        );
        console.groupEnd();

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
                  ? {
                      name: detectedToolCall.toolName,
                      rawParams: detectedToolCall.input as RawToolParams,
                    }
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
              console.log(`[Agent] Tool call detected: ${chunk.toolName}`);
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
                resolveLLM({
                  type: "error",
                  error: (chunk as any).error as Error,
                });
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
              type: "done",
              text: accumulatedText,
              reasoning: accumulatedReasoning,
              anthropicReasoning: null,
              toolCall: detectedToolCall,
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

      // ── Handle abort ──────────────────────────────────────────────────
      if (llmResult.type === "aborted") {
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

      // ── Handle error ──────────────────────────────────────────────────
      if (llmResult.type === "error") {
        console.error(
          `[Agent] LLM error (attempt ${nAttempts}/${CHAT_RETRIES}): ` +
            llmResult.error.message,
        );
        if (nAttempts < CHAT_RETRIES) {
          shouldRetry = true;
          onStreamStateChange({
            status: "idle",
            workspaceId: requireWorkspaceId(),
            abort: () => {
              interruptedWhenIdle = true;
            },
          });
          await sleep(RETRY_DELAY * nAttempts);
          if (interruptedWhenIdle || abortSignal?.aborted) {
            onStreamStateChange(undefined);
            return;
          }
          continue;
        }
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

      // ── Success ───────────────────────────────────────────────────────
      const { text, reasoning, anthropicReasoning, toolCall } = llmResult;

      if (text) {
        console.log(
          `[Agent] Response: ${text.length} chars, ` +
            `~${countTokens(text)} tokens` +
            (toolCall ? `, tool: ${toolCall.toolName}` : ""),
        );
      }

      onAddMessage({
        role: "assistant",
        displayContent: text,
        reasoning,
        anthropicReasoning,
      });
      onStreamStateChange({
        status: "idle",
        workspaceId: requireWorkspaceId(),
        abort: () => {
          interruptedWhenIdle = true;
        },
      });

      if (toolCall) {
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

        onStreamStateChange({
          status: "idle",
          workspaceId: requireWorkspaceId(),
          abort: () => {
            interruptedWhenIdle = true;
          },
        });
      }
    } // end retry while
  } // end agent while

  // ── Finalize plan ─────────────────────────────────────────────────────────
  if (activePlan) {
    const allDone = activePlan.steps.every(
      (s) => s.status === "done" || s.status === "skipped",
    );
    const anyFailed = activePlan.steps.some((s) => s.status === "failed");
    callbacks.onUpdatePlan?.(
      finalizePlan(
        activePlan,
        anyFailed ? "failed" : allDone ? "completed" : "aborted",
      ),
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  clearCache();

  // Log final workspace state stats
  const wsInfo = getWorkspaceStateInfo();
  console.log(
    `[Agent] Run complete | ` +
      `Workspace state: ${wsInfo.fileCount} files, ` +
      `${wsInfo.usedTokens} tokens used | ` +
      `${wsInfo.stats.totalEvictions} evictions, ` +
      `${wsInfo.stats.totalFilesAdded} files added`,
  );

  if (isRunningWhenEnd === "awaiting_user") {
    onStreamStateChange({
      status: "awaiting_user",
      workspaceId: requireWorkspaceId(),
    });
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
    onAddMessage,
    onReplaceLastMessage,
    onStreamStateChange,
    onAddCheckpoint,
    autoApproveEdits,
    autoApproveTerminal,
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

    const approvalType = approvalTypeOfWebTool[toolName];
    if (approvalType) {
      const autoApproved =
        (approvalType === "edits" && autoApproveEdits) ||
        (approvalType === "terminal" && autoApproveTerminal);

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

      if (!autoApproved) return { awaitingUserApproval: true };
    }
  } else {
    validatedParams = opts.validatedParams;
  }

  // Mark running
  const runningMsg: ToolMessage<WebToolName> = {
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
  abortSignal?.addEventListener("abort", () => toolAbortController.abort(), {
    once: true,
  });

  let interrupted = false;

  const onProgress = (_chunk: string) => {
    // progress chunks handled by ToolCard — no state update needed here
  };

  onStreamStateChange({
    status: "tool_running",
    workspaceId: requireWorkspaceId(),
    toolName,
    toolParams: opts.rawParams,
    toolId,
    mcpServerName,
    abort: () => {
      interrupted = true;
      toolAbortController.abort();
    },
  });

  // Execute tool
  let toolResult: any;
  let toolResultStr: string;

  try {
    const impl =
      toolImplementations[toolName as keyof typeof toolImplementations];
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
        toolName,
        errMsg,
        opts.rawParams as Record<string, unknown>,
      );

      // Add an assistant message with correction guidance
      // then return without error so the loop continues
      onAddMessage({
        role: "tool",
        type: "tool_error",
        id: toolId,
        name: toolName,
        content: `${errMsg}\n\n${correctionMsg}`,
        rawParams: opts.rawParams,
        params: validatedParams,
        result: errMsg,
        mcpServerName,
      });
      return {};
    }

    clearCorrectionState(toolId);

    const errorMsg: ToolMessage<WebToolName> = {
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
    const s = onReplaceLastMessage(errorMsg);
    if (!s) onAddMessage(errorMsg);
    return {};
  }

  // ── Phase 6: auto-lint heal after write_file ──────────────────────────────
  if (
    toolName === "write_file" &&
    _currentWorkspaceId &&
    validatedParams.filePath
  ) {
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
            `[LintHealer] Found ${lintResult.errorCount} errors in ${filePath} — feeding back to agent`,
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
  const s = onReplaceLastMessage(successMsg);
  if (!s) onAddMessage(successMsg);

  clearCorrectionState(toolId);
  return {};
}

// ── Checkpoint helper ─────────────────────────────────────────────────────────

function _addUserCheckpoint(callbacks: AgentCallbacks): void {
  callbacks.onAddCheckpoint({
    role: "checkpoint",
    type: "user_edit",
    snapshotByPath: {},
    userModifications: { snapshotByPath: {} },
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
    description: [
      "Create a new empty FILE only.",
      "For creating DIRECTORIES/FOLDERS use create_directory instead.",
      "Use write_file to create a file with content in one step — it's faster.",
      "Only use create_file when you specifically need an empty placeholder file.",
    ].join(" "),
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          "Relative path of the file to create, e.g. 'src/components/Button.tsx'",
        ),
    }),
  }),

  // ADD new create_directory tool (insert after create_file):
  create_directory: tool({
    description: [
      "Create a new DIRECTORY (folder) at the given path.",
      "Creates all parent directories automatically.",
      "Always use this to create folders — never use create_file with isFolder.",
      "Example: create_directory({ dirPath: 'netflix-clone/components' })",
    ].join(" "),
    inputSchema: z.object({
      dirPath: z
        .string()
        .describe(
          "Relative path of the directory to create, e.g. 'netflix-clone/src/components'",
        ),
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
      name: z
        .string()
        .optional()
        .describe("Session name (default: dev-server-PORT)"),
    }),
  }),

  take_screenshot: tool({
    description: [
      "Take a screenshot of a URL and see what it looks like.",
      "Use to verify UI changes, check layout, or inspect visual bugs.",
      "The screenshot is shown in the preview pane.",
    ].join(" "),
    inputSchema: z.object({
      url: z
        .string()
        .optional()
        .describe("URL to screenshot (default: http://localhost:3000)"),
      fullPage: z
        .boolean()
        .optional()
        .describe("Capture full page scroll (default: false)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to screenshot specific element"),
      viewport: z
        .object({
          width: z.number(),
          height: z.number(),
        })
        .optional()
        .describe("Viewport size (default: 1280x800)"),
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
      steps: z
        .array(
          z.object({
            action: z.enum([
              "click",
              "type",
              "navigate",
              "wait",
              "waitForUrl",
              "hover",
              "select",
              "press",
              "screenshot",
              "scroll",
              "clear",
              "assert",
            ]),
            selector: z.string().optional(),
            text: z.string().optional(),
            url: z.string().optional(),
            key: z.string().optional(),
            value: z.string().optional(),
            direction: z.enum(["up", "down"]).optional(),
            timeoutMs: z.number().optional(),
            visible: z.boolean().optional(),
            pattern: z.string().optional(),
          }),
        )
        .describe("Ordered list of browser interaction steps"),
      screenshotOnEachStep: z
        .boolean()
        .optional()
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
      stream: z
        .boolean()
        .optional()
        .describe("Stream output live (default: true)"),
    }),
  }),
} as const;

function _buildAgentTools(chatMode: ChatMode) {
  if (chatMode === "normal") return undefined;
  if (chatMode === "gather") return READ_TOOLS;
  return AGENT_TOOLS;
}
// ── Token budget logging ──────────────────────────────────────────────────────

// function logTokenBudget(
//     label: string,
//     systemPrompt: string,
//     messages: ModelMessage[],
//     contextBlock: string,
// ): void {
//     const systemTokens = estimateTokens(systemPrompt);
//     const contextTokens = estimateTokens(contextBlock);
//     const msgTokens = messages.reduce((sum, m) => {
//         const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
//         return sum + estimateTokens(c);
//     }, 0);
//     const total = systemTokens + contextTokens + msgTokens;

//     console.log(
//         `[TokenBudget] ${label} — ` +
//         `system: ~${systemTokens}, context: ~${contextTokens}, ` +
//         `msgs: ~${msgTokens} (${messages.length}), TOTAL: ~${total}`
//     );
// }

export function buildStaticSystemPrompt(chatMode: ChatMode): string {
  const base =
    chatMode === "agent"
      ? "an expert coding agent with full access to read files, write files, run terminal commands, and search the codebase."
      : chatMode === "gather"
        ? "an expert coding assistant with read-only access to files and search."
        : "an expert coding assistant.";

  const rules = `
Rules:
1. ALWAYS start by understanding the project before acting.
   - On first task: call list_directory("/workspace") to see project structure.
   - Check package.json, pyproject.toml, or go.mod to understand the tech stack.
   - Never create files without knowing what already exists.

2. Think step by step. Before each action, briefly state:
   "I am going to [action] because [reason]."
   After each major step: summarize what was done and what comes next.

3. Verify every action before proceeding:
   - After run_terminal: check exit code. If non-zero, fix before continuing.
   - After write_file: the file is now in <WorkspaceState> — you can reference it.
   - After npm install: verify node_modules exists before importing packages.

4. If something fails twice in a row: STOP, explain what you tried, try a different approach.
   Never repeat the exact same failing command a third time.

5. If the task is ambiguous or under-specified: ask ONE clarifying question before starting.


6. File and directory rules:
   - Never modify files outside /workspace.
   - To create a DIRECTORY: use create_directory({ dirPath: "my-app" })
     Example: create_directory({ dirPath: "netflix-clone/components" })
   - To create a FILE with content: use write_file — it auto-creates parent dirs.
     This is the preferred method for creating files.
   - To create an EMPTY file: use create_file({ filePath: "my-app/placeholder.ts" })
   - NEVER call create_file with a folder path — it will create a file not a folder.
   - Always create parent directories BEFORE writing files inside them.
   - Use correct extensions (.tsx for React components, .ts for utilities).
   - cwd passed to run_terminal must be an EXISTING directory.
   - Set HOME=/home/devuser and XDG_CONFIG_HOME=/tmp/config for any CLI tool.

7. Terminal rules:
   - Set HOME=/home/devuser and XDG_CONFIG_HOME=/tmp/config for CLI tools that write config.
   - Use run_terminal for quick one-off commands.
   - Use start_terminal + run_in_terminal for dev servers and stateful workflows.
   - Always kill_terminal when done with a long-running session.

8. Reading files:
   - Files you have already read are in <WorkspaceState> above — do not re-read them.
   - Use startLine/endLine for large files when you need a specific section.
   - Use search_files to find relevant files before reading them.

9. Today's date: ${new Date().toDateString()}.
`.trim();

  console.log(
    `[SystemPrompt] Built static prompt: ` +
      `~${countTokens(`You are ${base}\n\n${rules}`)} tokens ` +
      `(no workspace context — that's in messages + WorkspaceState block)`,
  );

  return `You are ${base}\n\n${rules}`;
}

// Backwards-compatible alias — snapshot param ignored intentionally
export function buildChatSystemMessage(
  chatMode: ChatMode,
  _snapshot?: WorkspaceSnapshot | null,
): string {
  return buildStaticSystemPrompt(chatMode);
}

// convertMessagesToLLM with compressed version

// export function convertMessagesToLLMWithCompression(
//     messages: ChatMessage[],
//     chatMode: ChatMode,
// ): ModelMessage[] {
//     const result: ModelMessage[] = [];
//     const totalMessages = messages.filter(
//         m => m.role !== "checkpoint" && m.role !== "interrupted_tool"
//     ).length;

//     console.log(
//         `[MsgConversion] Converting ${totalMessages} messages to LLM format`
//     );

//     let toolResultCount = 0;
//     let compressedCount = 0;
//     let messageIndex = 0;

//     for (const msg of messages) {
//         if (msg.role === "checkpoint") continue;
//         if (msg.role === "interrupted_tool") continue;

//         messageIndex++;
//         const ageFromEnd = totalMessages - messageIndex;

//         if (msg.role === "user") {
//             result.push({ role: "user", content: msg.content || "(empty)" });
//             continue;
//         }

//         if (msg.role === "assistant") {
//             result.push({
//                 role: "assistant",
//                 content: msg.displayContent || "(empty)",
//             });
//             continue;
//         }

//         if (msg.role === "tool") {
//             if (msg.type === "success" || msg.type === "tool_error") {
//                 toolResultCount++;
//                 const rawContent = msg.content ?? "";

//                 // ── Tier 1: Recent results (last 3 turns) — keep verbatim ──────
//                 if (ageFromEnd <= 6) {
//                     result.push({
//                         role: "tool",
//                         content: [{
//                             type: "tool-result",
//                             toolCallId: msg.id,
//                             toolName: msg.name,
//                             output: { type: "text" as const, value: rawContent },
//                         }],
//                     });
//                     continue;
//                 }

//                 // ── Tier 2: Mid-age results (turns 4-8) — compress to summary ──
//                 if (ageFromEnd <= 16) {
//                     const compressed = compressToolResult(msg.name, rawContent);
//                     compressedCount++;
//                     result.push({
//                         role: "tool",
//                         content: [{
//                             type: "tool-result",
//                             toolCallId: msg.id,
//                             toolName: msg.name,
//                             output: { type: "text" as const, value: compressed },
//                         }],
//                     });
//                     continue;
//                 }

//                 // ── Tier 3: Old results (8+ turns ago) — stub, never evict ──
//                 // LLMs expect every tool_call to have a matching tool-result.
//                 // Dropping results entirely causes API errors.
//                 compressedCount++;
//                 console.log(
//                     `[MsgConversion] Stubbed old tool result: ${msg.name} ` +
//                     `(${rawContent.length} chars saved)`
//                 );
//                 result.push({
//                     role: "tool",
//                     content: [{
//                         type: "tool-result",
//                         toolCallId: msg.id,
//                         toolName: msg.name,
//                         output: { type: "text" as const, value: "[result omitted — old context]" },
//                     }],
//                 });
//             }
//         }
//     }

//     const savedChars = messages
//         .filter(m => m.role === "tool")
//         .reduce((sum, m: any) => sum + (m.content?.length ?? 0), 0);

//     console.log(
//         `[MsgConversion] Result: ${result.length} messages | ` +
//         `${toolResultCount} tool results (${compressedCount} compressed/evicted)`
//     );

//     return result;
// }

// // ── Tool result compressor ────────────────────────────────────────────────────

// function compressToolResult(toolName: string, content: string): string {
//     const MAX_COMPRESSED_CHARS = 300;

//     // Tool-specific compression
//     switch (toolName) {
//         case "read_file": {
//             const lines = content.split("\n");
//             if (lines.length <= 10) return content;
//             return (
//                 `[File content — ${lines.length} lines, showing first 5]\n` +
//                 lines.slice(0, 5).join("\n") +
//                 `\n... (${lines.length - 5} lines omitted from context)`
//             );
//         }

//         case "run_terminal":
//         case "run_in_terminal": {
//             const lines = content.split("\n").filter(Boolean);
//             const exitMatch = content.match(/\[exit (\d+)\]/);
//             const exitCode = exitMatch ? exitMatch[1] : "?";

//             if (lines.length <= 5) return content;

//             // Keep first 2 lines and last 2 lines (shows start + result)
//             return (
//                 `[Terminal output — exit ${exitCode}, ${lines.length} lines]\n` +
//                 lines.slice(0, 2).join("\n") +
//                 `\n... (${lines.length - 4} lines omitted)\n` +
//                 lines.slice(-2).join("\n")
//             );
//         }

//         case "list_directory": {
//             const lines = content.split("\n");
//             if (lines.length <= 15) return content;
//             return (
//                 lines.slice(0, 12).join("\n") +
//                 `\n... (${lines.length - 12} more entries)`
//             );
//         }

//         case "write_file":
//         case "create_file":
//         case "delete_file":
//             // These are already short — keep verbatim
//             return content;

//         default:
//             if (content.length <= MAX_COMPRESSED_CHARS) return content;
//             return (
//                 content.slice(0, MAX_COMPRESSED_CHARS) +
//                 `... [${content.length - MAX_COMPRESSED_CHARS} chars omitted]`
//             );
//     }
// }

// Keep old function for compatibility
export function convertMessagesToLLM(
  messages: ChatMessage[],
  chatMode: ChatMode,
): ModelMessage[] {
  return convertMessagesToLLMWithCompression(messages, 128_000);
}
