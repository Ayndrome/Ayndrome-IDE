// Manages named persistent PTY sessions inside containers.
// Each session is a long-running bash process that persists across tool calls.
// The agent can start npm run dev, then later read its output or send commands.
// Multiple named sessions per workspace — each has an independent bash state.

import * as pty from "node-pty";
import { EventEmitter } from "events";
import { getOrCreateSandbox } from "./sandbox-manager";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus =
    | "starting"
    | "ready"
    | "busy"
    | "exited"
    | "error";

export type OutputChunk = {
    data: string;
    timestamp: number;
    sessionId: string;
};

export type PersistentSession = {
    id: string;     // workspaceId:sessionName e.g. "ws-abc:dev-server"
    workspaceId: string;
    name: string;     // human name e.g. "dev-server", "test-runner"
    status: SessionStatus;
    pid?: number;
    startedAt: number;
    lastOutputAt: number;
    // Circular buffer of last N output lines
    outputBuffer: string[];
    outputMaxLines: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SESSIONS_PER_WORKSPACE = 5;
const OUTPUT_BUFFER_LINES = 500;   // keep last 500 lines per session
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 min idle → kill

// ── Session registry ──────────────────────────────────────────────────────────

// sessionId → { session, ptyProcess, emitter }
type SessionEntry = {
    session: PersistentSession;
    pty: ReturnType<typeof pty.spawn>;
    emitter: EventEmitter;   // emits "data", "exit", "error"
};

const sessions = new Map<string, SessionEntry>();

function makeSessionId(workspaceId: string, name: string): string {
    return `${workspaceId}:${name}`;
}

// ── Start persistent session ──────────────────────────────────────────────────

export async function startPersistentSession(
    workspaceId: string,
    name: string,
    command?: string,   // optional initial command to run
    cols = 220,
    rows = 50,
): Promise<PersistentSession> {
    const sessionId = makeSessionId(workspaceId, name);

    // Return existing if already running
    const existing = sessions.get(sessionId);
    if (existing && existing.session.status !== "exited" &&
        existing.session.status !== "error") {
        return existing.session;
    }

    // Kill old exited session if exists
    if (existing) {
        await killSession(workspaceId, name);
    }

    // Check session limit
    const workspaceSessions = Array.from(sessions.values())
        .filter(e => e.session.workspaceId === workspaceId);
    if (workspaceSessions.length >= MAX_SESSIONS_PER_WORKSPACE) {
        throw new Error(
            `Maximum ${MAX_SESSIONS_PER_WORKSPACE} sessions per workspace. ` +
            `Kill one with kill_terminal("${name}") first.`
        );
    }

    // Ensure container is running
    await getOrCreateSandbox(workspaceId);

    const containerName = `web-ide-${workspaceId}`;

    const session: PersistentSession = {
        id: sessionId,
        workspaceId,
        name,
        status: "starting",
        startedAt: Date.now(),
        lastOutputAt: Date.now(),
        outputBuffer: [],
        outputMaxLines: OUTPUT_BUFFER_LINES,
    };

    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);

    // Spawn PTY into container
    const ptyProcess = pty.spawn("docker", [
        "exec", "-it",
        "-w", "/workspace",
        "-e", `PS1=\\u@${name}:\\w\\$ `,  // custom prompt shows session name
        containerName,
        "bash", "--login",
    ], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.cwd(),
        env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            FORCE_COLOR: "3",
        },
    });

    session.pid = ptyProcess.pid;
    session.status = "ready";

    // ── Output handling ───────────────────────────────────────────────────────

    ptyProcess.onData((data: string) => {
        session.lastOutputAt = Date.now();

        // Append to circular buffer
        const newLines = data.split("\n");
        session.outputBuffer.push(...newLines);
        if (session.outputBuffer.length > OUTPUT_BUFFER_LINES) {
            session.outputBuffer = session.outputBuffer.slice(
                -OUTPUT_BUFFER_LINES
            );
        }

        const chunk: OutputChunk = {
            data,
            timestamp: Date.now(),
            sessionId,
        };
        emitter.emit("data", chunk);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(
            `[PersistentTerminal] Session exited: ${sessionId} ` +
            `(code=${exitCode}, signal=${signal})`
        );
        session.status = "exited";
        emitter.emit("exit", { exitCode, signal });
        sessions.delete(sessionId);
    });

    sessions.set(sessionId, { session, pty: ptyProcess, emitter });

    // Run initial command if provided
    if (command) {
        // Small delay so bash prompt is ready
        await new Promise(r => setTimeout(r, 200));
        ptyProcess.write(command + "\r");
        session.status = "busy";
    }

    console.log(
        `[PersistentTerminal] Started: ${sessionId} ` +
        `(pid=${ptyProcess.pid})`
    );

    return session;
}

// ── Send input to session ─────────────────────────────────────────────────────

export function sendToSession(
    workspaceId: string,
    name: string,
    input: string,
): void {
    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) throw new Error(`Session "${name}" not found.`);
    if (entry.session.status === "exited") {
        throw new Error(`Session "${name}" has exited.`);
    }
    entry.pty.write(input.endsWith("\r") ? input : input + "\r");
}

// ── Run command and wait for output ──────────────────────────────────────────
// Sends a command to a session and collects output until a sentinel marker
// appears or timeout is reached.

export async function runInSession(
    workspaceId: string,
    name: string,
    command: string,
    opts: {
        timeoutMs?: number;
        onChunk?: (data: string) => void;
    } = {},
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
    const { timeoutMs = 60_000, onChunk } = opts;

    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) throw new Error(`Session "${name}" not found.`);

    // Use a unique sentinel to detect command completion
    const sentinel = `__CMD_DONE_${Date.now()}__`;
    const fullCmd = `${command}; echo "${sentinel}:$?"`;

    let output = "";
    let exitCode: number | null = null;
    let timedOut = false;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            timedOut = true;
            cleanup();
            resolve({ output: output.trim(), exitCode: null, timedOut: true });
        }, timeoutMs);

        const onData = (chunk: OutputChunk) => {
            const data = chunk.data;
            output += data;
            onChunk?.(data);

            // Check for sentinel
            const sentinelIdx = output.indexOf(sentinel);
            if (sentinelIdx !== -1) {
                // Extract exit code from "sentinel:N"
                const after = output.slice(sentinelIdx + sentinel.length);
                const codeMatch = after.match(/:(\d+)/);
                exitCode = codeMatch ? parseInt(codeMatch[1], 10) : null;

                // Clean output: remove the command echo + sentinel line
                const cleanOutput = output
                    .slice(0, sentinelIdx)
                    .replace(new RegExp(fullCmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "")
                    .trim();

                cleanup();
                resolve({ output: cleanOutput, exitCode, timedOut: false });
            }
        };

        const cleanup = () => {
            clearTimeout(timer);
            entry.emitter.off("data", onData);
            entry.session.status = "ready";
        };

        entry.session.status = "busy";
        entry.emitter.on("data", onData);
        entry.pty.write(fullCmd + "\r");
    });
}

// ── Read session output buffer ────────────────────────────────────────────────
// Returns recent output without sending a command.
// Used to check dev server logs, test output, etc.

export function readSessionOutput(
    workspaceId: string,
    name: string,
    lines: number = 50,
): string {
    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) throw new Error(`Session "${name}" not found.`);
    return entry.session.outputBuffer.slice(-lines).join("\n");
}

// ── Subscribe to session output ───────────────────────────────────────────────
// Returns unsubscribe function.

export function subscribeToSession(
    workspaceId: string,
    name: string,
    onChunk: (chunk: OutputChunk) => void,
    onExit?: (code: number | null) => void,
): () => void {
    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) throw new Error(`Session "${name}" not found.`);

    entry.emitter.on("data", onChunk);
    if (onExit) entry.emitter.once("exit", onExit);

    return () => {
        entry.emitter.off("data", onChunk);
        if (onExit) entry.emitter.off("exit", onExit);
    };
}

// ── Kill session ──────────────────────────────────────────────────────────────

export async function killSession(
    workspaceId: string,
    name: string,
): Promise<void> {
    const sessionId = makeSessionId(workspaceId, name);
    const entry = sessions.get(sessionId);
    if (!entry) return;

    try {
        entry.pty.kill();
    } catch { }

    sessions.delete(sessionId);
    console.log(`[PersistentTerminal] Killed: ${sessionId}`);
}

// ── List sessions ─────────────────────────────────────────────────────────────

export function listSessions(workspaceId: string): PersistentSession[] {
    return Array.from(sessions.values())
        .filter(e => e.session.workspaceId === workspaceId)
        .map(e => e.session);
}

// ── Resize session ────────────────────────────────────────────────────────────

export function resizeSession(
    workspaceId: string,
    name: string,
    cols: number,
    rows: number,
): void {
    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) return;
    entry.pty.resize(cols, rows);
}

// ── Kill all sessions for a workspace ────────────────────────────────────────
// Called when workspace is closed.

export async function killAllSessions(workspaceId: string): Promise<void> {
    const toKill = listSessions(workspaceId).map(s => s.name);
    for (const name of toKill) {
        await killSession(workspaceId, name);
    }
}

// ── Attach user terminal to persistent session ────────────────────────────────
// Called when user opens the terminal panel and picks a named session.
// Returns unsubscribe function + sends existing buffer to ws.

export function attachUserToSession(
    workspaceId: string,
    name: string,
    sendToUser: (data: string) => void,
): {
    send: (input: string) => void;
    resize: (cols: number, rows: number) => void;
    detach: () => void;
    history: string;
} {
    const entry = sessions.get(makeSessionId(workspaceId, name));
    if (!entry) throw new Error(`Session "${name}" not found.`);

    const onChunk = (chunk: OutputChunk) => sendToUser(chunk.data);
    entry.emitter.on("data", onChunk);

    return {
        // Replay buffer so user sees what they missed
        history: entry.session.outputBuffer.join(""),
        send: (input) => entry.pty.write(input),
        resize: (cols, rows) => entry.pty.resize(cols, rows),
        detach: () => entry.emitter.off("data", onChunk),
    };
}

// ── Idle cleanup ──────────────────────────────────────────────────────────────

export function cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [id, entry] of sessions.entries()) {
        const idle = now - entry.session.lastOutputAt;
        if (idle > SESSION_IDLE_TIMEOUT_MS) {
            console.log(`[PersistentTerminal] Idle timeout: ${id}`);
            entry.pty.kill();
            sessions.delete(id);
        }
    }
}