// src/components/chat/StatusRing.tsx
// Animated SVG status indicator.
// idle        → invisible
// thinking    → slow rotating dashed ring (grey)
// streaming   → fast rotating solid ring (emerald)
// tool        → pulsing filled dot with ring (blue)
// awaiting    → breathing solid ring (amber) + orbit dot
// error       → static red ring with X
'use-client'
import React, { useEffect } from "react";
import { cn } from "@/lib/utils";

export type RingStatus =
    | "idle"
    | "thinking"
    | "streaming"
    | "tool"
    | "awaiting"
    | "error";

interface StatusRingProps {
    status: RingStatus;
    size?: number;
    className?: string;
}

// CSS injected once for ring keyframes
const RING_STYLES = `
@keyframes ring-spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
@keyframes ring-spin-fast {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
@keyframes ring-orbit {
    from { transform: rotate(0deg) translateX(8px) rotate(0deg); }
    to   { transform: rotate(360deg) translateX(8px) rotate(-360deg); }
}
@keyframes ring-breathe {
    0%, 100% { opacity: 0.5; transform: scale(0.92); }
    50%       { opacity: 1;   transform: scale(1);    }
}
@keyframes ring-pulse-dot {
    0%, 100% { r: 2.5; opacity: 0.7; }
    50%       { r: 3.5; opacity: 1;   }
}
.ring-spin-slow  { animation: ring-spin-slow  2.4s linear infinite; transform-origin: center; }
.ring-spin-fast  { animation: ring-spin-fast  0.8s linear infinite; transform-origin: center; }
.ring-orbit      { animation: ring-orbit      1.6s linear infinite; transform-origin: center; }
.ring-breathe    { animation: ring-breathe    1.8s ease-in-out infinite; transform-origin: center; }
.ring-pulse-dot  { animation: ring-pulse-dot  1.2s ease-in-out infinite; }
`;

let stylesInjected = false;
function injectRingStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = RING_STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
}

export const StatusRing: React.FC<StatusRingProps> = ({
    status,
    size = 20,
    className,
}) => {
    useEffect(() => { injectRingStyles(); }, []);

    if (status === "idle") return null;

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2.5;
    const circ = 2 * Math.PI * r;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn("flex-shrink-0", className)}
        >
            {/* ── Thinking: slow dashed grey ring ── */}
            {status === "thinking" && (
                <g className="ring-spin-slow">
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeOpacity="0.35"
                        strokeDasharray={`${circ * 0.25} ${circ * 0.75}`}
                        strokeLinecap="round"
                        className="text-zinc-400 dark:text-zinc-500"
                    />
                </g>
            )}

            {/* ── Streaming: fast emerald ring ── */}
            {status === "streaming" && (
                <>
                    {/* Track */}
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeOpacity="0.12"
                        className="text-emerald-500"
                    />
                    {/* Spinner arc */}
                    <g className="ring-spin-fast">
                        <circle
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeDasharray={`${circ * 0.28} ${circ * 0.72}`}
                            strokeLinecap="round"
                            className="text-emerald-400"
                        />
                    </g>
                </>
            )}

            {/* ── Tool: blue pulsing ring + center dot ── */}
            {status === "tool" && (
                <>
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeOpacity="0.18"
                        className="text-sky-400"
                    />
                    <g className="ring-spin-slow">
                        <circle
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeDasharray={`${circ * 0.18} ${circ * 0.82}`}
                            strokeLinecap="round"
                            className="text-sky-400"
                        />
                    </g>
                    <circle
                        cx={cx} cy={cy} r="2.5"
                        fill="currentColor"
                        className="text-sky-400 ring-pulse-dot"
                    />
                </>
            )}

            {/* ── Awaiting: amber breathing ring + orbiting dot ── */}
            {status === "awaiting" && (
                <>
                    <g className="ring-breathe">
                        <circle
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            className="text-amber-400"
                        />
                    </g>
                    <g className="ring-orbit" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                        <circle
                            cx={cx} cy={cy - r + 2}
                            r="2"
                            fill="currentColor"
                            className="text-amber-300"
                        />
                    </g>
                </>
            )}

            {/* ── Error: static red ring ── */}
            {status === "error" && (
                <>
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        className="text-red-500"
                        strokeOpacity="0.7"
                    />
                    <line
                        x1={cx - r * 0.38} y1={cy - r * 0.38}
                        x2={cx + r * 0.38} y2={cy + r * 0.38}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        className="text-red-500"
                    />
                    <line
                        x1={cx + r * 0.38} y1={cy - r * 0.38}
                        x2={cx - r * 0.38} y2={cy + r * 0.38}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        className="text-red-500"
                    />
                </>
            )}
        </svg>
    );
};

// ── StatusLabel ───────────────────────────────────────────────────────────────
// Animated text label that cycles through fill-in-middle phrases
// while a specific status is active.

const THINKING_PHRASES = ["Thinking", "Reasoning", "Analyzing"];
const TOOL_PHRASES: Record<string, string[]> = {
    read_file: ["Reading file", "Parsing content", "Loading file"],
    write_file: ["Writing file", "Applying changes", "Saving"],
    search_files: ["Searching", "Scanning files", "Looking up"],
    search_in_file: ["Searching in file", "Scanning lines"],
    list_directory: ["Listing directory", "Reading tree"],
    run_terminal: ["Running command", "Executing", "In terminal"],
    create_file: ["Creating file"],
    delete_file: ["Deleting file"],
};

interface StatusLabelProps {
    status: RingStatus;
    toolName?: string;
    className?: string;
}

export const StatusLabel: React.FC<StatusLabelProps> = ({
    status,
    toolName,
    className,
}) => {
    const [phraseIdx, setPhraseIdx] = useState(0);
    const [dotCount, setDotCount] = useState(1);

    const phrases =
        status === "thinking"
            ? THINKING_PHRASES
            : status === "tool" && toolName
                ? TOOL_PHRASES[toolName] ?? ["Working"]
                : status === "streaming"
                    ? ["Generating"]
                    : status === "awaiting"
                        ? ["Waiting for approval"]
                        : [];

    // Cycle phrases every 2.4s
    useEffect(() => {
        if (phrases.length <= 1) return;
        const id = setInterval(() => {
            setPhraseIdx((i) => (i + 1) % phrases.length);
        }, 2400);
        return () => clearInterval(id);
    }, [status, toolName]);

    // Animate dots
    useEffect(() => {
        if (status === "idle" || status === "error") return;
        const id = setInterval(() => {
            setDotCount((d) => (d % 3) + 1);
        }, 420);
        return () => clearInterval(id);
    }, [status]);

    if (status === "idle" || status === "error" || phrases.length === 0) return null;

    const dots = ".".repeat(dotCount);

    return (
        <span
            className={cn(
                "text-[11px] font-mono tracking-wide transition-opacity duration-300",
                status === "streaming" && "text-emerald-400/80",
                status === "thinking" && "text-zinc-400/70",
                status === "tool" && "text-sky-400/80",
                status === "awaiting" && "text-amber-400/80",
                className
            )}
        >
            {phrases[phraseIdx]}{dots}
        </span>
    );
};

// Need useState import
import { useState } from "react";