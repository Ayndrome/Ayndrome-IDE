// src/app/__tests__/test-diff/page.tsx
// Interactive test harness for the diff engine, DiffViewer component,
// and streaming writer simulation. No real editor — all tests run in-browser.
//@ts-nocheck
"use client";

import React, { useState, useCallback, useRef } from "react";
import {
    computeFileDiff,
    applyPartialDiff,
    diffSummary,
    type FileDiff,
    type DiffHunk,
} from "../features/ide/extensions/chat/agent/diff-engine";
import { DiffViewer } from "../features/ide/extensions/chat/DiffViewer";
import {
    CheckIcon,
    XIcon,
    PlayIcon,
    RotateCcwIcon,
    ZapIcon,
    FileCodeIcon,
    ListIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    TerminalIcon,
    ClockIcon,
    Loader2Icon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Test scenarios
// ─────────────────────────────────────────────────────────────────────────────

type Scenario = {
    id: string;
    label: string;
    description: string;
    filePath: string;
    oldContent: string;
    newContent: string;
    category: "diff" | "streaming" | "edge";
};

const SCENARIOS: Scenario[] = [
    // ── Diff scenarios ────────────────────────────────────────────────────────
    {
        id: "small-change",
        label: "Small change",
        description: "Single line replacement in the middle of a file",
        category: "diff",
        filePath: "src/utils/math.ts",
        oldContent: `// Math utilities
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`,
        newContent: `// Math utilities
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  // Fixed: was returning wrong sign
  return b - a;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`,
    },
    {
        id: "multiple-hunks",
        label: "Multiple hunks",
        description: "Changes in two separate parts of the file",
        category: "diff",
        filePath: "src/components/Button.tsx",
        oldContent: `import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn"
    >
      {label}
    </button>
  );
}

// TODO: add more variants`,
        newContent: `import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ label, onClick, disabled, variant = 'primary', size = 'md' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`btn btn--\${variant} btn--\${size}\`}
    >
      {label}
    </button>
  );
}

export { Button as default };`,
    },
    {
        id: "new-file",
        label: "New file (empty → content)",
        description: "Diffing an empty string to a full file (new file creation)",
        category: "diff",
        filePath: "src/hooks/useDebounce.ts",
        oldContent: "",
        newContent: `import { useState, useEffect } from 'react';

/**
 * Debounces a value by the given delay (ms).
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}`,
    },
    {
        id: "deletion",
        label: "Large deletion",
        description: "Removing a big block of code",
        category: "diff",
        filePath: "src/legacy/old-api.ts",
        oldContent: `// Legacy API — to be removed
export async function fetchUserData(userId: string) {
  const res = await fetch(\`/api/v1/users/\${userId}\`);
  return res.json();
}

export async function updateUserProfile(userId: string, data: unknown) {
  const res = await fetch(\`/api/v1/users/\${userId}\`, {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function deleteUser(userId: string) {
  await fetch(\`/api/v1/users/\${userId}\`, { method: 'DELETE' });
}

export function formatUserName(first: string, last: string) {
  return \`\${first} \${last}\`.trim();
}`,
        newContent: `// Migrated to /src/api/users.ts — this file is kept for backwards compat
export { fetchUserData, updateUserProfile, deleteUser } from '../api/users';`,
    },
    {
        id: "identical",
        label: "No changes (identical)",
        description: "Diffing a file against itself — should show 0 hunks",
        category: "edge",
        filePath: "src/config.ts",
        oldContent: `export const CONFIG = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};`,
        newContent: `export const CONFIG = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};`,
    },
    {
        id: "whitespace",
        label: "Whitespace only",
        description: "Only trailing newline differences",
        category: "edge",
        filePath: "src/types.ts",
        oldContent: `export type ID = string;
export type Timestamp = number;`,
        newContent: `export type ID = string;
export type Timestamp = number;
`,
    },
    // ── Streaming scenarios ───────────────────────────────────────────────────
    {
        id: "stream-short",
        label: "Stream — short file",
        description: "Simulates streaming a short file chunk by chunk",
        category: "streaming",
        filePath: "src/greet.ts",
        oldContent: `export function greet(name: string) {
  return \`Hello, \${name}!\`;
}`,
        newContent: `export function greet(name: string, formal = false) {
  if (formal) return \`Good day, \${name}.\`;
  return \`Hey, \${name}!\`;
}

export function farewell(name: string) {
  return \`Goodbye, \${name}!\`;
}`,
    },
    {
        id: "stream-abort",
        label: "Stream — abort mid-way",
        description: "Starts streaming then aborts, restoring old content",
        category: "streaming",
        filePath: "src/parser.ts",
        oldContent: `export function parse(input: string) {
  return JSON.parse(input);
}`,
        newContent: `export function parse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Event log
// ─────────────────────────────────────────────────────────────────────────────

type LogEntry = {
    id: string;
    ts: number;
    level: "info" | "success" | "warn" | "error";
    message: string;
};

function useLog() {
    const [entries, setEntries] = useState<LogEntry[]>([]);

    const log = useCallback(
        (level: LogEntry["level"], message: string) => {
            setEntries((prev) => [
                ...prev,
                { id: crypto.randomUUID(), ts: Date.now(), level, message },
            ]);
        },
        []
    );

    const clear = useCallback(() => setEntries([]), []);

    return { entries, log, clear };
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming simulation (no real CodeMirror — just text area)
// ─────────────────────────────────────────────────────────────────────────────

type StreamState = {
    status: "idle" | "streaming" | "done" | "aborted";
    content: string;
    chunksWritten: number;
    totalChunks: number;
};

function useStreamSimulator(log: (l: LogEntry["level"], m: string) => void) {
    const [state, setState] = useState<StreamState>({
        status: "idle",
        content: "",
        chunksWritten: 0,
        totalChunks: 0,
    });
    const abortRef = useRef(false);

    const simulate = useCallback(
        async (
            scenario: Scenario,
            onDone: (newContent: string, oldContent: string) => void
        ) => {
            abortRef.current = false;

            const chunks = scenario.newContent
                .split(/(?<=\n)/)
                .flatMap((line) => {
                    // split each line into small chunks
                    const parts: string[] = [];
                    for (let i = 0; i < line.length; i += 8) {
                        parts.push(line.slice(i, i + 8));
                    }
                    return parts;
                });

            setState({
                status: "streaming",
                content: "",
                chunksWritten: 0,
                totalChunks: chunks.length,
            });

            log("info", `[Stream] Starting → ${scenario.filePath} (${chunks.length} chunks)`);

            let accumulated = "";

            for (let i = 0; i < chunks.length; i++) {
                if (abortRef.current) {
                    setState((s) => ({ ...s, status: "aborted", content: scenario.oldContent }));
                    log("warn", `[Stream] Aborted at chunk ${i}/${chunks.length} — restoring old content`);
                    return;
                }
                accumulated += chunks[i];
                setState((s) => ({
                    ...s,
                    content: accumulated,
                    chunksWritten: i + 1,
                }));
                await new Promise((r) => setTimeout(r, 18));
            }

            setState((s) => ({ ...s, status: "done" }));
            log("success", `[Stream] Done — ${chunks.length} chunks written`);
            onDone(accumulated, scenario.oldContent);
        },
        [log]
    );

    const abort = useCallback(() => {
        abortRef.current = true;
    }, []);

    const reset = useCallback(() => {
        abortRef.current = false;
        setState({ status: "idle", content: "", chunksWritten: 0, totalChunks: 0 });
    }, []);

    return { state, simulate, abort, reset };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario card
// ─────────────────────────────────────────────────────────────────────────────

const categoryColor: Record<Scenario["category"], string> = {
    diff: "#1f6feb",
    streaming: "#8957e5",
    edge: "#d29922",
};
const categoryLabel: Record<Scenario["category"], string> = {
    diff: "Diff",
    streaming: "Stream",
    edge: "Edge",
};

const ScenarioCard: React.FC<{
    scenario: Scenario;
    active: boolean;
    onClick: () => void;
}> = ({ scenario, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "10px 12px",
            borderRadius: "6px",
            border: active ? `1px solid ${categoryColor[scenario.category]}` : "1px solid #30363d",
            background: active ? "rgba(31,111,235,0.08)" : "#0d1117",
            cursor: "pointer",
            textAlign: "left",
            transition: "border-color 0.15s",
            width: "100%",
        }}
    >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
                style={{
                    fontSize: "9px",
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: "3px",
                    background: categoryColor[scenario.category] + "33",
                    color: categoryColor[scenario.category],
                    fontFamily: "monospace",
                    letterSpacing: "0.04em",
                }}
            >
                {categoryLabel[scenario.category]}
            </span>
            <span style={{ fontSize: "12px", color: "#e6edf3", fontWeight: 500 }}>
                {scenario.label}
            </span>
        </div>
        <span style={{ fontSize: "11px", color: "#6e7681" }}>{scenario.description}</span>
    </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Log panel
// ─────────────────────────────────────────────────────────────────────────────

const levelColor = {
    info: "#8b949e",
    success: "#3fb950",
    warn: "#d29922",
    error: "#f85149",
};

const LogPanel: React.FC<{ entries: LogEntry[]; onClear: () => void }> = ({
    entries,
    onClear,
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [entries.length]);

    return (
        <div
            style={{
                background: "#010409",
                border: "1px solid #21262d",
                borderRadius: "6px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "200px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderBottom: "1px solid #21262d",
                    background: "#0d1117",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <TerminalIcon size={12} color="#6e7681" />
                    <span style={{ fontSize: "11px", color: "#6e7681", fontFamily: "monospace" }}>
                        Event log
                    </span>
                    <span
                        style={{
                            fontSize: "10px",
                            color: "#6e7681",
                            background: "#21262d",
                            borderRadius: "8px",
                            padding: "0 5px",
                        }}
                    >
                        {entries.length}
                    </span>
                </div>
                <button
                    onClick={onClear}
                    style={{
                        fontSize: "10px",
                        color: "#6e7681",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "monospace",
                    }}
                >
                    Clear
                </button>
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "6px 10px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                }}
            >
                {entries.length === 0 && (
                    <span style={{ color: "#484f58" }}>No events yet. Run a test.</span>
                )}
                {entries.map((e) => (
                    <div key={e.id} style={{ display: "flex", gap: "8px" }}>
                        <span style={{ color: "#484f58", flexShrink: 0 }}>
                            {new Date(e.ts).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            })}
                        </span>
                        <span style={{ color: levelColor[e.level] }}>{e.message}</span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Diff stats badge
// ─────────────────────────────────────────────────────────────────────────────

const DiffStats: React.FC<{ diff: FileDiff }> = ({ diff }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px 12px",
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: "6px",
            fontSize: "11px",
            fontFamily: "monospace",
        }}
    >
        <span style={{ color: "#8b949e" }}>
            <FileCodeIcon size={11} style={{ display: "inline", marginRight: "4px" }} />
            {diff.filePath}
        </span>
        <span style={{ color: "#3fb950" }}>+{diff.stats.added}</span>
        <span style={{ color: "#ff7b72" }}>−{diff.stats.removed}</span>
        <span style={{ color: "#8b949e" }}>{diff.hunks.length} hunk{diff.hunks.length !== 1 ? "s" : ""}</span>
        <span style={{ color: "#8b949e" }}>
            {diffSummary(diff)}
        </span>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Applied result panel
// ─────────────────────────────────────────────────────────────────────────────

const AppliedResult: React.FC<{ content: string; label: string }> = ({ content, label }) => {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <div
            style={{
                border: "1px solid #30363d",
                borderRadius: "6px",
                overflow: "hidden",
            }}
        >
            <div
                onClick={() => setCollapsed((v) => !v)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    background: "#161b22",
                    cursor: "pointer",
                    borderBottom: collapsed ? "none" : "1px solid #21262d",
                }}
            >
                {collapsed ? <ChevronRightIcon size={12} color="#6e7681" /> : <ChevronDownIcon size={12} color="#6e7681" />}
                <span style={{ fontSize: "11px", color: "#8b949e", fontFamily: "monospace" }}>
                    {label}
                </span>
            </div>
            {!collapsed && (
                <pre
                    style={{
                        margin: 0,
                        padding: "10px 12px",
                        background: "#0d1117",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "#e6edf3",
                        overflowX: "auto",
                        maxHeight: "250px",
                        overflowY: "auto",
                    }}
                >
                    {content || <span style={{ color: "#484f58" }}>(empty)</span>}
                </pre>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Streaming progress bar
// ─────────────────────────────────────────────────────────────────────────────

const StreamProgress: React.FC<{ state: StreamState }> = ({ state }) => {
    const pct =
        state.totalChunks > 0
            ? Math.round((state.chunksWritten / state.totalChunks) * 100)
            : 0;

    const statusColor =
        state.status === "done"
            ? "#3fb950"
            : state.status === "aborted"
                ? "#ff7b72"
                : state.status === "streaming"
                    ? "#1f6feb"
                    : "#484f58";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    fontFamily: "monospace",
                }}
            >
                <span style={{ color: statusColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {state.status === "idle" ? "Ready" : state.status}
                </span>
                {state.status === "streaming" && (
                    <span style={{ color: "#6e7681" }}>
                        {state.chunksWritten} / {state.totalChunks} chunks ({pct}%)
                    </span>
                )}
            </div>
            <div
                style={{
                    height: "4px",
                    background: "#21262d",
                    borderRadius: "2px",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: statusColor,
                        borderRadius: "2px",
                        transition: "width 0.08s linear, background 0.3s",
                    }}
                />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function TestDiffPage() {
    const { entries, log, clear } = useLog();
    const [activeId, setActiveId] = useState<string>(SCENARIOS[0].id);
    const [activeDiff, setActiveDiff] = useState<FileDiff | null>(null);
    const [appliedContent, setAppliedContent] = useState<string | null>(null);
    const [streamResult, setStreamResult] = useState<{
        diff: FileDiff;
        newContent: string;
    } | null>(null);

    const { state: streamState, simulate, abort, reset: resetStream } = useStreamSimulator(log);

    const scenario = SCENARIOS.find((s) => s.id === activeId)!;
    const isStreaming = scenario.category === "streaming";

    // ── Run diff test ─────────────────────────────────────────────────────────

    const runDiff = useCallback(() => {
        setAppliedContent(null);
        setActiveDiff(null);
        log("info", `[Diff] Computing diff for ${scenario.filePath}…`);

        const diff = computeFileDiff(
            scenario.filePath,
            scenario.oldContent,
            scenario.newContent
        );

        setActiveDiff(diff);
        log(
            diff.hunks.length === 0 ? "warn" : "success",
            `[Diff] Done — ${diff.hunks.length} hunk(s), +${diff.stats.added} −${diff.stats.removed}`
        );
    }, [scenario, log]);

    // ── Accept / reject all (from test harness) ───────────────────────────────

    const acceptAll = useCallback(() => {
        if (!activeDiff) return;
        const updated: FileDiff = {
            ...activeDiff,
            hunks: activeDiff.hunks.map((h) => ({ ...h, accepted: true })),
        };
        setActiveDiff(updated);
        const result = applyPartialDiff(updated);
        setAppliedContent(result);
        log("success", `[Diff] Accepted all ${updated.hunks.length} hunk(s) → applied`);
    }, [activeDiff, log]);

    const rejectAll = useCallback(() => {
        if (!activeDiff) return;
        const updated: FileDiff = {
            ...activeDiff,
            hunks: activeDiff.hunks.map((h) => ({ ...h, accepted: false })),
        };
        setActiveDiff(updated);
        const result = applyPartialDiff(updated);
        setAppliedContent(result);
        log("warn", `[Diff] Rejected all ${updated.hunks.length} hunk(s) → reverted to old content`);
    }, [activeDiff, log]);

    // ── Mock apply (DiffViewer callback) ──────────────────────────────────────

    const handleApply = useCallback(
        async (finalDiff: FileDiff) => {
            const content = applyPartialDiff(finalDiff);
            setAppliedContent(content);
            setActiveDiff(finalDiff);
            const accepted = finalDiff.hunks.filter((h) => h.accepted === true).length;
            const rejected = finalDiff.hunks.filter((h) => h.accepted === false).length;
            log(
                "success",
                `[Diff] Applied — ${accepted} accepted, ${rejected} rejected`
            );
        },
        [log]
    );

    // ── Streaming ─────────────────────────────────────────────────────────────

    const runStream = useCallback(() => {
        setStreamResult(null);
        resetStream();
        simulate(scenario, (newContent, oldContent) => {
            const diff = computeFileDiff(scenario.filePath, oldContent, newContent);
            setStreamResult({ diff, newContent });
            if (diff.hunks.length > 0) {
                log("success", `[Stream] Diff computed — ${diff.hunks.length} hunk(s)`);
            } else {
                log("info", "[Stream] No diff — content unchanged");
            }
        });
    }, [scenario, simulate, resetStream, log]);

    const handleAbort = useCallback(() => {
        abort();
    }, [abort]);

    // ── Reset ─────────────────────────────────────────────────────────────────

    const handleReset = useCallback(() => {
        setActiveDiff(null);
        setAppliedContent(null);
        setStreamResult(null);
        resetStream();
        log("info", "[Reset] Cleared all state");
    }, [resetStream, log]);

    // ── Select scenario ───────────────────────────────────────────────────────

    const handleSelectScenario = useCallback(
        (id: string) => {
            setActiveId(id);
            setActiveDiff(null);
            setAppliedContent(null);
            setStreamResult(null);
            resetStream();
        },
        [resetStream]
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#010409",
                color: "#e6edf3",
                fontFamily: "'Inter', system-ui, sans-serif",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Header */}
            <div
                style={{
                    borderBottom: "1px solid #21262d",
                    padding: "16px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "#0d1117",
                }}
            >
                <ZapIcon size={18} color="#1f6feb" />
                <div>
                    <h1
                        style={{
                            fontSize: "15px",
                            fontWeight: 600,
                            margin: 0,
                            color: "#e6edf3",
                        }}
                    >
                        Diff Engine &amp; Streaming Writer — Test Harness
                    </h1>
                    <p style={{ fontSize: "11px", color: "#6e7681", margin: 0 }}>
                        Interactive tests for{" "}
                        <code style={{ color: "#79c0ff" }}>diff-engine.ts</code>,{" "}
                        <code style={{ color: "#79c0ff" }}>DiffViewer.tsx</code>, and streaming
                        simulation
                    </p>
                </div>
            </div>

            {/* Body */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "260px 1fr",
                    flex: 1,
                    overflow: "hidden",
                    height: "calc(100vh - 65px)",
                }}
            >
                {/* Sidebar — scenarios */}
                <div
                    style={{
                        borderRight: "1px solid #21262d",
                        overflowY: "auto",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        background: "#0d1117",
                    }}
                >
                    <div
                        style={{
                            fontSize: "10px",
                            color: "#484f58",
                            fontFamily: "monospace",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            padding: "4px 2px 8px",
                        }}
                    >
                        Scenarios
                    </div>
                    {SCENARIOS.map((s) => (
                        <ScenarioCard
                            key={s.id}
                            scenario={s}
                            active={s.id === activeId}
                            onClick={() => handleSelectScenario(s.id)}
                        />
                    ))}
                </div>

                {/* Main panel */}
                <div
                    style={{
                        overflowY: "auto",
                        padding: "20px 24px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                    }}
                >
                    {/* Scenario header */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0 }}>
                                {scenario.label}
                            </h2>
                            <span
                                style={{
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: categoryColor[scenario.category] + "33",
                                    color: categoryColor[scenario.category],
                                    fontFamily: "monospace",
                                }}
                            >
                                {categoryLabel[scenario.category]}
                            </span>
                        </div>
                        <p style={{ fontSize: "12px", color: "#8b949e", margin: 0 }}>
                            {scenario.description}
                        </p>
                        <code
                            style={{
                                fontSize: "11px",
                                color: "#79c0ff",
                                fontFamily: "monospace",
                            }}
                        >
                            {scenario.filePath}
                        </code>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {!isStreaming ? (
                            <>
                                <ActionButton
                                    icon={<PlayIcon size={13} />}
                                    label="Run diff"
                                    color="#1f6feb"
                                    onClick={runDiff}
                                />
                                <ActionButton
                                    icon={<CheckIcon size={13} />}
                                    label="Accept all"
                                    color="#3fb950"
                                    onClick={acceptAll}
                                    disabled={!activeDiff || activeDiff.hunks.length === 0}
                                />
                                <ActionButton
                                    icon={<XIcon size={13} />}
                                    label="Reject all"
                                    color="#ff7b72"
                                    onClick={rejectAll}
                                    disabled={!activeDiff || activeDiff.hunks.length === 0}
                                />
                            </>
                        ) : (
                            <>
                                <ActionButton
                                    icon={
                                        streamState.status === "streaming" ? (
                                            <Loader2Icon size={13} className="animate-spin" />
                                        ) : (
                                            <PlayIcon size={13} />
                                        )
                                    }
                                    label={streamState.status === "streaming" ? "Streaming…" : "Start stream"}
                                    color="#8957e5"
                                    onClick={runStream}
                                    disabled={streamState.status === "streaming"}
                                />
                                <ActionButton
                                    icon={<XIcon size={13} />}
                                    label="Abort stream"
                                    color="#ff7b72"
                                    onClick={handleAbort}
                                    disabled={streamState.status !== "streaming"}
                                />
                            </>
                        )}
                        <ActionButton
                            icon={<RotateCcwIcon size={13} />}
                            label="Reset"
                            color="#6e7681"
                            onClick={handleReset}
                        />
                    </div>

                    {/* Streaming progress */}
                    {isStreaming && streamState.status !== "idle" && (
                        <StreamProgress state={streamState} />
                    )}

                    {/* Streaming content preview */}
                    {isStreaming && streamState.status !== "idle" && (
                        <div
                            style={{
                                border: "1px solid #30363d",
                                borderRadius: "6px",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    padding: "6px 10px",
                                    background: "#161b22",
                                    borderBottom: "1px solid #21262d",
                                    fontSize: "11px",
                                    color: "#8b949e",
                                    fontFamily: "monospace",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}
                            >
                                <ClockIcon size={11} />
                                Live stream content
                                {streamState.status === "streaming" && (
                                    <span
                                        style={{
                                            display: "inline-block",
                                            width: "6px",
                                            height: "6px",
                                            borderRadius: "50%",
                                            background: "#3fb950",
                                            animation: "pulse 1s infinite",
                                            marginLeft: "4px",
                                        }}
                                    />
                                )}
                            </div>
                            <pre
                                style={{
                                    margin: 0,
                                    padding: "10px 12px",
                                    background: "#0d1117",
                                    fontSize: "11px",
                                    fontFamily: "monospace",
                                    color: "#e6edf3",
                                    overflowX: "auto",
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {streamState.content}
                                {streamState.status === "streaming" && (
                                    <span
                                        style={{
                                            display: "inline-block",
                                            width: "2px",
                                            height: "12px",
                                            background: "#e6edf3",
                                            verticalAlign: "middle",
                                            animation: "blink 0.7s step-end infinite",
                                        }}
                                    />
                                )}
                            </pre>
                        </div>
                    )}

                    {/* Diff stats */}
                    {activeDiff && <DiffStats diff={activeDiff} />}
                    {streamResult && !activeDiff && <DiffStats diff={streamResult.diff} />}

                    {/* DiffViewer */}
                    {activeDiff && (
                        <DiffViewer
                            diff={activeDiff}
                            onApply={handleApply}
                            showButtons
                        />
                    )}

                    {/* Stream → DiffViewer */}
                    {streamResult && streamResult.diff.hunks.length > 0 && (
                        <DiffViewer
                            diff={streamResult.diff}
                            onApply={async (finalDiff) => {
                                const content = applyPartialDiff(finalDiff);
                                setStreamResult((prev) =>
                                    prev ? { ...prev, diff: finalDiff } : null
                                );
                                log("success", "[Stream→Diff] Applied user decisions");
                            }}
                            showButtons
                        />
                    )}

                    {/* Applied result */}
                    {appliedContent !== null && (
                        <AppliedResult
                            content={appliedContent}
                            label={`Result after apply — ${scenario.filePath}`}
                        />
                    )}

                    {/* Old / new code panels when no diff run yet */}
                    {!activeDiff && !streamResult && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <AppliedResult content={scenario.oldContent} label="Old content" />
                            <AppliedResult content={scenario.newContent} label="New content" />
                        </div>
                    )}

                    {/* Log panel */}
                    <LogPanel entries={entries} onClear={clear} />
                </div>
            </div>

            {/* Keyframe animations */}
            <style>{`
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helper: action button
// ─────────────────────────────────────────────────────────────────────────────

const ActionButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    color: string;
    onClick: () => void;
    disabled?: boolean;
}> = ({ icon, label, color, onClick, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 12px",
            borderRadius: "6px",
            border: `1px solid ${disabled ? "#21262d" : color + "66"}`,
            background: disabled ? "#0d1117" : color + "22",
            color: disabled ? "#484f58" : color,
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: "12px",
            fontWeight: 500,
            transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
            if (!disabled) {
                e.currentTarget.style.background = color + "44";
                e.currentTarget.style.borderColor = color + "aa";
            }
        }}
        onMouseLeave={(e) => {
            if (!disabled) {
                e.currentTarget.style.background = color + "22";
                e.currentTarget.style.borderColor = color + "66";
            }
        }}
    >
        {icon}
        {label}
    </button>
);