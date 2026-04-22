// // ── File snapshots (for undo/redo checkpoint system) ─────────────────────────

// // the file content at a point in time for basic undo support
// export type SimpleFileSnapshot = {
//     content: string;       // full file text at snapshot time
//     timestamp: number;     // when this snapshot was taken
//     filePath: string;      // which file this snapshot belongs to
// };

// // ── Tool system ───────────────────────────────────────────────────────────────
// export type WebToolName =
//     | 'read_file'           // read a file's contents
//     | 'write_file'          // write/overwrite a file
//     | 'create_file'         // create a new file
//     | 'delete_file'         // delete a file
//     | 'search_in_file'      // search for a string in a file
//     | 'search_files'        // search across all files
//     | 'list_directory'      // list files in a folder
//     | 'run_terminal'        // execute a command (requires backend shell)
//     | string;               // MCP tools and future tools — open-ended

// // Which tools require user approval before running
// // We keep the same concept but scoped to our tool names
// export const approvalTypeOfWebTool: Partial<Record<WebToolName, 'edits' | 'terminal'>> = {
//     write_file: 'edits',
//     create_file: 'edits',
//     delete_file: 'edits',
//     run_terminal: 'terminal',
// };

// export type ToolApprovalType = 'edits' | 'terminal' | 'mcp';

// // Raw unvalidated params from LLM — before we parse and type-check them

// export type RawToolParams = Record<string, string>;

// // Typed params per tool
// // We use string paths instead of VSCode URI objects
// export type WebToolCallParams = {
//     read_file: { filePath: string; startLine?: number; endLine?: number };
//     write_file: { filePath: string; content: string };
//     create_file: { filePath: string; isFolder?: boolean };
//     delete_file: { filePath: string; recursive?: boolean };
//     search_in_file: { filePath: string; query: string; isRegex?: boolean };
//     search_files: { query: string; isRegex?: boolean; includePattern?: string };
//     list_directory: { dirPath: string };
//     run_terminal: { command: string; cwd?: string };
// };

// // Results per tool
// export type WebToolResult = {
//     read_file: { content: string; totalLines: number; truncated: boolean };
//     write_file: { success: boolean; lintErrors?: LintError[] };
//     create_file: { success: boolean };
//     delete_file: { success: boolean };
//     search_in_file: { matchingLines: number[] };
//     search_files: { filePaths: string[]; hasMore: boolean };
//     list_directory: { entries: DirectoryEntry[] };
//     run_terminal: { output: string; exitCode: number | null; timedOut: boolean };
// };

// // Generic helpers
// export type ToolParams<T extends WebToolName> =
//     T extends keyof WebToolCallParams ? WebToolCallParams[T] : RawToolParams;

// export type ToolResult<T extends WebToolName> =
//     T extends keyof WebToolResult ? WebToolResult[T] : unknown;

// // Directory listing entry 

// export type DirectoryEntry = {
//     path: string;
//     name: string;
//     isDirectory: boolean;
//     isSymbolicLink: boolean;
// };

// // Lint error from write operation
// export type LintError = {
//     code: string;
//     message: string;
//     startLine: number;
//     endLine: number;
// };

// // ── Tool messages ─────────────────────────────────────────────────────────────

// // States in order:
// //   invalid_params  → LLM sent bad params, show error immediately
// //   tool_request    → params valid, waiting for user to approve
// //   running_now     → user approved (or auto-approved), tool is executing
// //   tool_error      → tool threw an exception
// //   success         → tool completed successfully
// //   rejected        → user clicked "reject" on the approval prompt

// export type ToolMessage<T extends WebToolName = WebToolName> = {
//     role: 'tool';

//     // String result sent back to LLM in next message
//     // For errors this is the error message, for success this is stringified result
//     content: string;

//     // Unique ID matching the LLM's tool_use id (Anthropic) or tool_call_id (OpenAI)
//     id: string;

//     // Raw unparsed params as LLM sent them — kept for display + re-parsing
//     rawParams: RawToolParams;

//     // If this came from an MCP server, which one
//     // undefined = built-in web tool
//     mcpServerName: string | undefined;

// } & (
//         | {
//             // LLM sent params that failed validation
//             // e.g. missing required field, wrong type
//             type: 'invalid_params';
//             result: null;
//             name: T;
//             // No params field — validation failed before we could parse them
//         }
//         | {
//             // Params validated, waiting for user to approve
//             // UI should show: "AI wants to edit file X — Allow / Reject"
//             type: 'tool_request';
//             result: null;
//             name: T;
//             params: ToolParams<T>;
//         }
//         | {
//             // User approved (or auto-approved), tool is currently running
//             // UI should show a spinner / "running..." indicator
//             type: 'running_now';
//             result: null;
//             name: T;
//             params: ToolParams<T>;
//         }
//         | {
//             // Tool threw an exception during execution
//             // result = error message string (sent to LLM so it can recover)
//             type: 'tool_error';
//             result: string;
//             name: T;
//             params: ToolParams<T>;
//         }
//         | {
//             // Tool completed successfully
//             // result = typed result object
//             // content = stringified result (what LLM sees)
//             type: 'success';
//             result: Awaited<ToolResult<T>>;
//             name: T;
//             params: ToolParams<T>;
//         }
//         | {
//             // User clicked reject on the approval prompt
//             // Tool was never run
//             type: 'rejected';
//             result: null;
//             name: T;
//             params: ToolParams<T>;
//         }
//     );

// // Shown in chat when user aborts while LLM was mid-stream generating a tool call
// // The tool call never completed so we can't show params — just the name

// export type InterruptedToolMessage = {
//     role: 'interrupted_tool';
//     name: WebToolName;
//     mcpServerName: string | undefined;
// };

// // ── Checkpoints (file undo/redo) ──────────────────────────────────────────────

// // Two checkpoint types:
// //   user_edit  → snapshot taken before a user sends a message
// //                (so user can jump back to before the AI did anything)
// //   tool_edit  → snapshot taken right before AI edits a specific file
// //                (granular per-file undo)
// //
// // userModifications stores any changes the user made ON TOP of the AI's changes
// // while the chat was at that checkpoint — so "jump to here" can restore
// // either the pure AI state OR include what the user added afterward.

// export type CheckpointEntry = {
//     role: 'checkpoint';
//     type: 'user_edit' | 'tool_edit';

//     // filePath → what the file looked like at this checkpoint
//     // Only includes files that changed BEFORE this checkpoint
//     snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;

//     // Any user edits made on top of this checkpoint's state
//     // (populated when user jumps back in history and keeps editing)
//     userModifications: {
//         snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;
//     };
// };

// // ── Anthropic reasoning (extended thinking) ───────────────────────────────────

// // Claude's extended thinking produces reasoning tokens before the response.

// // 'redacted_thinking' = Anthropic hid the thinking for safety reasons
// export type AnthropicReasoning =
//     | { type: 'thinking'; thinking: string; signature: string }
//     | { type: 'redacted_thinking'; data: string };

// // ── Staging selections ────────────────────────────────────────────────────────


// // Three selection types:
// //   File          → entire file attached
// //   CodeSelection → specific line range from a file
// //   Folder        → entire folder (sends all file contents)

// export type StagingSelection =
//     | {
//         type: 'File';
//         filePath: string;
//         language: string;
//         // true if this file was auto-added because it was the active editor
//         // false if user explicitly added it
//         wasAddedAsCurrentFile: boolean;
//     }
//     | {
//         type: 'CodeSelection';
//         filePath: string;
//         language: string;
//         // 1-indexed line numbers [startLine, endLine]
//         range: [number, number];
//         wasAddedAsCurrentFile: boolean;
//     }
//     | {
//         type: 'Folder';
//         folderPath: string;
//     };

// // ── Codespan links ────────────────────────────────────────────────────────────

// // When LLM mentions `SomeFunction` in chat, clicking it should jump to definition.

// export type CodespanLink = {
//     filePath: string;
//     displayText: string;
//     // If we found the exact symbol location, store it for precise navigation
//     selection?: {
//         startLine: number;
//         startColumn: number;
//         endLine: number;
//         endColumn: number;
//     };
// } | null;

// // ── Chat messages ─────────────────────────────────────────────────────────────

// // Role types:
// //   user             → human message with optional file attachments
// //   assistant        → LLM response (may include reasoning)
// //   tool             → tool call + result (all states, see ToolMessage above)
// //   interrupted_tool → decorative — shown when user aborted mid-tool-call
// //   checkpoint       → invisible file snapshot marker for undo/redo

// export type ChatMessage =
//     | {
//         role: 'user';

//         // What the LLM sees in subsequent turns (may include file contents)

//         content: string;

//         // What's shown in the chat UI — just the user's typed text, no file dumps
//         displayContent: string;

//         // Files/code the user attached to this message
//         attachments: StagingSelection[] | null;

//         // Per-message UI state
//         state: {
//             // Staging area for editing this specific message
//             // (when user clicks "edit" on a sent message)
//             stagingSelections: StagingSelection[];
//             isBeingEdited: boolean;
//         };
//     }
//     | {
//         role: 'assistant';

//         // The LLM's text response — what's shown in chat
//         // Empty string is valid (e.g. LLM only did a tool call)
//         displayContent: string;

//         // Chain-of-thought reasoning text (visible to user in expandable section)
//         // Empty string if model doesn't support reasoning
//         reasoning: string;

//         // Raw Anthropic extended thinking blocks — null for non-Anthropic models
//         // or when extended thinking is disabled
//         anthropicReasoning: AnthropicReasoning[] | null;
//     }
//     | ToolMessage<WebToolName>
//     | InterruptedToolMessage
//     | CheckpointEntry;

// // ── Thread types ──────────────────────────────────────────────────────────────


// export type ChatThread = {
//     id: string;
//     title: string;            // auto-generated from first user message
//     createdAt: string;        // ISO string
//     lastModified: string;     // ISO string
//     messages: ChatMessage[];

//     state: {
//         // Which checkpoint the user has jumped to (for undo/redo navigation)
//         // null = at the live tip of history (no jump has been made)
//         currentCheckpointIdx: number | null;

//         // Files attached to the NEXT message being composed
//         // (cleared after message is sent)
//         stagingSelections: StagingSelection[];

//         // Index of user message currently being edited (undefined = none)
//         focusedMessageIdx: number | undefined;

//         // Map from messageIdx → codespanText → link location
//         // e.g. linksOfMessageIdx[4]['AuthService'] = { filePath: '...', selection: ... }
//         codespanLinks: Record<number, Record<string, CodespanLink>>;
//     };
// };

// // ── Stream state ──────────────────────────────────────────────────────────────


// // This is NOT persisted — it lives in memory only and resets on reload.
// //
// // States:
// //   undefined        → nothing running, thread is idle and complete
// //   'streaming'      → LLM is generating tokens
// //   'tool_running'   → a tool is currently executing
// //   'awaiting_user'  → tool needs user approval before it can run
// //   'idle'           → brief in-between state (between tool result and next LLM call)
// //   'error'          → something went wrong, show error UI

// export type ThreadStreamState =
//     | undefined  // idle and complete
//     | {
//         status: 'streaming';
//         // Accumulated text so far (for live display while streaming)
//         partialText: string;
//         partialReasoning: string;
//         // If LLM is streaming a tool call, partial params so far
//         partialToolCall: { name: string; rawParams: RawToolParams } | null;
//         // Call this to cancel the stream
//         abort: () => void;
//     }
//     | {
//         status: 'tool_running';
//         toolName: WebToolName;
//         toolParams: RawToolParams;
//         toolId: string;
//         mcpServerName: string | undefined;
//         // Call this to interrupt the tool mid-execution
//         abort: () => void;
//     }
//     | {
//         status: 'awaiting_user';
//         // No abort here — user must explicitly approve or reject
//     }
//     | {
//         // Brief gap between tool completion and next LLM call
//         // Agent loop is about to send another message
//         status: 'idle';
//         abort: () => void;
//     }
//     | {
//         status: 'error';
//         message: string;
//         fullError: Error | null;
//     };

// // ── Full app state ────────────────────────────────────────────────────────────

// // Persisted state — saved to localStorage / Convex / your storage layer
// export type ChatThreadsState = {
//     // All threads keyed by id
//     threads: Record<string, ChatThread | undefined>;
//     // Which thread is open in the sidebar
//     currentThreadId: string;
// };

// // Non-persisted runtime state — lives in Zustand or React state only
// export type ChatStreamState = {
//     // threadId → what's happening in that thread right now
//     byThreadId: Record<string, ThreadStreamState>;
// };

// // ── Chat mode ─────────────────────────────────────────────────────────────────


// //   normal → no tools, pure chat (like ChatGPT)
// //   gather → read-only tools (read_file, search, list_directory)
// //   agent  → all tools including write_file, run_terminal
// export type ChatMode = 'normal' | 'gather' | 'agent';

// // ── Helpers ───────────────────────────────────────────────────────────────────

// // Create a blank new thread
// export function newThread(id: string): ChatThread {
//     const now = new Date().toISOString();
//     return {
//         id,
//         title: 'New Chat',
//         createdAt: now,
//         lastModified: now,
//         messages: [],
//         state: {
//             currentCheckpointIdx: null,
//             stagingSelections: [],
//             focusedMessageIdx: undefined,
//             codespanLinks: {},
//         },
//     };
// }

// // Type guards — useful when iterating messages
// export function isUserMessage(m: ChatMessage): m is ChatMessage & { role: 'user' } {
//     return m.role === 'user';
// }

// export function isAssistantMessage(m: ChatMessage): m is ChatMessage & { role: 'assistant' } {
//     return m.role === 'assistant';
// }

// export function isToolMessage(m: ChatMessage): m is ToolMessage<WebToolName> {
//     return m.role === 'tool';
// }

// export function isCheckpoint(m: ChatMessage): m is CheckpointEntry {
//     return m.role === 'checkpoint';
// }

// // Check if a tool requires user approval before running
// export function toolNeedsApproval(
//     toolName: WebToolName,
//     autoApproveEdits: boolean,
//     autoApproveTerminal: boolean
// ): boolean {
//     const approvalType = approvalTypeOfWebTool[toolName];
//     if (!approvalType) return false;
//     if (approvalType === 'edits' && autoApproveEdits) return false;
//     if (approvalType === 'terminal' && autoApproveTerminal) return false;
//     return true;
// }



// src/app/features/ide/extensions/chat/types/types.ts
// Complete — all existing types kept, all issues fixed, new types added.

// ── File snapshots ────────────────────────────────────────────────────────────

export type SimpleFileSnapshot = {
    content: string;
    timestamp: number;
    filePath: string;
};

// ── Tool system ───────────────────────────────────────────────────────────────

export type WebToolName =
    | 'read_file'
    | 'write_file'
    | 'create_file'
    | 'delete_file'
    | 'search_in_file'
    | 'search_files'
    | 'list_directory'
    | 'run_terminal'
    | string;

export const approvalTypeOfWebTool: Partial<Record<WebToolName, 'edits' | 'terminal'>> = {
    write_file: 'edits',
    create_file: 'edits',
    delete_file: 'edits',
    run_terminal: 'terminal',
};


export type ToolApprovalType = 'edits' | 'terminal' | 'mcp';

export type RawToolParams = Record<string, string>;

export const PERSISTENT_TERMINAL_TOOL_DEFS = {
    start_terminal: {
        description: [
            "Start a named persistent terminal session in the workspace.",
            "Use this for long-running processes like dev servers, watchers, test runners.",
            "The session persists until killed — you can send commands and read output later.",
            "Example: start_terminal({ name: 'dev', command: 'npm run dev' })",
        ].join(" "),
        inputSchema: {
            name: { type: "string", description: "Session name e.g. 'dev', 'tests', 'worker'" },
            command: { type: "string", description: "Optional initial command to run on start" },
        },
    },

    run_in_terminal: {
        description: [
            "Run a command in a named persistent session and return the output.",
            "The session's shell state persists — cd, exports, etc. carry over between calls.",
            "Use this instead of run_terminal when you need shell state to persist.",
            "Output streams live to the user's terminal panel.",
        ].join(" "),
        inputSchema: {
            name: { type: "string", description: "Session name (must already exist)" },
            command: { type: "string", description: "Command to run" },
            timeoutMs: { type: "number", description: "Timeout in ms (default 60000)" },
        },
    },

    read_terminal: {
        description: [
            "Read recent output from a named terminal session.",
            "Use this to check if a dev server started successfully,",
            "or to read test results from a running process.",
        ].join(" "),
        inputSchema: {
            name: { type: "string", description: "Session name" },
            lines: { type: "number", description: "Number of lines to read (default 50)" },
        },
    },

    kill_terminal: {
        description: "Kill a named terminal session. Use when done with a long-running process.",
        inputSchema: {
            name: { type: "string", description: "Session name to kill" },
        },
    },
} as const;


type InferSchema<T> = {
    [k in keyof T]: T[k] extends { type: 'string' } ? string :
    T[k] extends { type: 'number' } ? number :
    T[k] extends { type: 'boolean' } ? boolean : any

}

type PersistenTerminalParams = {

    [k in keyof typeof PERSISTENT_TERMINAL_TOOL_DEFS]: InferSchema<typeof PERSISTENT_TERMINAL_TOOL_DEFS[k]['inputSchema']>

}

export type WebToolCallParams = {
    read_file: { filePath: string; startLine?: number; endLine?: number };
    write_file: { filePath: string; content: string };
    create_file: { filePath: string; isFolder?: boolean };
    create_directory: { dirPath: string };
    delete_file: { filePath: string; recursive?: boolean };
    search_in_file: { filePath: string; query: string; isRegex?: boolean };
    search_files: { query: string; isRegex?: boolean; includePattern?: string };
    list_directory: { dirPath: string };
    run_terminal: { command: string; cwd?: string };
    // Persistent terminal tools
    start_terminal: { name: string; command?: string };
    run_in_terminal: { name: string; command: string; timeoutMs?: number };
    read_terminal: { name: string; lines?: number };
    kill_terminal: { name: string };
    // Browser / Playwright tools
    start_server: { command: string; port: number; name?: string };
    take_screenshot: { url?: string; fullPage?: boolean; viewport?: { width: number; height: number }; selector?: string };
    capture_page_state: { url?: string; viewport?: { width: number; height: number } };
    interact_with_page: { url?: string; steps: Array<{ action: string; selector?: string; text?: string; url?: string; key?: string; value?: string; direction?: string; timeoutMs?: number; visible?: boolean; pattern?: string }>; screenshotOnEachStep?: boolean };
    run_tests: { testFile?: string; pattern?: string; stream?: boolean };
};

export type WebToolResult = {
    read_file: { content: string; totalLines: number; truncated: boolean };
    write_file: { success: boolean; lintErrors?: LintError[] };
    create_file: { success: boolean };
    create_directory: { success: boolean };
    delete_file: { success: boolean };
    search_in_file: { matchingLines: number[] };
    search_files: { filePaths: string[]; hasMore: boolean };
    list_directory: { entries: DirectoryEntry[] };
    run_terminal: { output: string; exitCode: number | null; timedOut: boolean };
    // Persistent terminal results
    start_terminal: { success: boolean; sessionName: string; pid: number };
    run_in_terminal: { output: string; exitCode: number | null; timedOut: boolean };
    read_terminal: { output: string };
    kill_terminal: { success: boolean };
    // Browser / Playwright results
    start_server: { success: boolean; port: number; timeMs: number };
    take_screenshot: { base64: string; width: number; height: number; url: string; timestamp: number };
    capture_page_state: { screenshot: { base64: string; width: number; height: number }; consoleErrors: string[]; networkErrors: string[]; domSnapshot: string; title: string; url: string };
    interact_with_page: { steps: Array<{ step: any; success: boolean; error?: string; screenshotBase64?: string }>; finalScreenshot: { base64: string }; passed: boolean; errors: string[] };
    run_tests: { passed: number; failed: number; skipped: number; output: string; duration: number; failures: any[] };
};

export type ToolParams<T extends WebToolName> =
    T extends keyof WebToolCallParams ? WebToolCallParams[T] : RawToolParams;

export type ToolResult<T extends WebToolName> =
    T extends keyof WebToolResult ? WebToolResult[T] : unknown;

export type DirectoryEntry = {
    path: string;
    name: string;
    isDirectory: boolean;
    isSymbolicLink: boolean;
};

export type LintError = {
    code: string;
    message: string;
    startLine: number;
    endLine: number;
};

// ── Tool messages ─────────────────────────────────────────────────────────────

export type ToolMessage<T extends WebToolName = WebToolName> = {
    role: 'tool';
    content: string;
    id: string;
    rawParams: RawToolParams;
    mcpServerName: string | undefined;
} & (
        | { type: 'invalid_params'; result: null; name: T }
        | { type: 'tool_request'; result: null; name: T; params: ToolParams<T> }
        | { type: 'running_now'; result: null; name: T; params: ToolParams<T> }
        | { type: 'tool_error'; result: string; name: T; params: ToolParams<T> }
        | { type: 'success'; result: Awaited<ToolResult<T>>; name: T; params: ToolParams<T> }
        | { type: 'rejected'; result: null; name: T; params: ToolParams<T> }
    );

export type InterruptedToolMessage = {
    role: 'interrupted_tool';
    name: WebToolName;
    mcpServerName: string | undefined;
};

// ── Checkpoints ───────────────────────────────────────────────────────────────

export type CheckpointEntry = {
    role: 'checkpoint';
    type: 'user_edit' | 'tool_edit';
    snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;
    userModifications: {
        snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;
    };
};

// ── Anthropic reasoning ───────────────────────────────────────────────────────

export type AnthropicReasoning =
    | { type: 'thinking'; thinking: string; signature: string }
    | { type: 'redacted_thinking'; data: string };

// ── Staging selections ────────────────────────────────────────────────────────

export type StagingSelection =
    | {
        type: 'File';
        filePath: string;
        language: string;
        wasAddedAsCurrentFile: boolean;
    }
    | {
        type: 'CodeSelection';
        filePath: string;
        language: string;
        range: [number, number];
        wasAddedAsCurrentFile: boolean;
    }
    | {
        type: 'Folder';
        folderPath: string;
    };

// ── Codespan links ────────────────────────────────────────────────────────────

export type CodespanLink = {
    filePath: string;
    displayText: string;
    selection?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
} | null;

// ── Chat messages ─────────────────────────────────────────────────────────────

export type ChatMessage =
    | {
        role: 'user';
        content: string;
        displayContent: string;
        attachments: StagingSelection[] | null;
        state: {
            stagingSelections: StagingSelection[];
            isBeingEdited: boolean;
        };
    }
    | {
        role: 'assistant';
        displayContent: string;
        reasoning: string;
        anthropicReasoning: AnthropicReasoning[] | null;
    }
    | ToolMessage<WebToolName>
    | InterruptedToolMessage
    | CheckpointEntry;

// ── Thread types ──────────────────────────────────────────────────────────────

export type ChatThread = {
    id: string;
    title: string;
    createdAt: string;
    lastModified: string;
    messages: ChatMessage[];
    state: {
        currentCheckpointIdx: number | null;
        stagingSelections: StagingSelection[];
        focusedMessageIdx: number | undefined;
        codespanLinks: Record<number, Record<string, CodespanLink>>;
    };
};

// ── Stream state ──────────────────────────────────────────────────────────────
// FIX: added workspaceId to streaming/tool_running states so the agent
// knows which Docker container to exec into when running tools.

export type ThreadStreamState =
    | undefined
    | {
        status: 'streaming';
        workspaceId: string;            // ← ADDED: which container this stream belongs to
        partialText: string;
        partialReasoning: string;
        partialToolCall: { name: string; rawParams: RawToolParams } | null;
        abort: () => void;
    }
    | {
        status: 'tool_running';
        workspaceId: string;            // ← ADDED: same
        toolName: WebToolName;
        toolParams: RawToolParams;
        toolId: string;
        mcpServerName: string | undefined;
        abort: () => void;
    }
    | {
        status: 'awaiting_user';
        workspaceId: string;            // ← ADDED: so approve/reject knows the context
    }
    | {
        status: 'idle';
        workspaceId: string;            // ← ADDED
        abort: () => void;
    }
    | {
        status: 'error';
        message: string;
        fullError: Error | null;
    };

// ── Full app state ────────────────────────────────────────────────────────────

export type ChatThreadsState = {
    threads: Record<string, ChatThread | undefined>;
    currentThreadId: string;
};

export type ChatStreamState = {
    byThreadId: Record<string, ThreadStreamState>;
};

// ── Chat mode ─────────────────────────────────────────────────────────────────

export type ChatMode = 'normal' | 'gather' | 'agent';

// ── NEW: Workspace types ──────────────────────────────────────────────────────
// These mirror the Convex schema but as frontend-safe TypeScript types.
// The Convex _id becomes a string here (serialized from Id<"workspaces">).

export type ContainerStatus =
    | 'not_created'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'error';

export type GitStatus =
    | 'modified'
    | 'added'
    | 'deleted'
    | 'untracked'
    | 'clean';

export type WorkspaceMeta = {
    // Convex document ID (serialized)
    _id: string;
    userId: string;
    projectId: string;
    name: string;

    // Git
    gitRemoteUrl?: string;
    gitBranch: string;
    lastCommitSha?: string;
    lastCommitMessage?: string;

    // Container
    diskPath: string;
    containerStatus: ContainerStatus;
    containerId?: string;

    // Editor state
    activeFilePath?: string;
    openTabs: string[];

    // Timestamps
    createdAt: number;
    lastActiveAt: number;
};

export type ProjectMeta = {
    _id: string;
    userId: string;
    name: string;
    description?: string;
    primaryLanguage?: string;
    importStatus?: 'pending' | 'cloning' | 'completed' | 'failed';
    importError?: string;
    workspaceId?: string;
    createdAt: number;
    updatedAt: number;
};

// File tree node (from Convex files table — no content, metadata only)
export type FileTreeNode = {
    _id: string;
    projectId: string;
    workspaceId: string;
    relativePath: string;
    name: string;
    type: 'file' | 'folder';
    parentPath?: string;
    sizeBytes?: number;
    mimeType?: string;
    gitStatus?: GitStatus;
    createdAt: number;
    updatedAt: number;
    // Frontend-only: children populated when building tree from flat list
    children?: FileTreeNode[];
};

// NEW: Workspace provisioning request/response
// Sent to /api/workspace when opening a project
export type ProvisionWorkspaceRequest = {
    projectId: string;
    gitRemoteUrl?: string;
    gitBranch?: string;
};

export type ProvisionWorkspaceResponse = {
    workspaceId: string;
    diskPath: string;
    containerStatus: ContainerStatus;
};

// NEW: Git operation result
export type GitOperationResult = {
    success: boolean;
    output: string;
    error?: string;
    branch?: string;
    commitSha?: string;
    isDirty?: boolean;        // true if uncommitted changes exist
    fileStatuses?: Array<{
        path: string;
        status: GitStatus;
    }>;
};

// NEW: Terminal session info
export type TerminalSession = {
    sessionId: string;
    workspaceId: string;
    connected: boolean;
    pid?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function newThread(id: string): ChatThread {
    const now = new Date().toISOString();
    return {
        id,
        title: 'New Chat',
        createdAt: now,
        lastModified: now,
        messages: [],
        state: {
            currentCheckpointIdx: null,
            stagingSelections: [],
            focusedMessageIdx: undefined,
            codespanLinks: {},
        },
    };
}

export function isUserMessage(m: ChatMessage): m is ChatMessage & { role: 'user' } {
    return m.role === 'user';
}

export function isAssistantMessage(m: ChatMessage): m is ChatMessage & { role: 'assistant' } {
    return m.role === 'assistant';
}

export function isToolMessage(m: ChatMessage): m is ToolMessage<WebToolName> {
    return m.role === 'tool';
}

export function isCheckpoint(m: ChatMessage): m is CheckpointEntry {
    return m.role === 'checkpoint';
}

export function toolNeedsApproval(
    toolName: WebToolName,
    autoApproveEdits: boolean,
    autoApproveTerminal: boolean,
): boolean {
    const approvalType = approvalTypeOfWebTool[toolName];
    if (!approvalType) return false;
    if (approvalType === 'edits' && autoApproveEdits) return false;
    if (approvalType === 'terminal' && autoApproveTerminal) return false;
    return true;
}

// NEW: Build a flat FileTreeNode list into a nested tree
// Called by FileExplorer to render the sidebar
export function buildFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
    const byPath = new Map<string, FileTreeNode>();
    const roots: FileTreeNode[] = [];

    // Index all nodes
    for (const node of nodes) {
        byPath.set(node.relativePath, { ...node, children: [] });
    }

    // Build tree
    for (const node of byPath.values()) {
        if (!node.parentPath) {
            roots.push(node);
        } else {
            const parent = byPath.get(node.parentPath);
            if (parent) {
                parent.children = parent.children ?? [];
                parent.children.push(node);
            } else {
                // Orphaned node (parent deleted) — add to root
                roots.push(node);
            }
        }
    }

    // Sort: folders first, then files, both alphabetical
    const sortNodes = (list: FileTreeNode[]): FileTreeNode[] => {
        return list
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            })
            .map(node => ({
                ...node,
                children: node.children ? sortNodes(node.children) : undefined,
            }));
    };

    return sortNodes(roots);
}

// NEW: Get language from file extension
// Used for syntax highlighting and staging selection labels
export function getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        py: 'python',
        rs: 'rust',
        go: 'go',
        java: 'java',
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
        c: 'c', h: 'c',
        cs: 'csharp',
        rb: 'ruby',
        php: 'php',
        swift: 'swift',
        kt: 'kotlin',
        md: 'markdown',
        json: 'json',
        yaml: 'yaml', yml: 'yaml',
        toml: 'toml',
        html: 'html',
        css: 'css',
        scss: 'scss',
        sql: 'sql',
        sh: 'bash', bash: 'bash',
        dockerfile: 'dockerfile',
    };
    return map[ext] ?? 'plaintext';
}