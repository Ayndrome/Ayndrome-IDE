// src/app/features/ide/extensions/chat/agent/diff-engine.ts
// Computes structured diffs between old and new file content.
// Produces hunks that the UI can render and the user can accept/reject.
// Uses the Myers diff algorithm via the 'diff' library.

import * as Diff from "diff";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiffLineType = "context" | "added" | "removed";

export type DiffLine = {
    type: DiffLineType;
    content: string;      // line text without trailing newline
    oldLineNum?: number;      // undefined for added lines
    newLineNum?: number;      // undefined for removed lines
};

export type DiffHunk = {
    id: string;
    oldStart: number;      // 1-based line number in old file
    oldCount: number;
    newStart: number;      // 1-based line number in new file
    newCount: number;
    lines: DiffLine[];
    // User decision
    accepted: boolean | null;   // null = undecided
};

export type FileDiff = {
    filePath: string;
    oldContent: string;
    newContent: string;
    hunks: DiffHunk[];
    stats: {
        added: number;
        removed: number;
        changed: number;
    };
};

// ── Compute diff ──────────────────────────────────────────────────────────────

export function computeFileDiff(
    filePath: string,
    oldContent: string,
    newContent: string,
): FileDiff {
    // Fast path — identical content
    if (oldContent === newContent) {
        return {
            filePath,
            oldContent,
            newContent,
            hunks: [],
            stats: { added: 0, removed: 0, changed: 0 },
        };
    }

    // Compute line-level diff
    const changes = Diff.diffLines(oldContent, newContent, {
        ignoreNewlineAtEof: true,
    });

    // Build flat line array with line numbers
    const lines: DiffLine[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (const change of changes) {
        const changeLines = change.value.split("\n");
        // Remove trailing empty string from split
        if (changeLines[changeLines.length - 1] === "") {
            changeLines.pop();
        }

        for (const lineContent of changeLines) {
            if (change.added) {
                lines.push({
                    type: "added",
                    content: lineContent,
                    newLineNum: newLine++,
                });
            } else if (change.removed) {
                lines.push({
                    type: "removed",
                    content: lineContent,
                    oldLineNum: oldLine++,
                });
            } else {
                lines.push({
                    type: "context",
                    content: lineContent,
                    oldLineNum: oldLine++,
                    newLineNum: newLine++,
                });
            }
        }
    }

    // Group lines into hunks (changed regions + 3 context lines)
    const hunks = buildHunks(lines);

    // Compute stats
    const stats = {
        added: lines.filter(l => l.type === "added").length,
        removed: lines.filter(l => l.type === "removed").length,
        changed: 0,
    };
    stats.changed = Math.min(stats.added, stats.removed);

    return { filePath, oldContent, newContent, hunks, stats };
}

// ── Build hunks ───────────────────────────────────────────────────────────────

const CONTEXT_LINES = 3;

function buildHunks(lines: DiffLine[]): DiffHunk[] {
    const hunks: DiffHunk[] = [];

    // Find ranges of changed lines
    const changedIndices = lines
        .map((l, i) => (l.type !== "context" ? i : -1))
        .filter(i => i >= 0);

    if (changedIndices.length === 0) return [];

    // Group changed indices into ranges (merge nearby changes)
    const ranges: Array<[number, number]> = [];
    let rangeStart = changedIndices[0];
    let rangeEnd = changedIndices[0];

    for (let i = 1; i < changedIndices.length; i++) {
        const idx = changedIndices[i];
        if (idx - rangeEnd <= CONTEXT_LINES * 2 + 1) {
            rangeEnd = idx;
        } else {
            ranges.push([rangeStart, rangeEnd]);
            rangeStart = idx;
            rangeEnd = idx;
        }
    }
    ranges.push([rangeStart, rangeEnd]);

    // Build a hunk for each range
    for (const [start, end] of ranges) {
        const hunkStart = Math.max(0, start - CONTEXT_LINES);
        const hunkEnd = Math.min(lines.length - 1, end + CONTEXT_LINES);
        const hunkLines = lines.slice(hunkStart, hunkEnd + 1);

        const oldLines = hunkLines.filter(l => l.type !== "added");
        const newLines = hunkLines.filter(l => l.type !== "removed");

        const oldStart = oldLines[0]?.oldLineNum ?? 1;
        const newStart = newLines[0]?.newLineNum ?? 1;

        hunks.push({
            id: crypto.randomUUID(),
            oldStart,
            oldCount: oldLines.length,
            newStart,
            newCount: newLines.length,
            lines: hunkLines,
            accepted: null,
        });
    }

    return hunks;
}

// ── Apply partial diff ────────────────────────────────────────────────────────
// Applies only accepted hunks, rejects rejected ones.
// Returns the merged file content.

export function applyPartialDiff(diff: FileDiff): string {
    // If all hunks are accepted or null → use new content
    const allAccepted = diff.hunks.every(h => h.accepted !== false);
    if (allAccepted) return diff.newContent;

    // If all rejected → use old content
    const allRejected = diff.hunks.every(h => h.accepted === false);
    if (allRejected) return diff.oldContent;

    // Mix: build result line by line
    const oldLines = diff.oldContent.split("\n");
    const result: string[] = [];
    let oldIdx = 0;   // 0-based cursor in old file

    for (const hunk of diff.hunks) {
        // Copy unchanged lines up to this hunk
        const hunkOldStart = hunk.oldStart - 1;  // convert to 0-based
        while (oldIdx < hunkOldStart) {
            result.push(oldLines[oldIdx++]);
        }

        if (hunk.accepted === false) {
            // Rejected — keep old lines
            for (let i = 0; i < hunk.oldCount; i++) {
                result.push(oldLines[oldIdx++]);
            }
        } else {
            // Accepted (or undecided → accept) — use new lines
            const newLines = hunk.lines
                .filter(l => l.type !== "removed")
                .map(l => l.content);
            result.push(...newLines);
            oldIdx += hunk.oldCount;
        }
    }

    // Copy remaining old lines
    while (oldIdx < oldLines.length) {
        result.push(oldLines[oldIdx++]);
    }

    return result.join("\n");
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function diffSummary(diff: FileDiff): string {
    if (diff.hunks.length === 0) return "No changes";
    const { added, removed } = diff.stats;
    const parts = [];
    if (added > 0) parts.push(`+${added}`);
    if (removed > 0) parts.push(`-${removed}`);
    return parts.join(" ") || "Changed";
}