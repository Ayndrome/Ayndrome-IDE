// src/app/features/ide/extensions/chat/agent/workspace-context.ts
// Builds passive workspace context injected into every system prompt.
// The agent always knows: what file is open, git branch, recent changes.
// This is read-only context — not a tool call, just ambient awareness.

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceSnapshot = {
    activeFilePath: string | null;
    activeFileContent: string | null;   // truncated to 500 lines
    gitBranch: string | null;
    gitDiff: string | null;     // truncated to 100 lines
    openFilePaths: string[];
    workspaceName: string;
};

// ── Build context string ───────────────────────────────────────────────────────
// Returns a compact string that gets prepended to the system message.
// Kept short deliberately — this is passive context not a prompt engineering essay.

export function buildWorkspaceContextBlock(
    snapshot: WorkspaceSnapshot
): string {
    const lines: string[] = ["## Workspace context"];

    lines.push(`Project: ${snapshot.workspaceName}`);

    if (snapshot.gitBranch) {
        lines.push(`Branch: ${snapshot.gitBranch}`);
    }

    if (snapshot.openFilePaths.length > 0) {
        lines.push(`Open files: ${snapshot.openFilePaths.slice(0, 5).join(", ")}`);
    }

    if (snapshot.activeFilePath) {
        lines.push(`Active file: ${snapshot.activeFilePath}`);

        if (snapshot.activeFileContent) {
            const lines_ = snapshot.activeFileContent.split("\n");
            const preview = lines_.slice(0, 100).join("\n");
            const note = lines_.length > 100
                ? `\n... (${lines_.length - 100} more lines)`
                : "";
            lines.push(
                `\nActive file content:\n\`\`\`\n${preview}${note}\n\`\`\``
            );
        }
    }

    if (snapshot.gitDiff) {
        const diffLines = snapshot.gitDiff.split("\n").slice(0, 60).join("\n");
        const note = snapshot.gitDiff.split("\n").length > 60
            ? "\n... (diff truncated)"
            : "";
        lines.push(`\nUnstaged changes:\n\`\`\`diff\n${diffLines}${note}\n\`\`\``);
    }

    return lines.join("\n");
}

// ── Fetch snapshot from disk ──────────────────────────────────────────────────
// Called once per agent invocation from ChatThreadService.
// All fetches are best-effort — failures return null fields, not errors.

export async function fetchWorkspaceSnapshot(
    workspaceId: string,
    workspaceName: string,
    activeFilePath: string | null,
    openFilePaths: string[],
): Promise<WorkspaceSnapshot> {
    const snapshot: WorkspaceSnapshot = {
        activeFilePath,
        activeFileContent: null,
        gitBranch: null,
        gitDiff: null,
        openFilePaths,
        workspaceName,
    };

    // Fetch active file content
    if (activeFilePath) {
        try {
            const res = await fetch(
                `/api/files?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(activeFilePath)}`
            );
            if (res.ok) {
                const data = await res.json();
                snapshot.activeFileContent = data.content ?? null;
            }
        } catch { /* best effort */ }
    }

    // Fetch git status
    try {
        const res = await fetch(
            `/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`
        );
        if (res.ok) {
            const data = await res.json();
            snapshot.gitBranch = data.gitBranch ?? null;
        }
    } catch { /* best effort */ }

    // Fetch git diff
    try {
        const res = await fetch("/api/terminal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspaceId,
                command: "git diff --stat HEAD 2>/dev/null | head -60",
                stream: false,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.stdout?.trim()) {
                snapshot.gitDiff = data.stdout.trim();
            }
        }
    } catch { /* best effort */ }

    return snapshot;
}