// src/app/features/ide/extensions/chat/agent/lint-healer.ts
// After every write_file, runs the appropriate linter and feeds errors
// back to the agent as a follow-up tool result.
// The agent then fixes errors without needing the user to ask.

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_HEAL_ROUNDS = 2;   // prevent infinite lint-fix loops

type LintResult = {
    hasErrors: boolean;
    errorCount: number;
    output: string;
};

// ── Per-run heal counter ──────────────────────────────────────────────────────

const healRounds = new Map<string, number>(); // filePath → rounds

export function resetHealState(): void {
    healRounds.clear();
}

export function canHeal(filePath: string): boolean {
    return (healRounds.get(filePath) ?? 0) < MAX_HEAL_ROUNDS;
}

export function recordHealRound(filePath: string): void {
    healRounds.set(filePath, (healRounds.get(filePath) ?? 0) + 1);
}

// ── Run linter ────────────────────────────────────────────────────────────────

export async function runLinter(
    workspaceId: string,
    filePath: string,
): Promise<LintResult> {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

    // Pick the right linter command
    const command = getLinterCommand(filePath, ext);
    if (!command) {
        return { hasErrors: false, errorCount: 0, output: "" };
    }

    try {
        const res = await fetch("/api/terminal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspaceId,
                command,
                stream: false,
            }),
        });

        if (!res.ok) return { hasErrors: false, errorCount: 0, output: "" };

        const data = await res.json();
        const output = (data.stdout + "\n" + data.stderr).trim();
        const exitCode = data.exitCode ?? 0;

        // Exit code 0 = no errors
        if (exitCode === 0) {
            return { hasErrors: false, errorCount: 0, output: "" };
        }

        // Count error lines
        const errorLines = output
            .split("\n")
            .filter(l =>
                l.includes(" error ") ||
                l.includes(": error:") ||
                l.toLowerCase().startsWith("error")
            );

        return {
            hasErrors: errorLines.length > 0,
            errorCount: errorLines.length,
            output: output.slice(0, 3000), // cap output
        };

    } catch {
        return { hasErrors: false, errorCount: 0, output: "" };
    }
}

// ── Linter command per file type ──────────────────────────────────────────────

function getLinterCommand(filePath: string, ext: string): string | null {
    // TypeScript / TSX
    if (["ts", "tsx"].includes(ext)) {
        // Use project tsconfig if it exists, else basic check
        return (
            `cd /workspace && ` +
            `if [ -f tsconfig.json ]; then ` +
            `  npx tsc --noEmit 2>&1 | grep -E "^.*\\.tsx?\\([0-9]" | head -30; ` +
            `else ` +
            `  npx tsc --noEmit --allowJs --checkJs --target ES2020 ` +
            `  --moduleResolution node --jsx react-jsx ` +
            `  "${filePath}" 2>&1 | head -30; ` +
            `fi`
        );
    }

    // JavaScript
    if (["js", "jsx", "mjs"].includes(ext)) {
        return (
            `cd /workspace && ` +
            `if [ -f .eslintrc* ] || [ -f eslint.config* ]; then ` +
            `  npx eslint "${filePath}" --max-warnings 0 2>&1 | head -30; ` +
            `else ` +
            `  node --check "${filePath}" 2>&1 | head -20; ` +
            `fi`
        );
    }

    // Python
    if (ext === "py") {
        return (
            `cd /workspace && ` +
            `python3 -m py_compile "${filePath}" 2>&1 && ` +
            `echo "OK" || echo "SYNTAX ERROR"`
        );
    }

    // Go
    if (ext === "go") {
        return `cd /workspace && go vet ./... 2>&1 | head -20`;
    }

    // Rust
    if (ext === "rs") {
        return `cd /workspace && cargo check 2>&1 | head -30`;
    }

    return null; // no linter for this type
}

// ── Build feedback message for agent ─────────────────────────────────────────

export function buildLintFeedback(
    filePath: string,
    result: LintResult,
    roundNum: number,
): string {
    if (!result.hasErrors) {
        return `✓ ${filePath} passes lint checks.`;
    }

    return [
        `Lint check after writing ${filePath} found ${result.errorCount} error(s) (round ${roundNum}/${MAX_HEAL_ROUNDS}):`,
        "",
        result.output,
        "",
        `Fix these errors. ${roundNum < MAX_HEAL_ROUNDS ? "You have one more auto-heal round." : "This is the last auto-heal round — fix carefully."}`,
    ].join("\n");
}