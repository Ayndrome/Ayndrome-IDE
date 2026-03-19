// // src/services/chat/chat-thread.store.ts
// // Main Zustand store for all chat state.
// // Replaces Void's ChatThreadService class, IStorageService, and VSCode Emitter system.
// //
// // Architecture:
// //   - Persisted state (threads, messages) → saved to Convex via chat-storage.ts(chat-storage.ts code is present in chatThreadService.ts. Its combined into one file)
// //   - Stream state (what's running NOW) → in-memory only, never persisted
// //   - All mutations go through this store
// //   - React components subscribe via useChatStore() hook

// import { create } from "zustand";
// import { subscribeWithSelector } from "zustand/middleware";

// import { toast } from "sonner";
// import {
//     ChatThread,
//     ChatMessage,
//     ChatThreadsState,
//     ChatStreamState,
//     ThreadStreamState,
//     StagingSelection,
//     CodespanLink,
//     CheckpointEntry,
//     SimpleFileSnapshot,
//     ToolMessage,
//     WebToolName,
//     newThread,
//     isCheckpoint,
//     isToolMessage,
// } from "../app/features/ide/extensions/chat/types/types";

// import { loadAllThreads, saveThread, deleteThreadFromStorage, runChatAgent, AgentCallbacks, restoreFileSnapshot } from "../app/features/ide/extensions/chat/ChatThreadService";


// // ── Store shape ───────────────────────────────────────────────────────────────

// export type ChatStore = {
//     // ── Persisted state ────────────────────────────────────────────────────────
//     threads: Record<string, ChatThread | undefined>;
//     currentThreadId: string;

//     // ── Runtime state (not persisted) ─────────────────────────────────────────
//     streamState: Record<string, ThreadStreamState>;

//     // Whether initial load from Convex is complete
//     isLoaded: boolean;

//     // ── Settings (could also come from your user settings store) ──────────────
//     chatMode: "normal" | "gather" | "agent";
//     autoApproveEdits: boolean;
//     autoApproveTerminal: boolean;

//     // ── Actions ────────────────────────────────────────────────────────────────

//     // Initialization
//     initialize: (convexClient: any) => Promise<void>;

//     // Thread management
//     openNewThread: () => void;
//     switchToThread: (threadId: string) => void;
//     deleteThread: (threadId: string) => void;
//     duplicateThread: (threadId: string) => void;

//     // Message sending
//     addUserMessageAndStreamResponse: (opts: {
//         userMessage: string;
//         threadId: string;
//         attachments?: StagingSelection[];
//     }) => Promise<void>;

//     editUserMessageAndStreamResponse: (opts: {
//         userMessage: string;
//         messageIdx: number;
//         threadId: string;
//     }) => Promise<void>;

//     // Tool approval
//     approveLatestToolRequest: (threadId: string) => void;
//     rejectLatestToolRequest: (threadId: string) => void;

//     // Abort
//     abortRunning: (threadId: string) => Promise<void>;
//     dismissStreamError: (threadId: string) => void;

//     // Staging selections
//     addStagingSelection: (selection: StagingSelection) => void;
//     removeStagingSelection: (index: number) => void;
//     clearStagingSelections: () => void;

//     // Message editing focus
//     setFocusedMessageIdx: (messageIdx: number | undefined) => void;
//     getFocusedMessageIdx: () => number | undefined;

//     // Codespan links
//     getCodespanLink: (opts: { codespanStr: string; messageIdx: number; threadId: string }) => CodespanLink | undefined;
//     addCodespanLink: (opts: { text: string; link: CodespanLink; messageIdx: number; threadId: string }) => void;

//     // Checkpoint / time travel
//     jumpToCheckpointBeforeMessageIdx: (opts: {
//         threadId: string;
//         messageIdx: number;
//         includeUserModifications: boolean;
//     }) => void;

//     // Settings
//     setChatMode: (mode: "normal" | "gather" | "agent") => void;
//     setAutoApprove: (type: "edits" | "terminal", value: boolean) => void;

//     // Internal helpers (prefixed _ but exposed for agent callbacks)
//     _setStreamState: (threadId: string, state: ThreadStreamState) => void;
//     _addMessageToThread: (threadId: string, message: ChatMessage) => void;
//     _replaceLastMessage: (threadId: string, message: ChatMessage) => boolean;
//     _addCheckpoint: (threadId: string, checkpoint: CheckpointEntry) => void;
//     _saveThread: (threadId: string) => void;
//     _getCurrentThread: () => ChatThread | undefined;
//     _setThreadState: (threadId: string, partial: Partial<ChatThread> | { messages?: ChatMessage[]; state?: ChatThread["state"] }) => void;
//     _setMessageState: (threadId: string, messageIdx: number, partial: Partial<{ stagingSelections: StagingSelection[]; isBeingEdited: boolean }>) => void;
// };

// // ── Store implementation ──────────────────────────────────────────────────────

// export const useChatStore = create<ChatStore>()(
//     subscribeWithSelector((set, get) => ({
//         threads: {},
//         currentThreadId: "",
//         streamState: {},
//         isLoaded: false,
//         chatMode: "agent",
//         autoApproveEdits: false,
//         autoApproveTerminal: false,

//         // ── Initialization ─────────────────────────────────────────────────────

//         initialize: async (convexClient) => {
//             const { initChatStorage } = await import("../app/features/ide/extensions/chat/ChatThreadService");
//             initChatStorage(convexClient);

//             const threads = await loadAllThreads();

//             // Always ensure we have at least one thread
//             let currentThreadId = Object.keys(threads)[0] ?? "";

//             if (!currentThreadId) {
//                 const first = newThread(crypto.randomUUID());
//                 threads[first.id] = first;
//                 currentThreadId = first.id;
//             }

//             // Recover from orphaned running_now tool states
//             // (happens when app was closed mid-tool-execution)
//             for (const thread of Object.values(threads)) {
//                 if (!thread) continue;
//                 const lastMsg = thread.messages[thread.messages.length - 1];
//                 if (lastMsg?.role === "tool" && lastMsg.type === "running_now") {
//                     // Mark it as rejected so the LLM sees a clean state
//                     thread.messages[thread.messages.length - 1] = {
//                         ...lastMsg,
//                         type: "rejected",
//                         content: "Tool was interrupted when the app restarted.",
//                         result: null,
//                     } as ToolMessage<WebToolName>;
//                 }
//             }

//             set({ threads, currentThreadId, isLoaded: true });
//         },

//         // ── Thread management ──────────────────────────────────────────────────

//         openNewThread: () => {
//             const { threads } = get();

//             // Reuse existing empty thread if one exists
//             for (const [id, thread] of Object.entries(threads)) {
//                 if (thread && thread.messages.length === 0) {
//                     set({ currentThreadId: id });
//                     return;
//                 }
//             }

//             // Create new thread
//             const thread = newThread(crypto.randomUUID());
//             set((s) => ({
//                 threads: { ...s.threads, [thread.id]: thread },
//                 currentThreadId: thread.id,
//             }));
//             get()._saveThread(thread.id);
//         },

//         switchToThread: (threadId) => {
//             const { threads, streamState } = get();
//             if (!threads[threadId]) return;
//             set({ currentThreadId: threadId });

//             // Recover stream state for threads that were awaiting_user when we switched away
//             const thread = threads[threadId]!;
//             const lastMsg = thread.messages[thread.messages.length - 1];
//             const currentStream = streamState[threadId];

//             if (!currentStream && lastMsg?.role === "tool" && lastMsg.type === "tool_request") {
//                 get()._setStreamState(threadId, { status: "awaiting_user" });
//             }
//         },

//         deleteThread: (threadId) => {
//             const { threads, currentThreadId } = get();
//             const newThreads = { ...threads };
//             delete newThreads[threadId];

//             // If deleting current thread, switch to another
//             let newCurrentId = currentThreadId;
//             if (threadId === currentThreadId) {
//                 newCurrentId = Object.keys(newThreads)[0] ?? "";
//                 if (!newCurrentId) {
//                     const fallback = newThread(crypto.randomUUID());
//                     newThreads[fallback.id] = fallback;
//                     newCurrentId = fallback.id;
//                     saveThread(fallback);
//                 }
//             }

//             set({ threads: newThreads, currentThreadId: newCurrentId });
//             deleteThreadFromStorage(threadId);
//         },

//         duplicateThread: (threadId) => {
//             const { threads } = get();
//             const original = threads[threadId];
//             if (!original) return;

//             const copy: ChatThread = {
//                 ...structuredClone(original),
//                 id: crypto.randomUUID(),
//                 title: `${original.title} (copy)`,
//                 createdAt: new Date().toISOString(),
//                 lastModified: new Date().toISOString(),
//             };

//             set((s) => ({ threads: { ...s.threads, [copy.id]: copy } }));
//             saveThread(copy);
//         },

//         // ── Message sending ────────────────────────────────────────────────────

//         addUserMessageAndStreamResponse: async ({ userMessage, threadId, attachments }) => {
//             const { threads, streamState, chatMode, autoApproveEdits, autoApproveTerminal } = get();
//             const thread = threads[threadId];
//             if (!thread) return;

//             // Abort any existing run first
//             if (streamState[threadId]) {
//                 await get().abortRunning(threadId);
//             }

//             // If user jumped back in history, truncate messages from that point
//             if (thread.state.currentCheckpointIdx !== null) {
//                 const idx = thread.state.currentCheckpointIdx;
//                 get()._setThreadState(threadId, {
//                     messages: thread.messages.slice(0, idx + 1),
//                     state: { ...thread.state, currentCheckpointIdx: null },
//                 });
//             }

//             // Add checkpoint before first user message
//             if (thread.messages.length === 0) {
//                 get()._addCheckpoint(threadId, {
//                     role: "checkpoint",
//                     type: "user_edit",
//                     snapshotByPath: {},
//                     userModifications: { snapshotByPath: {} },
//                 });
//             }

//             // Build user message content (include attachment summaries)
//             const attachmentSummary = _buildAttachmentSummary(attachments ?? thread.state.stagingSelections);
//             const fullContent = attachmentSummary
//                 ? `${userMessage}\n\n---\nATTACHMENTS\n${attachmentSummary}`
//                 : userMessage;

//             // Add user message
//             get()._addMessageToThread(threadId, {
//                 role: "user",
//                 content: fullContent,
//                 displayContent: userMessage,
//                 attachments: attachments ?? thread.state.stagingSelections,
//                 state: {
//                     stagingSelections: attachments ?? thread.state.stagingSelections,
//                     isBeingEdited: false,
//                 },
//             });

//             // Clear staging after send
//             get()._setThreadState(threadId, {
//                 state: {
//                     ...get().threads[threadId]!.state,
//                     stagingSelections: [],
//                     currentCheckpointIdx: null,
//                 },
//             });

//             // Build agent callbacks
//             const callbacks = _buildAgentCallbacks(threadId, get, chatMode, autoApproveEdits, autoApproveTerminal);

//             // Create abort controller for this run
//             const abortController = new AbortController();

//             // Update streaming state
//             get()._setStreamState(threadId, {
//                 status: "streaming",
//                 partialText: "",
//                 partialReasoning: "",
//                 partialToolCall: null,
//                 abort: () => abortController.abort(),
//             });

//             // Run agent (fire and forget — UI subscribes to streamState)
//             runChatAgent(callbacks, { abortSignal: abortController.signal }).catch((err) => {
//                 console.error("[ChatAgent] Unhandled error:", err);
//                 get()._setStreamState(threadId, {
//                     status: "error",
//                     message: err.message ?? "An unexpected error occurred.",
//                     fullError: err,
//                 });
//             });
//         },

//         editUserMessageAndStreamResponse: async ({ userMessage, messageIdx, threadId }) => {
//             const { threads } = get();
//             const thread = threads[threadId];
//             if (!thread) return;

//             const targetMsg = thread.messages[messageIdx];
//             if (!targetMsg || targetMsg.role !== "user") {
//                 throw new Error("Can only edit user messages.");
//             }

//             // Preserve attachments from the original message
//             const attachments = targetMsg.attachments ?? [];

//             // Truncate to just before this message
//             get()._setThreadState(threadId, {
//                 messages: thread.messages.slice(0, messageIdx),
//             });

//             // Re-send as new message
//             await get().addUserMessageAndStreamResponse({
//                 userMessage,
//                 threadId,
//                 attachments,
//             });
//         },

//         // ── Tool approval ──────────────────────────────────────────────────────

//         approveLatestToolRequest: (threadId) => {
//             const { threads, chatMode, autoApproveEdits, autoApproveTerminal } = get();
//             const thread = threads[threadId];
//             if (!thread) return;

//             const lastMsg = thread.messages[thread.messages.length - 1];
//             if (!(lastMsg?.role === "tool" && lastMsg.type === "tool_request")) return;

//             const abortController = new AbortController();
//             const callbacks = _buildAgentCallbacks(threadId, get, chatMode, autoApproveEdits, autoApproveTerminal);

//             runChatAgent(callbacks, {
//                 callThisToolFirst: lastMsg as ToolMessage<WebToolName> & { type: "tool_request" },
//                 abortSignal: abortController.signal,
//             }).catch((err) => {
//                 get()._setStreamState(threadId, {
//                     status: "error",
//                     message: err.message,
//                     fullError: err,
//                 });
//             });
//         },

//         rejectLatestToolRequest: (threadId) => {
//             const { threads } = get();
//             const thread = threads[threadId];
//             if (!thread) return;

//             const lastMsg = thread.messages[thread.messages.length - 1];
//             if (!(lastMsg?.role === "tool" && lastMsg.type !== "invalid_params")) return;

//             get()._replaceLastMessage(threadId, {
//                 ...lastMsg,
//                 type: "rejected",
//                 content: "Tool call was rejected by the user.",
//                 result: null,
//             } as ToolMessage<WebToolName>);

//             get()._setStreamState(threadId, undefined);
//         },

//         // ── Abort ──────────────────────────────────────────────────────────────

//         abortRunning: async (threadId) => {
//             const { streamState, threads } = get();
//             const stream = streamState[threadId];
//             if (!stream) return;

//             const thread = threads[threadId];
//             if (!thread) return;

//             // Save partial content depending on current state
//             if (stream.status === "streaming") {
//                 if (stream.partialText || stream.partialToolCall) {
//                     get()._addMessageToThread(threadId, {
//                         role: "assistant",
//                         displayContent: stream.partialText,
//                         reasoning: stream.partialReasoning,
//                         anthropicReasoning: null,
//                     });
//                     if (stream.partialToolCall) {
//                         get()._addMessageToThread(threadId, {
//                             role: "interrupted_tool",
//                             name: stream.partialToolCall.name as WebToolName,
//                             mcpServerName: undefined,
//                         });
//                     }
//                 }
//                 stream.abort();
//             } else if (stream.status === "tool_running") {
//                 stream.abort();
//             } else if (stream.status === "awaiting_user") {
//                 get().rejectLatestToolRequest(threadId);
//             } else if (stream.status === "idle") {
//                 stream.abort();
//             }

//             get()._addCheckpoint(threadId, {
//                 role: "checkpoint",
//                 type: "user_edit",
//                 snapshotByPath: {},
//                 userModifications: { snapshotByPath: {} },
//             });

//             get()._setStreamState(threadId, undefined);
//         },

//         dismissStreamError: (threadId) => {
//             get()._setStreamState(threadId, undefined);
//         },

//         // ── Staging selections ─────────────────────────────────────────────────

//         addStagingSelection: (selection) => {
//             const { currentThreadId, threads } = get();
//             const thread = threads[currentThreadId];
//             if (!thread) return;

//             const focusedIdx = get().getFocusedMessageIdx();

//             if (focusedIdx !== undefined) {
//                 // Add to the focused (editing) message's staging
//                 const msg = thread.messages[focusedIdx];
//                 if (msg?.role !== "user") return;

//                 const existing = msg.state.stagingSelections;
//                 const deduped = _dedupeSelection(existing, selection);
//                 get()._setMessageState(currentThreadId, focusedIdx, {
//                     stagingSelections: deduped,
//                 });
//             } else {
//                 // Add to thread-level staging (next message)
//                 const existing = thread.state.stagingSelections;
//                 const deduped = _dedupeSelection(existing, selection);
//                 get()._setThreadState(currentThreadId, {
//                     state: { ...thread.state, stagingSelections: deduped },
//                 });
//             }
//         },

//         removeStagingSelection: (index) => {
//             const { currentThreadId, threads } = get();
//             const thread = threads[currentThreadId];
//             if (!thread) return;

//             const focusedIdx = get().getFocusedMessageIdx();

//             if (focusedIdx !== undefined) {
//                 const msg = thread.messages[focusedIdx];
//                 if (msg?.role !== "user") return;
//                 const newSelections = msg.state.stagingSelections.filter((_, i) => i !== index);
//                 get()._setMessageState(currentThreadId, focusedIdx, { stagingSelections: newSelections });
//             } else {
//                 const newSelections = thread.state.stagingSelections.filter((_, i) => i !== index);
//                 get()._setThreadState(currentThreadId, {
//                     state: { ...thread.state, stagingSelections: newSelections },
//                 });
//             }
//         },

//         clearStagingSelections: () => {
//             const { currentThreadId, threads } = get();
//             const thread = threads[currentThreadId];
//             if (!thread) return;
//             get()._setThreadState(currentThreadId, {
//                 state: { ...thread.state, stagingSelections: [] },
//             });
//         },

//         // ── Message editing focus ──────────────────────────────────────────────

//         setFocusedMessageIdx: (messageIdx) => {
//             const { currentThreadId, threads } = get();
//             const thread = threads[currentThreadId];
//             if (!thread) return;
//             get()._setThreadState(currentThreadId, {
//                 state: { ...thread.state, focusedMessageIdx: messageIdx },
//             });
//         },

//         getFocusedMessageIdx: () => {
//             const { currentThreadId, threads } = get();
//             const thread = threads[currentThreadId];
//             if (!thread) return undefined;

//             const idx = thread.state.focusedMessageIdx;
//             if (idx === undefined) return undefined;

//             const msg = thread.messages[idx];
//             if (!msg || msg.role !== "user") return undefined;

//             return idx;
//         },

//         // ── Codespan links ─────────────────────────────────────────────────────

//         getCodespanLink: ({ codespanStr, messageIdx, threadId }) => {
//             const thread = get().threads[threadId];
//             if (!thread) return undefined;
//             return thread.state.codespanLinks[messageIdx]?.[codespanStr];
//         },

//         addCodespanLink: ({ text, link, messageIdx, threadId }) => {
//             const thread = get().threads[threadId];
//             if (!thread) return;
//             set((s) => {
//                 const t = s.threads[threadId];
//                 if (!t) return s;
//                 return {
//                     threads: {
//                         ...s.threads,
//                         [threadId]: {
//                             ...t,
//                             state: {
//                                 ...t.state,
//                                 codespanLinks: {
//                                     ...t.state.codespanLinks,
//                                     [messageIdx]: {
//                                         ...t.state.codespanLinks[messageIdx],
//                                         [text]: link,
//                                     },
//                                 },
//                             },
//                         },
//                     },
//                 };
//             });
//         },

//         // ── Checkpoint time travel ─────────────────────────────────────────────

//         jumpToCheckpointBeforeMessageIdx: async ({ threadId, messageIdx, includeUserModifications }) => {
//             const { threads, streamState } = get();
//             const thread = threads[threadId];
//             if (!thread) return;

//             // Do not jump while something is running
//             if (streamState[threadId]) return;

//             // Find the checkpoint just before messageIdx
//             let targetCheckpoint: CheckpointEntry | null = null;
//             let targetIdx = -1;

//             for (let i = messageIdx - 1; i >= 0; i--) {
//                 const msg = thread.messages[i];
//                 if (isCheckpoint(msg)) {
//                     targetCheckpoint = msg;
//                     targetIdx = i;
//                     break;
//                 }
//             }

//             if (!targetCheckpoint || targetIdx === -1) return;

//             const fromIdx = thread.state.currentCheckpointIdx ?? thread.messages.length - 1;

//             if (fromIdx === targetIdx) return;

//             // Restore files
//             const snapshotToUse = includeUserModifications
//                 ? { ...targetCheckpoint.snapshotByPath, ...targetCheckpoint.userModifications.snapshotByPath }
//                 : targetCheckpoint.snapshotByPath;

//             for (const [filePath, snapshot] of Object.entries(snapshotToUse)) {
//                 if (snapshot) {
//                     await restoreFileSnapshot(filePath, snapshot.content);
//                 }
//             }

//             // Update checkpoint index
//             get()._setThreadState(threadId, {
//                 state: {
//                     ...thread.state,
//                     currentCheckpointIdx: targetIdx,
//                 },
//             });
//         },

//         // ── Settings ───────────────────────────────────────────────────────────

//         setChatMode: (mode) => set({ chatMode: mode }),

//         setAutoApprove: (type, value) => {
//             if (type === "edits") set({ autoApproveEdits: value });
//             else set({ autoApproveTerminal: value });
//         },

//         // ── Internal helpers ───────────────────────────────────────────────────

//         _setStreamState: (threadId, state) => {
//             set((s) => ({ streamState: { ...s.streamState, [threadId]: state } }));
//         },

//         _addMessageToThread: (threadId, message) => {
//             set((s) => {
//                 const thread = s.threads[threadId];
//                 if (!thread) return s;
//                 const updated: ChatThread = {
//                     ...thread,
//                     lastModified: new Date().toISOString(),
//                     messages: [...thread.messages, message],
//                 };
//                 // Auto-generate title from first user message
//                 if (message.role === "user" && thread.messages.filter(m => m.role === "user").length === 0) {
//                     updated.title = message.displayContent.slice(0, 50) + (message.displayContent.length > 50 ? "…" : "");
//                 }
//                 const newThreads = { ...s.threads, [threadId]: updated };
//                 // Persist async (don't await — fire and forget)
//                 saveThread(updated);
//                 return { threads: newThreads };
//             });
//         },

//         _replaceLastMessage: (threadId, message) => {
//             const { threads } = get();
//             const thread = threads[threadId];
//             if (!thread || thread.messages.length === 0) return false;

//             const lastMsg = thread.messages[thread.messages.length - 1];
//             // Only replace tool messages (not user/assistant)
//             if (lastMsg.role !== "tool") return false;

//             set((s) => {
//                 const t = s.threads[threadId];
//                 if (!t) return s;
//                 const msgs = [...t.messages];
//                 msgs[msgs.length - 1] = message;
//                 const updated = {
//                     ...t,
//                     lastModified: new Date().toISOString(),
//                     messages: msgs,
//                 };
//                 saveThread(updated);
//                 return { threads: { ...s.threads, [threadId]: updated } };
//             });

//             return true;
//         },

//         _addCheckpoint: (threadId, checkpoint) => {
//             get()._addMessageToThread(threadId, checkpoint);
//         },

//         _saveThread: (threadId) => {
//             const thread = get().threads[threadId];
//             if (thread) saveThread(thread);
//         },

//         _getCurrentThread: () => {
//             const { threads, currentThreadId } = get();
//             return threads[currentThreadId];
//         },

//         _setThreadState: (threadId, partial) => {
//             set((s) => {
//                 const thread = s.threads[threadId];
//                 if (!thread) return s;
//                 const updated = { ...thread, ...partial, lastModified: new Date().toISOString() };
//                 saveThread(updated);
//                 return { threads: { ...s.threads, [threadId]: updated } };
//             });
//         },

//         _setMessageState: (threadId, messageIdx, partial) => {
//             set((s) => {
//                 const thread = s.threads[threadId];
//                 if (!thread) return s;
//                 const msgs = [...thread.messages];
//                 const msg = msgs[messageIdx];
//                 if (!msg || msg.role !== "user") return s;
//                 msgs[messageIdx] = {
//                     ...msg,
//                     state: { ...msg.state, ...partial },
//                 };
//                 const updated = { ...thread, messages: msgs, lastModified: new Date().toISOString() };
//                 saveThread(updated);
//                 return { threads: { ...s.threads, [threadId]: updated } };
//             });
//         },
//     } as ChatStore)
//     ));

// // ── Private helpers ───────────────────────────────────────────────────────────

// // Builds the AgentCallbacks object wired to the store for a specific thread
// function _buildAgentCallbacks(
//     threadId: string,
//     get: () => ChatStore,
//     chatMode: "normal" | "gather" | "agent",
//     autoApproveEdits: boolean,
//     autoApproveTerminal: boolean
// ): AgentCallbacks {
//     return {
//         onStreamStateChange: (state) => get()._setStreamState(threadId, state),
//         onAddMessage: (msg) => get()._addMessageToThread(threadId, msg),
//         onReplaceLastMessage: (msg) => get()._replaceLastMessage(threadId, msg),
//         onAddCheckpoint: (cp) => get()._addCheckpoint(threadId, cp),
//         getMessages: () => get().threads[threadId]?.messages ?? [],
//         onNotify: ({ message, type }) => {
//             if (type === "error") toast.error(message);
//             else toast.success(message);
//         },
//         chatMode,
//         autoApproveEdits,
//         autoApproveTerminal,
//     };
// }

// // Sets thread-level state without overwriting messages
// function _setThreadStateHelper(
//     get: () => ChatStore,
//     set: (fn: (s: ChatStore) => Partial<ChatStore>) => void,
//     threadId: string,
//     partial: Partial<ChatThread>
// ) {
//     set((s) => {
//         const thread = s.threads[threadId];
//         if (!thread) return s;
//         const updated = { ...thread, ...partial, lastModified: new Date().toISOString() };
//         saveThread(updated);
//         return { threads: { ...s.threads, [threadId]: updated } };
//     });
// }

// // _setThreadState and _setMessageState are defined in the ChatStore type above.

// // Deduplicates staging selections (same file/range shouldn't appear twice)
// function _dedupeSelection(
//     existing: StagingSelection[],
//     newSel: StagingSelection
// ): StagingSelection[] {
//     const isDuplicate = existing.some((s) => {
//         if (s.type !== newSel.type) return false;
//         if (s.type === "File" && newSel.type === "File") {
//             return s.filePath === newSel.filePath;
//         }
//         if (s.type === "CodeSelection" && newSel.type === "CodeSelection") {
//             return (
//                 s.filePath === newSel.filePath &&
//                 s.range[0] === newSel.range[0] &&
//                 s.range[1] === newSel.range[1]
//             );
//         }
//         if (s.type === "Folder" && newSel.type === "Folder") {
//             return s.folderPath === newSel.folderPath;
//         }
//         return false;
//     });

//     if (isDuplicate) {
//         // Overwrite existing (text may have changed)
//         return existing.map((s) => {
//             if (s.type === "File" && newSel.type === "File" && s.filePath === newSel.filePath) return newSel;
//             if (s.type === "CodeSelection" && newSel.type === "CodeSelection" &&
//                 s.filePath === newSel.filePath && s.range[0] === newSel.range[0]) return newSel;
//             if (s.type === "Folder" && newSel.type === "Folder" && s.folderPath === newSel.folderPath) return newSel;
//             return s;
//         });
//     }

//     return [...existing, newSel];
// }

// // Builds an attachment summary string for the LLM from staging selections
// function _buildAttachmentSummary(selections: StagingSelection[]): string {
//     if (!selections.length) return "";
//     return selections
//         .map((s) => {
//             if (s.type === "File") return `File: ${s.filePath}`;
//             if (s.type === "CodeSelection") return `Code selection: ${s.filePath} lines ${s.range[0]}-${s.range[1]}`;
//             if (s.type === "Folder") return `Folder: ${s.folderPath}`;
//             return "";
//         })
//         .filter(Boolean)
//         .join("\n");
// }


// src/store/chat-thread-store.ts
// Fixed: workspaceId threaded through all saveThread calls,
// ThreadStreamState shapes include workspaceId,
// loadAllThreads receives workspaceId.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { toast } from "sonner";
import {
    ChatThread,
    ChatMessage,
    ThreadStreamState,
    StagingSelection,
    CodespanLink,
    CheckpointEntry,
    ToolMessage,
    WebToolName,
    newThread,
    isCheckpoint,
    isToolMessage,
} from "../app/features/ide/extensions/chat/types/types";
import {
    loadAllThreads,
    saveThread,
    deleteThreadFromStorage,
    runChatAgent,
    AgentCallbacks,
    restoreFileSnapshot,
    initChatStorage,
    setAgentWorkspace,
} from "../app/features/ide/extensions/chat/ChatThreadService";

// ── Store shape ───────────────────────────────────────────────────────────────

export type ChatStore = {
    // ── Persisted ─────────────────────────────────────────────────────────────
    threads: Record<string, ChatThread | undefined>;
    currentThreadId: string;

    // ── Runtime ───────────────────────────────────────────────────────────────
    streamState: Record<string, ThreadStreamState>;
    isLoaded: boolean;

    // ── Workspace context ──────────────────────────────────────────────────────
    // Set once when IDE mounts — used by saveThread + agent tools
    workspaceId: string;

    // ── Settings ───────────────────────────────────────────────────────────────
    chatMode: "normal" | "gather" | "agent";
    autoApproveEdits: boolean;
    autoApproveTerminal: boolean;

    // ── Actions ────────────────────────────────────────────────────────────────

    initialize: (convexClient: any, workspaceId: string) => Promise<void>;

    openNewThread: () => void;
    switchToThread: (threadId: string) => void;
    deleteThread: (threadId: string) => void;
    duplicateThread: (threadId: string) => void;

    addUserMessageAndStreamResponse: (opts: {
        userMessage: string;
        threadId: string;
        attachments?: StagingSelection[];
    }) => Promise<void>;

    editUserMessageAndStreamResponse: (opts: {
        userMessage: string;
        messageIdx: number;
        threadId: string;
    }) => Promise<void>;

    approveLatestToolRequest: (threadId: string) => void;
    rejectLatestToolRequest: (threadId: string) => void;

    abortRunning: (threadId: string) => Promise<void>;
    dismissStreamError: (threadId: string) => void;

    addStagingSelection: (selection: StagingSelection) => void;
    removeStagingSelection: (index: number) => void;
    clearStagingSelections: () => void;

    setFocusedMessageIdx: (messageIdx: number | undefined) => void;
    getFocusedMessageIdx: () => number | undefined;

    getCodespanLink: (opts: { codespanStr: string; messageIdx: number; threadId: string }) => CodespanLink | undefined;
    addCodespanLink: (opts: { text: string; link: CodespanLink; messageIdx: number; threadId: string }) => void;

    jumpToCheckpointBeforeMessageIdx: (opts: {
        threadId: string;
        messageIdx: number;
        includeUserModifications: boolean;
    }) => void;

    setChatMode: (mode: "normal" | "gather" | "agent") => void;
    setAutoApprove: (type: "edits" | "terminal", value: boolean) => void;

    // ── Internals ──────────────────────────────────────────────────────────────
    _setStreamState: (threadId: string, state: ThreadStreamState) => void;
    _addMessageToThread: (threadId: string, message: ChatMessage) => void;
    _replaceLastMessage: (threadId: string, message: ChatMessage) => boolean;
    _addCheckpoint: (threadId: string, checkpoint: CheckpointEntry) => void;
    _saveThread: (threadId: string) => void;
    _getCurrentThread: () => ChatThread | undefined;
    _setThreadState: (threadId: string, partial: Partial<ChatThread> | { messages?: ChatMessage[]; state?: ChatThread["state"] }) => void;
    _setMessageState: (threadId: string, messageIdx: number, partial: Partial<{ stagingSelections: StagingSelection[]; isBeingEdited: boolean }>) => void;
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
    subscribeWithSelector((set, get) => ({
        threads: {},
        currentThreadId: "",
        streamState: {},
        isLoaded: false,
        workspaceId: "",
        chatMode: "agent",
        autoApproveEdits: false,
        autoApproveTerminal: false,

        // ── Initialize ────────────────────────────────────────────────────────
        // Called from IDEWorkspace on mount with the Convex client + workspaceId.
        // Sets workspace context for agent tools + loads persisted threads.

        initialize: async (convexClient, workspaceId) => {
            // Wire Convex client into storage layer
            initChatStorage(convexClient);

            // Wire workspaceId into agent tool layer
            setAgentWorkspace(workspaceId);

            // Store workspaceId in Zustand so all saveThread calls can use it
            set({ workspaceId });

            // Load threads scoped to this workspace
            const threads = await loadAllThreads(workspaceId);

            let currentThreadId = Object.keys(threads)[0] ?? "";

            if (!currentThreadId) {
                const first = newThread(crypto.randomUUID());
                threads[first.id] = first;
                currentThreadId = first.id;
            }

            // Recover orphaned running_now tool states (app closed mid-execution)
            for (const thread of Object.values(threads)) {
                if (!thread) continue;
                const lastMsg = thread.messages[thread.messages.length - 1];
                if (lastMsg?.role === "tool" && lastMsg.type === "running_now") {
                    thread.messages[thread.messages.length - 1] = {
                        ...lastMsg,
                        type: "rejected",
                        content: "Tool was interrupted when the app restarted.",
                        result: null,
                    } as ToolMessage<WebToolName>;
                }
            }

            set({ threads, currentThreadId, isLoaded: true });
        },

        // ── Thread management ──────────────────────────────────────────────────

        openNewThread: () => {
            const { threads } = get();
            for (const [id, thread] of Object.entries(threads)) {
                if (thread && thread.messages.length === 0) {
                    set({ currentThreadId: id });
                    return;
                }
            }
            const thread = newThread(crypto.randomUUID());
            set((s) => ({
                threads: { ...s.threads, [thread.id]: thread },
                currentThreadId: thread.id,
            }));
            get()._saveThread(thread.id);
        },

        switchToThread: (threadId) => {
            const { threads, streamState } = get();
            if (!threads[threadId]) return;
            set({ currentThreadId: threadId });

            const thread = threads[threadId]!;
            const lastMsg = thread.messages[thread.messages.length - 1];
            const currentStream = streamState[threadId];
            const wid = get().workspaceId;

            if (!currentStream && lastMsg?.role === "tool" && lastMsg.type === "tool_request") {
                get()._setStreamState(threadId, {
                    status: "awaiting_user",
                    workspaceId: wid,
                });
            }
        },

        deleteThread: (threadId) => {
            const { threads, currentThreadId, workspaceId } = get();
            const newThreads = { ...threads };
            delete newThreads[threadId];

            let newCurrentId = currentThreadId;
            if (threadId === currentThreadId) {
                newCurrentId = Object.keys(newThreads)[0] ?? "";
                if (!newCurrentId) {
                    const fallback = newThread(crypto.randomUUID());
                    newThreads[fallback.id] = fallback;
                    newCurrentId = fallback.id;
                    saveThread(fallback, workspaceId);
                }
            }

            set({ threads: newThreads, currentThreadId: newCurrentId });
            deleteThreadFromStorage(threadId);
        },

        duplicateThread: (threadId) => {
            const { threads, workspaceId } = get();
            const original = threads[threadId];
            if (!original) return;

            const copy: ChatThread = {
                ...structuredClone(original),
                id: crypto.randomUUID(),
                title: `${original.title} (copy)`,
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
            };

            set((s) => ({ threads: { ...s.threads, [copy.id]: copy } }));
            saveThread(copy, workspaceId);
        },

        // ── Message sending ────────────────────────────────────────────────────

        addUserMessageAndStreamResponse: async ({ userMessage, threadId, attachments }) => {
            const { threads, streamState, chatMode, autoApproveEdits, autoApproveTerminal, workspaceId } = get();
            const thread = threads[threadId];
            if (!thread) return;

            if (streamState[threadId]) {
                await get().abortRunning(threadId);
            }

            if (thread.state.currentCheckpointIdx !== null) {
                const idx = thread.state.currentCheckpointIdx;
                get()._setThreadState(threadId, {
                    messages: thread.messages.slice(0, idx + 1),
                    state: { ...thread.state, currentCheckpointIdx: null },
                });
            }

            if (thread.messages.length === 0) {
                get()._addCheckpoint(threadId, {
                    role: "checkpoint",
                    type: "user_edit",
                    snapshotByPath: {},
                    userModifications: { snapshotByPath: {} },
                });
            }

            const attachmentSummary = _buildAttachmentSummary(
                attachments ?? thread.state.stagingSelections
            );
            const fullContent = attachmentSummary
                ? `${userMessage}\n\n---\nATTACHMENTS\n${attachmentSummary}`
                : userMessage;

            get()._addMessageToThread(threadId, {
                role: "user",
                content: fullContent,
                displayContent: userMessage,
                attachments: attachments ?? thread.state.stagingSelections,
                state: {
                    stagingSelections: attachments ?? thread.state.stagingSelections,
                    isBeingEdited: false,
                },
            });

            get()._setThreadState(threadId, {
                state: {
                    ...get().threads[threadId]!.state,
                    stagingSelections: [],
                    currentCheckpointIdx: null,
                },
            });

            const callbacks = _buildAgentCallbacks(
                threadId, get, chatMode, autoApproveEdits, autoApproveTerminal, workspaceId
            );
            const abortController = new AbortController();

            // ← workspaceId now included
            get()._setStreamState(threadId, {
                status: "streaming",
                workspaceId,
                partialText: "",
                partialReasoning: "",
                partialToolCall: null,
                abort: () => abortController.abort(),
            });

            runChatAgent(callbacks, { abortSignal: abortController.signal }).catch((err) => {
                console.error("[ChatAgent] Unhandled error:", err);
                get()._setStreamState(threadId, {
                    status: "error",
                    message: err.message ?? "An unexpected error occurred.",
                    fullError: err,
                });
            });
        },

        editUserMessageAndStreamResponse: async ({ userMessage, messageIdx, threadId }) => {
            const { threads } = get();
            const thread = threads[threadId];
            if (!thread) return;

            const targetMsg = thread.messages[messageIdx];
            if (!targetMsg || targetMsg.role !== "user") {
                throw new Error("Can only edit user messages.");
            }

            const attachments = targetMsg.attachments ?? [];
            get()._setThreadState(threadId, {
                messages: thread.messages.slice(0, messageIdx),
            });
            await get().addUserMessageAndStreamResponse({ userMessage, threadId, attachments });
        },

        // ── Tool approval ──────────────────────────────────────────────────────

        approveLatestToolRequest: (threadId) => {
            const { threads, chatMode, autoApproveEdits, autoApproveTerminal, workspaceId } = get();
            const thread = threads[threadId];
            if (!thread) return;

            const lastMsg = thread.messages[thread.messages.length - 1];
            if (!(lastMsg?.role === "tool" && lastMsg.type === "tool_request")) return;

            const abortController = new AbortController();
            const callbacks = _buildAgentCallbacks(
                threadId, get, chatMode, autoApproveEdits, autoApproveTerminal, workspaceId
            );

            runChatAgent(callbacks, {
                callThisToolFirst: lastMsg as ToolMessage<WebToolName> & { type: "tool_request" },
                abortSignal: abortController.signal,
            }).catch((err) => {
                get()._setStreamState(threadId, {
                    status: "error",
                    message: err.message,
                    fullError: err,
                });
            });
        },

        rejectLatestToolRequest: (threadId) => {
            const { threads } = get();
            const thread = threads[threadId];
            if (!thread) return;

            const lastMsg = thread.messages[thread.messages.length - 1];
            if (!(lastMsg?.role === "tool" && lastMsg.type !== "invalid_params")) return;

            get()._replaceLastMessage(threadId, {
                ...lastMsg,
                type: "rejected",
                content: "Tool call was rejected by the user.",
                result: null,
            } as ToolMessage<WebToolName>);

            get()._setStreamState(threadId, undefined);
        },

        // ── Abort ──────────────────────────────────────────────────────────────

        abortRunning: async (threadId) => {
            const { streamState, threads } = get();
            const stream = streamState[threadId];
            if (!stream) return;

            const thread = threads[threadId];
            if (!thread) return;

            if (stream.status === "streaming") {
                if (stream.partialText || stream.partialToolCall) {
                    get()._addMessageToThread(threadId, {
                        role: "assistant",
                        displayContent: stream.partialText,
                        reasoning: stream.partialReasoning,
                        anthropicReasoning: null,
                    });
                    if (stream.partialToolCall) {
                        get()._addMessageToThread(threadId, {
                            role: "interrupted_tool",
                            name: stream.partialToolCall.name as WebToolName,
                            mcpServerName: undefined,
                        });
                    }
                }
                stream.abort();
            } else if (stream.status === "tool_running") {
                stream.abort();
            } else if (stream.status === "awaiting_user") {
                get().rejectLatestToolRequest(threadId);
            } else if (stream.status === "idle") {
                stream.abort();
            }

            get()._addCheckpoint(threadId, {
                role: "checkpoint",
                type: "user_edit",
                snapshotByPath: {},
                userModifications: { snapshotByPath: {} },
            });

            get()._setStreamState(threadId, undefined);
        },

        dismissStreamError: (threadId) => {
            get()._setStreamState(threadId, undefined);
        },

        // ── Staging selections ─────────────────────────────────────────────────

        addStagingSelection: (selection) => {
            const { currentThreadId, threads } = get();
            const thread = threads[currentThreadId];
            if (!thread) return;

            const focusedIdx = get().getFocusedMessageIdx();
            if (focusedIdx !== undefined) {
                const msg = thread.messages[focusedIdx];
                if (msg?.role !== "user") return;
                get()._setMessageState(currentThreadId, focusedIdx, {
                    stagingSelections: _dedupeSelection(msg.state.stagingSelections, selection),
                });
            } else {
                get()._setThreadState(currentThreadId, {
                    state: {
                        ...thread.state,
                        stagingSelections: _dedupeSelection(
                            thread.state.stagingSelections, selection
                        ),
                    },
                });
            }
        },

        removeStagingSelection: (index) => {
            const { currentThreadId, threads } = get();
            const thread = threads[currentThreadId];
            if (!thread) return;

            const focusedIdx = get().getFocusedMessageIdx();
            if (focusedIdx !== undefined) {
                const msg = thread.messages[focusedIdx];
                if (msg?.role !== "user") return;
                get()._setMessageState(currentThreadId, focusedIdx, {
                    stagingSelections: msg.state.stagingSelections.filter((_, i) => i !== index),
                });
            } else {
                get()._setThreadState(currentThreadId, {
                    state: {
                        ...thread.state,
                        stagingSelections: thread.state.stagingSelections.filter((_, i) => i !== index),
                    },
                });
            }
        },

        clearStagingSelections: () => {
            const { currentThreadId, threads } = get();
            const thread = threads[currentThreadId];
            if (!thread) return;
            get()._setThreadState(currentThreadId, {
                state: { ...thread.state, stagingSelections: [] },
            });
        },

        // ── Message editing focus ──────────────────────────────────────────────

        setFocusedMessageIdx: (messageIdx) => {
            const { currentThreadId, threads } = get();
            const thread = threads[currentThreadId];
            if (!thread) return;
            get()._setThreadState(currentThreadId, {
                state: { ...thread.state, focusedMessageIdx: messageIdx },
            });
        },

        getFocusedMessageIdx: () => {
            const { currentThreadId, threads } = get();
            const thread = threads[currentThreadId];
            if (!thread) return undefined;
            const idx = thread.state.focusedMessageIdx;
            if (idx === undefined) return undefined;
            const msg = thread.messages[idx];
            if (!msg || msg.role !== "user") return undefined;
            return idx;
        },

        // ── Codespan links ─────────────────────────────────────────────────────

        getCodespanLink: ({ codespanStr, messageIdx, threadId }) => {
            const thread = get().threads[threadId];
            if (!thread) return undefined;
            return thread.state.codespanLinks[messageIdx]?.[codespanStr];
        },

        addCodespanLink: ({ text, link, messageIdx, threadId }) => {
            const thread = get().threads[threadId];
            if (!thread) return;
            set((s) => {
                const t = s.threads[threadId];
                if (!t) return s;
                return {
                    threads: {
                        ...s.threads,
                        [threadId]: {
                            ...t,
                            state: {
                                ...t.state,
                                codespanLinks: {
                                    ...t.state.codespanLinks,
                                    [messageIdx]: {
                                        ...t.state.codespanLinks[messageIdx],
                                        [text]: link,
                                    },
                                },
                            },
                        },
                    },
                };
            });
        },

        // ── Checkpoint time travel ─────────────────────────────────────────────

        jumpToCheckpointBeforeMessageIdx: async ({
            threadId, messageIdx, includeUserModifications
        }) => {
            const { threads, streamState } = get();
            const thread = threads[threadId];
            if (!thread || streamState[threadId]) return;

            let targetCheckpoint: CheckpointEntry | null = null;
            let targetIdx = -1;

            for (let i = messageIdx - 1; i >= 0; i--) {
                const msg = thread.messages[i];
                if (isCheckpoint(msg)) {
                    targetCheckpoint = msg;
                    targetIdx = i;
                    break;
                }
            }

            if (!targetCheckpoint || targetIdx === -1) return;

            const fromIdx = thread.state.currentCheckpointIdx ?? thread.messages.length - 1;
            if (fromIdx === targetIdx) return;

            const snapshotToUse = includeUserModifications
                ? {
                    ...targetCheckpoint.snapshotByPath,
                    ...targetCheckpoint.userModifications.snapshotByPath,
                }
                : targetCheckpoint.snapshotByPath;

            for (const [filePath, snapshot] of Object.entries(snapshotToUse)) {
                if (snapshot) await restoreFileSnapshot(filePath, snapshot.content);
            }

            get()._setThreadState(threadId, {
                state: { ...thread.state, currentCheckpointIdx: targetIdx },
            });
        },

        // ── Settings ───────────────────────────────────────────────────────────

        setChatMode: (mode) => set({ chatMode: mode }),
        setAutoApprove: (type, value) => {
            if (type === "edits") set({ autoApproveEdits: value });
            else set({ autoApproveTerminal: value });
        },

        // ── Internals ──────────────────────────────────────────────────────────

        _setStreamState: (threadId, state) => {
            set((s) => ({ streamState: { ...s.streamState, [threadId]: state } }));
        },

        _addMessageToThread: (threadId, message) => {
            set((s) => {
                const thread = s.threads[threadId];
                if (!thread) return s;
                const updated: ChatThread = {
                    ...thread,
                    lastModified: new Date().toISOString(),
                    messages: [...thread.messages, message],
                };
                if (
                    message.role === "user" &&
                    thread.messages.filter((m) => m.role === "user").length === 0
                ) {
                    updated.title =
                        message.displayContent.slice(0, 50) +
                        (message.displayContent.length > 50 ? "…" : "");
                }
                // Fire-and-forget persist — pass workspaceId from store
                saveThread(updated, s.workspaceId);
                return { threads: { ...s.threads, [threadId]: updated } };
            });
        },

        _replaceLastMessage: (threadId, message) => {
            const { threads } = get();
            const thread = threads[threadId];
            if (!thread || thread.messages.length === 0) return false;

            const lastMsg = thread.messages[thread.messages.length - 1];
            if (lastMsg.role !== "tool") return false;

            set((s) => {
                const t = s.threads[threadId];
                if (!t) return s;
                const msgs = [...t.messages];
                msgs[msgs.length - 1] = message;
                const updated = {
                    ...t,
                    lastModified: new Date().toISOString(),
                    messages: msgs,
                };
                saveThread(updated, s.workspaceId);
                return { threads: { ...s.threads, [threadId]: updated } };
            });

            return true;
        },

        _addCheckpoint: (threadId, checkpoint) => {
            get()._addMessageToThread(threadId, checkpoint);
        },

        _saveThread: (threadId) => {
            const { threads, workspaceId } = get();
            const thread = threads[threadId];
            if (thread) saveThread(thread, workspaceId);
        },

        _getCurrentThread: () => {
            const { threads, currentThreadId } = get();
            return threads[currentThreadId];
        },

        _setThreadState: (threadId, partial) => {
            set((s) => {
                const thread = s.threads[threadId];
                if (!thread) return s;
                const updated = {
                    ...thread,
                    ...partial,
                    lastModified: new Date().toISOString(),
                };
                saveThread(updated as ChatThread, s.workspaceId);
                return { threads: { ...s.threads, [threadId]: updated } };
            });
        },

        _setMessageState: (threadId, messageIdx, partial) => {
            set((s) => {
                const thread = s.threads[threadId];
                if (!thread) return s;
                const msgs = [...thread.messages];
                const msg = msgs[messageIdx];
                if (!msg || msg.role !== "user") return s;
                msgs[messageIdx] = { ...msg, state: { ...msg.state, ...partial } };
                const updated = {
                    ...thread,
                    messages: msgs,
                    lastModified: new Date().toISOString(),
                };
                saveThread(updated, s.workspaceId);
                return { threads: { ...s.threads, [threadId]: updated } };
            });
        },
    }))
);

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildAgentCallbacks(
    threadId: string,
    get: () => ChatStore,
    chatMode: "normal" | "gather" | "agent",
    autoApproveEdits: boolean,
    autoApproveTerminal: boolean,
    workspaceId: string,
): AgentCallbacks {
    return {
        onStreamStateChange: (state) => get()._setStreamState(threadId, state),
        onAddMessage: (msg) => get()._addMessageToThread(threadId, msg),
        onReplaceLastMessage: (msg) => get()._replaceLastMessage(threadId, msg),
        onAddCheckpoint: (cp) => get()._addCheckpoint(threadId, cp),
        getMessages: () => get().threads[threadId]?.messages ?? [],
        onNotify: ({ message, type }) => {
            if (type === "error") toast.error(message);
            else toast.success(message);
        },
        chatMode,
        autoApproveEdits,
        autoApproveTerminal,
    };
}

function _dedupeSelection(
    existing: StagingSelection[],
    newSel: StagingSelection,
): StagingSelection[] {
    const isDuplicate = existing.some((s) => {
        if (s.type !== newSel.type) return false;
        if (s.type === "File" && newSel.type === "File")
            return s.filePath === newSel.filePath;
        if (s.type === "CodeSelection" && newSel.type === "CodeSelection")
            return s.filePath === newSel.filePath && s.range[0] === newSel.range[0];
        if (s.type === "Folder" && newSel.type === "Folder")
            return s.folderPath === newSel.folderPath;
        return false;
    });

    if (isDuplicate) {
        return existing.map((s) => {
            if (s.type === "File" && newSel.type === "File" && s.filePath === newSel.filePath) return newSel;
            if (s.type === "CodeSelection" && newSel.type === "CodeSelection" && s.filePath === newSel.filePath && s.range[0] === newSel.range[0]) return newSel;
            if (s.type === "Folder" && newSel.type === "Folder" && s.folderPath === newSel.folderPath) return newSel;
            return s;
        });
    }

    return [...existing, newSel];
}

function _buildAttachmentSummary(selections: StagingSelection[]): string {
    if (!selections.length) return "";
    return selections
        .map((s) => {
            if (s.type === "File") return `File: ${s.filePath}`;
            if (s.type === "CodeSelection") return `Code selection: ${s.filePath} lines ${s.range[0]}-${s.range[1]}`;
            if (s.type === "Folder") return `Folder: ${s.folderPath}`;
            return "";
        })
        .filter(Boolean)
        .join("\n");
}