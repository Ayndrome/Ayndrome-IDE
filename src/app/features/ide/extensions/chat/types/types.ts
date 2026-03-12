// ── File snapshots (for undo/redo checkpoint system) ─────────────────────────

// the file content at a point in time for basic undo support
export type SimpleFileSnapshot = {
    content: string;       // full file text at snapshot time
    timestamp: number;     // when this snapshot was taken
    filePath: string;      // which file this snapshot belongs to
};

// ── Tool system ───────────────────────────────────────────────────────────────
export type WebToolName =
    | 'read_file'           // read a file's contents
    | 'write_file'          // write/overwrite a file
    | 'create_file'         // create a new file
    | 'delete_file'         // delete a file
    | 'search_in_file'      // search for a string in a file
    | 'search_files'        // search across all files
    | 'list_directory'      // list files in a folder
    | 'run_terminal'        // execute a command (requires backend shell)
    | string;               // MCP tools and future tools — open-ended

// Which tools require user approval before running
// We keep the same concept but scoped to our tool names
export const approvalTypeOfWebTool: Partial<Record<WebToolName, 'edits' | 'terminal'>> = {
    write_file: 'edits',
    create_file: 'edits',
    delete_file: 'edits',
    run_terminal: 'terminal',
};

export type ToolApprovalType = 'edits' | 'terminal' | 'mcp';

// Raw unvalidated params from LLM — before we parse and type-check them

export type RawToolParams = Record<string, string>;

// Typed params per tool
// We use string paths instead of VSCode URI objects
export type WebToolCallParams = {
    read_file: { filePath: string; startLine?: number; endLine?: number };
    write_file: { filePath: string; content: string };
    create_file: { filePath: string; isFolder?: boolean };
    delete_file: { filePath: string; recursive?: boolean };
    search_in_file: { filePath: string; query: string; isRegex?: boolean };
    search_files: { query: string; isRegex?: boolean; includePattern?: string };
    list_directory: { dirPath: string };
    run_terminal: { command: string; cwd?: string };
};

// Results per tool
export type WebToolResult = {
    read_file: { content: string; totalLines: number; truncated: boolean };
    write_file: { success: boolean; lintErrors?: LintError[] };
    create_file: { success: boolean };
    delete_file: { success: boolean };
    search_in_file: { matchingLines: number[] };
    search_files: { filePaths: string[]; hasMore: boolean };
    list_directory: { entries: DirectoryEntry[] };
    run_terminal: { output: string; exitCode: number | null; timedOut: boolean };
};

// Generic helpers
export type ToolParams<T extends WebToolName> =
    T extends keyof WebToolCallParams ? WebToolCallParams[T] : RawToolParams;

export type ToolResult<T extends WebToolName> =
    T extends keyof WebToolResult ? WebToolResult[T] : unknown;

// Directory listing entry 

export type DirectoryEntry = {
    path: string;
    name: string;
    isDirectory: boolean;
    isSymbolicLink: boolean;
};

// Lint error from write operation
export type LintError = {
    code: string;
    message: string;
    startLine: number;
    endLine: number;
};

// ── Tool messages ─────────────────────────────────────────────────────────────

// States in order:
//   invalid_params  → LLM sent bad params, show error immediately
//   tool_request    → params valid, waiting for user to approve
//   running_now     → user approved (or auto-approved), tool is executing
//   tool_error      → tool threw an exception
//   success         → tool completed successfully
//   rejected        → user clicked "reject" on the approval prompt

export type ToolMessage<T extends WebToolName = WebToolName> = {
    role: 'tool';

    // String result sent back to LLM in next message
    // For errors this is the error message, for success this is stringified result
    content: string;

    // Unique ID matching the LLM's tool_use id (Anthropic) or tool_call_id (OpenAI)
    id: string;

    // Raw unparsed params as LLM sent them — kept for display + re-parsing
    rawParams: RawToolParams;

    // If this came from an MCP server, which one
    // undefined = built-in web tool
    mcpServerName: string | undefined;

} & (
        | {
            // LLM sent params that failed validation
            // e.g. missing required field, wrong type
            type: 'invalid_params';
            result: null;
            name: T;
            // No params field — validation failed before we could parse them
        }
        | {
            // Params validated, waiting for user to approve
            // UI should show: "AI wants to edit file X — Allow / Reject"
            type: 'tool_request';
            result: null;
            name: T;
            params: ToolParams<T>;
        }
        | {
            // User approved (or auto-approved), tool is currently running
            // UI should show a spinner / "running..." indicator
            type: 'running_now';
            result: null;
            name: T;
            params: ToolParams<T>;
        }
        | {
            // Tool threw an exception during execution
            // result = error message string (sent to LLM so it can recover)
            type: 'tool_error';
            result: string;
            name: T;
            params: ToolParams<T>;
        }
        | {
            // Tool completed successfully
            // result = typed result object
            // content = stringified result (what LLM sees)
            type: 'success';
            result: Awaited<ToolResult<T>>;
            name: T;
            params: ToolParams<T>;
        }
        | {
            // User clicked reject on the approval prompt
            // Tool was never run
            type: 'rejected';
            result: null;
            name: T;
            params: ToolParams<T>;
        }
    );

// Shown in chat when user aborts while LLM was mid-stream generating a tool call
// The tool call never completed so we can't show params — just the name

export type InterruptedToolMessage = {
    role: 'interrupted_tool';
    name: WebToolName;
    mcpServerName: string | undefined;
};

// ── Checkpoints (file undo/redo) ──────────────────────────────────────────────

// Two checkpoint types:
//   user_edit  → snapshot taken before a user sends a message
//                (so user can jump back to before the AI did anything)
//   tool_edit  → snapshot taken right before AI edits a specific file
//                (granular per-file undo)
//
// userModifications stores any changes the user made ON TOP of the AI's changes
// while the chat was at that checkpoint — so "jump to here" can restore
// either the pure AI state OR include what the user added afterward.

export type CheckpointEntry = {
    role: 'checkpoint';
    type: 'user_edit' | 'tool_edit';

    // filePath → what the file looked like at this checkpoint
    // Only includes files that changed BEFORE this checkpoint
    snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;

    // Any user edits made on top of this checkpoint's state
    // (populated when user jumps back in history and keeps editing)
    userModifications: {
        snapshotByPath: Record<string, SimpleFileSnapshot | undefined>;
    };
};

// ── Anthropic reasoning (extended thinking) ───────────────────────────────────

// Claude's extended thinking produces reasoning tokens before the response.

// 'redacted_thinking' = Anthropic hid the thinking for safety reasons
export type AnthropicReasoning =
    | { type: 'thinking'; thinking: string; signature: string }
    | { type: 'redacted_thinking'; data: string };

// ── Staging selections ────────────────────────────────────────────────────────


// Three selection types:
//   File          → entire file attached
//   CodeSelection → specific line range from a file
//   Folder        → entire folder (sends all file contents)

export type StagingSelection =
    | {
        type: 'File';
        filePath: string;
        language: string;
        // true if this file was auto-added because it was the active editor
        // false if user explicitly added it
        wasAddedAsCurrentFile: boolean;
    }
    | {
        type: 'CodeSelection';
        filePath: string;
        language: string;
        // 1-indexed line numbers [startLine, endLine]
        range: [number, number];
        wasAddedAsCurrentFile: boolean;
    }
    | {
        type: 'Folder';
        folderPath: string;
    };

// ── Codespan links ────────────────────────────────────────────────────────────

// When LLM mentions `SomeFunction` in chat, clicking it should jump to definition.

export type CodespanLink = {
    filePath: string;
    displayText: string;
    // If we found the exact symbol location, store it for precise navigation
    selection?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
} | null;

// ── Chat messages ─────────────────────────────────────────────────────────────

// Role types:
//   user             → human message with optional file attachments
//   assistant        → LLM response (may include reasoning)
//   tool             → tool call + result (all states, see ToolMessage above)
//   interrupted_tool → decorative — shown when user aborted mid-tool-call
//   checkpoint       → invisible file snapshot marker for undo/redo

export type ChatMessage =
    | {
        role: 'user';

        // What the LLM sees in subsequent turns (may include file contents)

        content: string;

        // What's shown in the chat UI — just the user's typed text, no file dumps
        displayContent: string;

        // Files/code the user attached to this message
        attachments: StagingSelection[] | null;

        // Per-message UI state
        state: {
            // Staging area for editing this specific message
            // (when user clicks "edit" on a sent message)
            stagingSelections: StagingSelection[];
            isBeingEdited: boolean;
        };
    }
    | {
        role: 'assistant';

        // The LLM's text response — what's shown in chat
        // Empty string is valid (e.g. LLM only did a tool call)
        displayContent: string;

        // Chain-of-thought reasoning text (visible to user in expandable section)
        // Empty string if model doesn't support reasoning
        reasoning: string;

        // Raw Anthropic extended thinking blocks — null for non-Anthropic models
        // or when extended thinking is disabled
        anthropicReasoning: AnthropicReasoning[] | null;
    }
    | ToolMessage<WebToolName>
    | InterruptedToolMessage
    | CheckpointEntry;

// ── Thread types ──────────────────────────────────────────────────────────────


export type ChatThread = {
    id: string;
    title: string;            // auto-generated from first user message
    createdAt: string;        // ISO string
    lastModified: string;     // ISO string
    messages: ChatMessage[];

    state: {
        // Which checkpoint the user has jumped to (for undo/redo navigation)
        // null = at the live tip of history (no jump has been made)
        currentCheckpointIdx: number | null;

        // Files attached to the NEXT message being composed
        // (cleared after message is sent)
        stagingSelections: StagingSelection[];

        // Index of user message currently being edited (undefined = none)
        focusedMessageIdx: number | undefined;

        // Map from messageIdx → codespanText → link location
        // e.g. linksOfMessageIdx[4]['AuthService'] = { filePath: '...', selection: ... }
        codespanLinks: Record<number, Record<string, CodespanLink>>;
    };
};

// ── Stream state ──────────────────────────────────────────────────────────────


// This is NOT persisted — it lives in memory only and resets on reload.
//
// States:
//   undefined        → nothing running, thread is idle and complete
//   'streaming'      → LLM is generating tokens
//   'tool_running'   → a tool is currently executing
//   'awaiting_user'  → tool needs user approval before it can run
//   'idle'           → brief in-between state (between tool result and next LLM call)
//   'error'          → something went wrong, show error UI

export type ThreadStreamState =
    | undefined  // idle and complete
    | {
        status: 'streaming';
        // Accumulated text so far (for live display while streaming)
        partialText: string;
        partialReasoning: string;
        // If LLM is streaming a tool call, partial params so far
        partialToolCall: { name: string; rawParams: RawToolParams } | null;
        // Call this to cancel the stream
        abort: () => void;
    }
    | {
        status: 'tool_running';
        toolName: WebToolName;
        toolParams: RawToolParams;
        toolId: string;
        mcpServerName: string | undefined;
        // Call this to interrupt the tool mid-execution
        abort: () => void;
    }
    | {
        status: 'awaiting_user';
        // No abort here — user must explicitly approve or reject
    }
    | {
        // Brief gap between tool completion and next LLM call
        // Agent loop is about to send another message
        status: 'idle';
        abort: () => void;
    }
    | {
        status: 'error';
        message: string;
        fullError: Error | null;
    };

// ── Full app state ────────────────────────────────────────────────────────────

// Persisted state — saved to localStorage / Convex / your storage layer
export type ChatThreadsState = {
    // All threads keyed by id
    threads: Record<string, ChatThread | undefined>;
    // Which thread is open in the sidebar
    currentThreadId: string;
};

// Non-persisted runtime state — lives in Zustand or React state only
export type ChatStreamState = {
    // threadId → what's happening in that thread right now
    byThreadId: Record<string, ThreadStreamState>;
};

// ── Chat mode ─────────────────────────────────────────────────────────────────


//   normal → no tools, pure chat (like ChatGPT)
//   gather → read-only tools (read_file, search, list_directory)
//   agent  → all tools including write_file, run_terminal
export type ChatMode = 'normal' | 'gather' | 'agent';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Create a blank new thread
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

// Type guards — useful when iterating messages
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

// Check if a tool requires user approval before running
export function toolNeedsApproval(
    toolName: WebToolName,
    autoApproveEdits: boolean,
    autoApproveTerminal: boolean
): boolean {
    const approvalType = approvalTypeOfWebTool[toolName];
    if (!approvalType) return false;
    if (approvalType === 'edits' && autoApproveEdits) return false;
    if (approvalType === 'terminal' && autoApproveTerminal) return false;
    return true;
}