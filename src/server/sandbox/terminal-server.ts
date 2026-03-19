// src/server/sandbox/terminal-server.ts
// WebSocket PTY server — attaches a real terminal to a Docker container.
// Each WS connection = one PTY session = one bash process in the container.
// Multiple connections per workspace are supported (multiple terminal tabs).

import * as pty from "node-pty";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { getOrCreateSandbox } from "./sandbox-manager";
import type {
    ClientMessage,
    ServerMessage,
} from "./terminal-protocol";

// ── Active PTY sessions ───────────────────────────────────────────────────────
// Keyed by a session ID (workspaceId + connection timestamp).
// Cleaned up when WS closes or PTY exits.

type PtySession = {
    sessionId: string;
    workspaceId: string;
    ptyProcess: ReturnType<typeof pty.spawn>;
    connectedAt: number;
};

const ptySessions = new Map<string, PtySession>();

// ── Helper: send typed message to browser ─────────────────────────────────────

function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

// ── Create WebSocket server ───────────────────────────────────────────────────

export function createTerminalWSS(httpServer: Server): WebSocketServer {
    const wss = new WebSocketServer({
        server: httpServer,
        path: "/ws/terminal",
    });

    wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
        // Parse query params
        // URL format: /ws/terminal?workspaceId=abc123&cols=120&rows=30
        const url = new URL(req.url ?? "", "http://localhost");
        const workspaceId = url.searchParams.get("workspaceId");
        const initCols = parseInt(url.searchParams.get("cols") ?? "120", 10);
        const initRows = parseInt(url.searchParams.get("rows") ?? "30", 10);

        if (!workspaceId) {
            send(ws, { type: "error", message: "Missing workspaceId" });
            ws.close();
            return;
        }

        const sessionId = `${workspaceId}-${Date.now()}`;
        console.log(`[Terminal] New session: ${sessionId} (${initCols}x${initRows})`);

        try {
            // Ensure container is running before attaching PTY
            await getOrCreateSandbox(workspaceId);

            // Spawn PTY using docker exec -it
            // -i = keep stdin open
            // -t = allocate a TTY (this is the PTY part)
            // -w = set working directory
            const ptyProcess = pty.spawn("docker", [
                "exec",
                "-it",
                "-w", "/workspace",
                `web-ide-${workspaceId}`,
                "bash",
                "--login",
            ], {
                name: "xterm-256color",
                cols: initCols,
                rows: initRows,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    TERM: "xterm-256color",
                    COLORTERM: "truecolor",
                    // Force color output from common tools
                    FORCE_COLOR: "3",
                    CLICOLOR_FORCE: "1",
                },
            });

            const session: PtySession = {
                sessionId,
                workspaceId,
                ptyProcess,
                connectedAt: Date.now(),
            };
            ptySessions.set(sessionId, session);

            // ── PTY → Browser ─────────────────────────────────────────────────
            // Every byte the container writes to stdout/stderr
            // gets forwarded to xterm.js as-is.
            // ANSI escape codes, colors, cursor movement — all pass through.
            ptyProcess.onData((data: string) => {
                send(ws, { type: "output", data });
            });

            // PTY process exited (container stopped, user typed exit, etc.)
            ptyProcess.onExit(({ exitCode, signal }) => {
                console.log(
                    `[Terminal] PTY exited: ${sessionId} ` +
                    `(code=${exitCode}, signal=${signal})`
                );
                send(ws, { type: "exit", code: exitCode ?? 0 });
                ptySessions.delete(sessionId);
                ws.close();
            });

            // Tell browser the terminal is ready
            send(ws, { type: "ready" });

            // ── Browser → PTY ─────────────────────────────────────────────────
            ws.on("message", (raw: Buffer) => {
                try {
                    const msg: ClientMessage = JSON.parse(raw.toString());

                    switch (msg.type) {
                        case "input": {
                            // User typed something — write to PTY stdin
                            ptyProcess.write(msg.data);
                            break;
                        }
                        case "resize": {
                            // Browser panel resized — update PTY dimensions
                            // This fixes vim layout, ls column wrapping, etc.
                            ptyProcess.resize(
                                Math.max(1, msg.cols),
                                Math.max(1, msg.rows),
                            );
                            break;
                        }
                        case "ping": {
                            send(ws, { type: "pong" });
                            break;
                        }
                    }
                } catch (err) {
                    console.error(`[Terminal] Bad message from client:`, err);
                }
            });

            // ── WS closed by browser ──────────────────────────────────────────
            ws.on("close", (code, reason) => {
                console.log(
                    `[Terminal] WS closed: ${sessionId} ` +
                    `(code=${code})`
                );
                try {
                    ptyProcess.kill();
                } catch { }
                ptySessions.delete(sessionId);
            });

            ws.on("error", (err) => {
                console.error(`[Terminal] WS error: ${sessionId}`, err.message);
                try { ptyProcess.kill(); } catch { }
                ptySessions.delete(sessionId);
            });

        } catch (err: any) {
            console.error(`[Terminal] Failed to start session:`, err.message);
            send(ws, {
                type: "error",
                message: `Failed to start terminal: ${err.message}`,
            });
            ws.close();
        }
    });

    wss.on("error", (err) => {
        console.error("[Terminal] WSS error:", err);
    });

    return wss;
}

// ── Get active session count (for health endpoint) ────────────────────────────

export function getActiveSessionCount(): number {
    return ptySessions.size;
}