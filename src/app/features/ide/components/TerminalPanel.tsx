// src/app/features/ide/components/TerminalPanel.tsx
// Full xterm.js terminal connected to the PTY WebSocket server.
// Supports multiple terminal tabs, resize, colors, ping/pong keepalive.
// Renders in the bottom panel of IDEWorkspace.

'use client';

import React, {
    useEffect,
    useRef,
    useState,
    useCallback,
    useImperativeHandle,
    forwardRef,
} from "react";
import { cn } from "@/lib/utils";
import { useIDEStore } from "@/src/store/ide-store";
import type {
    ClientMessage,
    ServerMessage,
} from "@/src/server/sandbox/terminal-protocol";
import {
    TerminalIcon,
    PlusIcon,
    XIcon,
    Loader2Icon,
    WifiOffIcon,
} from "lucide-react";
import { listSessions, attachUserToSession } from "@/src/server/sandbox/persistent-terminal-manager";

// ── xterm imports (dynamic — avoids SSR issues) ───────────────────────────────
// xterm.js uses browser APIs so must never run on server.
// We lazy-load inside useEffect.

type XTermInstance = import("@xterm/xterm").Terminal;
type FitAddonInstance = import("@xterm/addon-fit").FitAddon;

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStatus = "connecting" | "ready" | "error" | "disconnected";

type TerminalSession = {
    id: string;    // local session identifier
    label: string;    // tab label e.g. "bash" or "2"
    status: SessionStatus;
    term: XTermInstance | null;
    fitAddon: FitAddonInstance | null;
    ws: WebSocket | null;
    pingTimer: ReturnType<typeof setInterval> | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const WS_BASE = typeof window !== "undefined"
    ? `ws://${window.location.host}`
    : "ws://localhost:3000";

const PING_INTERVAL = 30_000;   // 30s keepalive
const MAX_TABS = 5;


const XTERM_THEME = {
    background: "#1e1f22",
    foreground: "#e6edf3",
    cursor: "#58a6ff",
    cursorAccent: "#0d1117",
    black: "#21262d",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
    selectionBackground: "#264f78",
};

// ── Single terminal instance ──────────────────────────────────────────────────

interface TerminalInstanceProps {
    session: TerminalSession;
    isActive: boolean;
    workspaceId: string;
    onReady: (sessionId: string) => void;
    onError: (sessionId: string, msg: string) => void;
    onClose: (sessionId: string) => void;
}

const TerminalInstance: React.FC<TerminalInstanceProps> = ({
    session,
    isActive,
    workspaceId,
    onReady,
    onError,
    onClose,
}) => {

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        if (session.term) return;  // already initialized

        let term: XTermInstance;
        let fitAddon: FitAddonInstance;
        let ws: WebSocket;
        let pingTimer: ReturnType<typeof setInterval> | null = null;
        let disposed = false;

        const init = async () => {
            // ── Lazy load xterm (browser only) ────────────────────────────────
            const { Terminal } = await import("@xterm/xterm");
            const { FitAddon } = await import("@xterm/addon-fit");
            const { WebLinksAddon } = await import("@xterm/addon-web-links");

            // Dynamically import xterm CSS once
            await import("@xterm/xterm/css/xterm.css");

            term = new Terminal({
                theme: XTERM_THEME,
                fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                fontSize: 13,
                lineHeight: 1.5,
                cursorBlink: true,
                cursorStyle: "bar",
                scrollback: 5000,
                allowProposedApi: true,
                convertEol: true,
            });

            fitAddon = new FitAddon();
            const linksAddon = new WebLinksAddon();

            term.loadAddon(fitAddon);
            term.loadAddon(linksAddon);
            term.open(containerRef.current!);

            // Fit after a tick so DOM dimensions are stable
            requestAnimationFrame(() => {
                if (!disposed) fitAddon.fit();
            });

            // Store on session object for access from parent
            session.term = term;
            session.fitAddon = fitAddon;

            // ── WebSocket connection ───────────────────────────────────────────
            const params = new URLSearchParams({
                workspaceId,
                cols: String(term.cols),
                rows: String(term.rows),
            });

            ws = new WebSocket(`${WS_BASE}/ws/terminal?${params}`);
            session.ws = ws;

            const send = (msg: ClientMessage) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            };

            ws.onopen = () => {
                term.write("\r\n\x1b[90m[connecting to container...]\x1b[0m\r\n");
            };

            ws.onmessage = (event) => {
                try {
                    const msg: ServerMessage = JSON.parse(event.data);

                    switch (msg.type) {
                        case "ready": {
                            // Clear connecting message, show prompt
                            term.write("\r\x1b[K"); // clear line
                            onReady(session.id);
                            break;
                        }
                        case "output": {
                            // Pass raw PTY output directly — xterm handles ANSI
                            term.write(msg.data);
                            break;
                        }
                        case "error": {
                            term.write(`\r\n\x1b[31m[error: ${msg.message}]\x1b[0m\r\n`);
                            onError(session.id, msg.message);
                            break;
                        }
                        case "exit": {
                            term.write(
                                `\r\n\x1b[90m[process exited with code ${msg.code}]\x1b[0m\r\n`
                            );
                            onClose(session.id);
                            break;
                        }
                        case "pong": {
                            // keepalive acknowledged — no action needed
                            break;
                        }
                    }
                } catch { /* malformed message — ignore */ }
            };

            ws.onclose = (event) => {
                if (!disposed) {
                    term.write(
                        `\r\n\x1b[90m[disconnected (${event.code})]\x1b[0m\r\n`
                    );
                    session.status = "disconnected";
                }
            };

            ws.onerror = () => {
                term.write("\r\n\x1b[31m[WebSocket error — check server]\x1b[0m\r\n");
                onError(session.id, "WebSocket connection failed");
            };

            // ── User input → PTY ───────────────────────────────────────────────
            term.onData((data: string) => {
                send({ type: "input", data });
            });

            // ── Resize observer → keep PTY in sync ────────────────────────────
            const ro = new ResizeObserver(() => {
                if (disposed || !containerRef.current) return;
                fitAddon.fit();
                send({ type: "resize", cols: term.cols, rows: term.rows });
            });
            if (containerRef.current) ro.observe(containerRef.current);

            // ── Ping/pong keepalive ────────────────────────────────────────────
            pingTimer = setInterval(() => {
                send({ type: "ping" });
            }, PING_INTERVAL);
            session.pingTimer = pingTimer;

            // Cleanup
            return () => {
                disposed = true;
                ro.disconnect();
                if (pingTimer) clearInterval(pingTimer);
                ws.close();
                term.dispose();
            };
        };

        let cleanup: (() => void) | undefined;
        init().then((fn) => { cleanup = fn; });

        return () => { cleanup?.(); };

        // Only run once per session
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.id]);



    // ── Focus when tab becomes active ─────────────────────────────────────────
    useEffect(() => {
        if (isActive && session.term) {
            session.term.focus();
            session.fitAddon?.fit();
        }
    }, [isActive, session.term, session.fitAddon]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            style={{
                display: isActive ? "block" : "none",
                backgroundColor: XTERM_THEME.background,
            }}
        />
    );
};

// ── Status overlay (connecting / error) ───────────────────────────────────────

const StatusOverlay: React.FC<{ status: SessionStatus }> = ({ status }) => {
    if (status === "ready") return null;

    return (
        <div className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-[#0d1117] z-10 pointer-events-none"
        )}>
            {status === "connecting" && (
                <div className="flex items-center gap-2 text-[#6e7681] text-xs">
                    <Loader2Icon size={14} className="animate-spin" />
                    <span>Connecting to container...</span>
                </div>
            )}
            {status === "error" && (
                <div className="flex items-center gap-2 text-[#ff7b72] text-xs">
                    <WifiOffIcon size={14} />
                    <span>Connection failed — check server logs</span>
                </div>
            )}
            {status === "disconnected" && (
                <div className="flex items-center gap-2 text-[#6e7681] text-xs">
                    <WifiOffIcon size={14} />
                    <span>Disconnected</span>
                </div>
            )}
        </div>
    );
};

// ── TerminalPanel (main export) ───────────────────────────────────────────────

interface TerminalPanelProps {
    workspaceId: string;
    className?: string;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
    workspaceId,
    className,
}) => {
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const sessionCount = useRef(0);

    // ── Create a new terminal session ─────────────────────────────────────────

    const createSession = useCallback((): TerminalSession => {
        sessionCount.current += 1;
        const id = `term-${Date.now()}`;
        return {
            id,
            label: sessionCount.current === 1 ? "bash" : String(sessionCount.current),
            status: "connecting",
            term: null,
            fitAddon: null,
            ws: null,
            pingTimer: null,
        };
    }, []);

    // ── Open first session on mount ───────────────────────────────────────────

    useEffect(() => {
        if (!workspaceId || sessions.length > 0) return;
        const first = createSession();
        setSessions([first]);
        setActiveId(first.id);
    }, [workspaceId, sessions.length, createSession]);


    useEffect(() => {
        if (!workspaceId) return;

        const sync = async () => {
            try {
                const res = await fetch(
                    `/api/terminal/persistent?action=list&workspaceId=${workspaceId}`
                );
                if (!res.ok) return;
                const { sessions: persistentSessions } = await res.json();

                setSessions(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const toAdd = persistentSessions
                        .filter((ps: any) =>
                            !existingIds.has(`persistent:${ps.name}`) &&
                            ps.status !== "exited"
                        )
                        .map((ps: any) => ({
                            id: `persistent:${ps.name}`,
                            label: ps.name,
                            status: ps.status === "ready" ? "ready" : "connecting",
                            term: null,
                            fitAddon: null,
                            ws: null,
                            pingTimer: null,
                            persistent: true,   // mark as agent-managed
                            sessionName: ps.name,
                        }));

                    return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
                });
            } catch { }
        };

        sync();
        const interval = setInterval(sync, 2000);
        return () => clearInterval(interval);
    }, [workspaceId]);


    // ── Add new tab ────────────────────────────────────────────────────────────

    const handleAddTab = useCallback(() => {
        if (sessions.length >= MAX_TABS) return;
        const session = createSession();
        setSessions((prev) => [...prev, session]);
        setActiveId(session.id);
    }, [sessions.length, createSession]);

    // ── Close tab ──────────────────────────────────────────────────────────────

    const handleCloseTab = useCallback((sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        setSessions((prev) => {
            const session = prev.find((s) => s.id === sessionId);
            if (session) {
                // Clean up resources
                if (session.pingTimer) clearInterval(session.pingTimer);
                session.ws?.close();
                session.term?.dispose();
            }

            const remaining = prev.filter((s) => s.id !== sessionId);

            // If we closed the active tab, activate the nearest one
            if (sessionId === activeId && remaining.length > 0) {
                const closedIdx = prev.findIndex((s) => s.id === sessionId);
                const nextSession = remaining[Math.max(0, closedIdx - 1)];
                setActiveId(nextSession.id);
            }

            return remaining;
        });
    }, [activeId]);

    // ── Session status callbacks ───────────────────────────────────────────────

    const handleReady = useCallback((sessionId: string) => {
        setSessions((prev) =>
            prev.map((s) =>
                s.id === sessionId ? { ...s, status: "ready" as SessionStatus } : s
            )
        );
    }, []);

    const handleError = useCallback((sessionId: string, _msg: string) => {
        setSessions((prev) =>
            prev.map((s) =>
                s.id === sessionId ? { ...s, status: "error" as SessionStatus } : s
            )
        );
    }, []);

    const handleSessionClose = useCallback((sessionId: string) => {
        setSessions((prev) =>
            prev.map((s) =>
                s.id === sessionId ? { ...s, status: "disconnected" as SessionStatus } : s
            )
        );
    }, []);

    const activeSession = sessions.find((s) => s.id === activeId);

    return (
        <div
            className={cn(
                "flex flex-col h-full w-full overflow-hidden",
                className
            )}
            style={{ backgroundColor: "#0d1117" }}
        >
            {/* ── Tab bar ────────────────────────────────────────────────── */}
            <div
                className="flex items-center shrink-0 overflow-x-auto"
                style={{
                    backgroundColor: "#1e1f22",
                    borderBottom: "1px solid #30363d",
                    minHeight: "32px",
                }}
            >
                {/* Terminal icon */}
                <div
                    className="flex items-center gap-1.5 px-3 shrink-0"
                    style={{ color: "#6e7681" }}
                >
                    <TerminalIcon size={12} />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                        Terminal
                    </span>
                </div>

                <div
                    className="w-px h-4 shrink-0 mx-1"
                    style={{ backgroundColor: "#30363d" }}
                />

                {/* Session tabs */}
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        onClick={() => setActiveId(session.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 h-full text-[11px]",
                            "cursor-pointer transition-colors duration-100 shrink-0",
                            "border-r group",
                        )}
                        style={{
                            borderColor: "#30363d",
                            backgroundColor: session.id === activeId
                                ? "#0d1117"
                                : "transparent",
                            color: session.id === activeId
                                ? "#e6edf3"
                                : "#6e7681",
                            borderBottom: session.id === activeId
                                ? "1px solid #0d1117"
                                : "none",
                        }}
                    >
                        {/* Status dot */}
                        <span
                            className={cn(
                                "size-1.5 rounded-full shrink-0",
                                session.status === "ready" && "bg-[#3fb950]",
                                session.status === "connecting" && "bg-[#d29922] animate-pulse",
                                session.status === "error" && "bg-[#ff7b72]",
                                session.status === "disconnected" && "bg-[#6e7681]",
                            )}
                        />

                        <span className="font-mono">{session.label}</span>

                        {/* Close button — shows on hover */}
                        {sessions.length > 1 && (
                            <button
                                onClick={(e) => handleCloseTab(session.id, e)}
                                className={cn(
                                    "flex items-center justify-center rounded",
                                    "opacity-0 group-hover:opacity-100",
                                    "hover:bg-white/10 transition-all duration-100",
                                    "size-3.5 shrink-0",
                                )}
                                style={{ color: "#6e7681" }}
                            >
                                <XIcon size={9} />
                            </button>
                        )}
                    </div>
                ))}

                {/* New tab button */}
                {sessions.length < MAX_TABS && (
                    <button
                        onClick={handleAddTab}
                        className={cn(
                            "flex items-center justify-center",
                            "size-7 mx-1 rounded shrink-0",
                            "transition-colors duration-100",
                        )}
                        style={{ color: "#6e7681" }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#e6edf3";
                            e.currentTarget.style.backgroundColor = "#21262d";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#6e7681";
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        title="New terminal (max 5)"
                    >
                        <PlusIcon size={12} />
                    </button>
                )}
            </div>

            {/* ── Terminal instances ──────────────────────────────────── */}
            <div className="relative flex-1 overflow-hidden">
                {activeSession && (
                    <StatusOverlay status={activeSession.status} />
                )}

                {sessions.map((session) => (
                    <TerminalInstance
                        key={session.id}
                        session={session}
                        isActive={session.id === activeId}
                        workspaceId={workspaceId}
                        onReady={handleReady}
                        onError={handleError}
                        onClose={handleSessionClose}
                    />
                ))}

                {sessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <TerminalIcon size={24} style={{ color: "#6e7681" }} />
                        <p className="text-xs" style={{ color: "#6e7681" }}>
                            No terminal sessions
                        </p>
                        <button
                            onClick={handleAddTab}
                            className="text-xs px-3 py-1.5 rounded-md transition-colors"
                            style={{
                                backgroundColor: "#21262d",
                                color: "#e6edf3",
                                border: "1px solid #30363d",
                            }}
                        >
                            Open Terminal
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};