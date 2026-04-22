1. First Priority must be resolving file api errors due to confusion between workspaceId and projectId.
2. Investigate other errors regarding file api
3. Terminal permission errors
4. Diff UI is also important to be fixed now.

ChatThreadService.ts:2224 [Agent] LLM error (attempt 3/3): No output generated. Check the stream for errors.
error @ intercept-console-error.ts:42
runChatAgent @ ChatThreadService.ts:2224Understand this error
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
index.ts:232 AC|cursor cursor moved 0→1146 (no request in-flight, clearing ghost text)
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
use-save-shortcut.ts:30 [Save] Failed: {"error":"Workspace not found"}
error @ intercept-console-error.ts:42
useSaveShortcut.useCallback[save] @ use-save-shortcut.ts:30Understand this error
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)Understand this error
:3000/api/files:1 Failed to load resource: the server responded with a status of 404 (Not Found)
