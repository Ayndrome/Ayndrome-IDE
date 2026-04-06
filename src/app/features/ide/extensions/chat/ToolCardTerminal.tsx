// src/app/features/ide/extensions/chat/components/ToolCardTerminal.tsx
// xterm.js instance rendered inside a ToolCard for run_in_terminal calls.
// Shows live output as the command runs.
// Connects to the persistent session via WebSocket subscription.

'use client';

import React, {
    useEffect, useRef, useState,
} from "react";
import { useIDEStore } from "@/src/store/ide-store";

interface ToolCardTerminalProps {
    sessionName: string;
    output: string;        // accumulated output so far
    isRunning: boolean;
    exitCode?: number | null;
    timedOut?: boolean;
}

export const ToolCardTerminal: React.FC<ToolCardTerminalProps> = ({
    sessionName,
    output,
    isRunning,
    exitCode,
    timedOut,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<any>(null);
    const [ready, setReady] = useState(false);

    // Mount xterm instance
    useEffect(() => {
        if (!containerRef.current) return;
        let disposed = false;

        const init = async () => {
            const { Terminal } = await import("@xterm/xterm");
            await import("@xterm/xterm/css/xterm.css");
            const { FitAddon } = await import("@xterm/addon-fit");

            const term = new Terminal({
                theme: {
                    background: "#0d1117",
                    foreground: "#e6edf3",
                    cursor: "#58a6ff",
                    black: "#21262d",
                    red: "#ff7b72",
                    green: "#3fb950",
                    yellow: "#d29922",
                    blue: "#58a6ff",
                    magenta: "#bc8cff",
                    cyan: "#39c5cf",
                    white: "#b1bac4",
                    brightBlack: "#6e7681",
                },
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 12,
                lineHeight: 1.4,
                rows: 12,
                scrollback: 500,
                convertEol: true,
                disableStdin: true,   // read-only in ToolCard
            });

            const fit = new FitAddon();
            term.loadAddon(fit);
            term.open(containerRef.current!);

            requestAnimationFrame(() => {
                if (!disposed) fit.fit();
            });

            termRef.current = term;
            setReady(true);

            // Write any output already accumulated
            if (output) term.write(output);

            return () => {
                disposed = true;
                term.dispose();
            };
        };

        let cleanup: (() => void) | undefined;
        init().then(fn => { cleanup = fn; });
        return () => { cleanup?.(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Write new output chunks as they arrive
    const prevOutputRef = useRef("");
    useEffect(() => {
        const term = termRef.current;
        if (!term || !ready) return;

        // Only write the delta (new chars since last render)
        const delta = output.slice(prevOutputRef.current.length);
        if (delta) term.write(delta);
        prevOutputRef.current = output;
    }, [output, ready]);

    // Status line
    const statusColor = isRunning ? "#58a6ff"
        : timedOut ? "#d29922"
            : exitCode === 0 ? "#3fb950"
                : exitCode != null ? "#ff7b72"
                    : "#6e7681";

    const statusText = isRunning ? "● running"
        : timedOut ? "⏱ timed out"
            : exitCode === 0 ? "✓ exited 0"
                : exitCode != null ? `✕ exited ${exitCode}`
                    : "—";

    return (
        <div
            className="rounded overflow-hidden"
            style={{ border: "1px solid #30363d" }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-2 py-1"
                style={{
                    backgroundColor: "#161b22",
                    borderBottom: "1px solid #21262d",
                }}
            >
                <span className="text-[11px] font-mono" style={{ color: "#8b949e" }}>
                    terminal: {sessionName}
                </span>
                <span className="text-[10px] font-medium" style={{ color: statusColor }}>
                    {statusText}
                </span>
            </div>

            {/* xterm output */}
            <div
                ref={containerRef}
                style={{
                    backgroundColor: "#0d1117",
                    padding: "4px",
                    minHeight: "120px",
                    maxHeight: "300px",
                    overflowY: "auto",
                }}
            />
        </div>
    );
};