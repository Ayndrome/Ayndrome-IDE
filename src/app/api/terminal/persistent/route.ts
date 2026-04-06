// REST + SSE API for persistent terminal sessions.
// GET  ?action=list              → list sessions
// GET  ?action=read              → read buffer
// POST ?action=start             → start session
// POST ?action=run               → run command, stream output via SSE
// POST ?action=send              → send raw input
// POST ?action=kill              → kill session

import { NextRequest, NextResponse } from "next/server";
import {
    startPersistentSession,
    runInSession,
    sendToSession,
    killSession,
    listSessions,
    readSessionOutput,
} from "@/src/server/sandbox/persistent-terminal-manager";

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "list";
    const wid = url.searchParams.get("workspaceId");
    const name = url.searchParams.get("name");

    if (!wid) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

    if (action === "list") {
        return NextResponse.json({ sessions: listSessions(wid) });
    }

    if (action === "read") {
        if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
        try {
            const lines = parseInt(url.searchParams.get("lines") ?? "50", 10);
            const output = readSessionOutput(wid, name, lines);
            return NextResponse.json({ output });
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "run";

    try {
        const body = await req.json();
        const { workspaceId, name, command, input } = body as {
            workspaceId: string;
            name: string;
            command?: string;
            input?: string;
        };

        if (!workspaceId || !name) {
            return NextResponse.json(
                { error: "workspaceId and name required" },
                { status: 400 }
            );
        }

        // ── start ─────────────────────────────────────────────────────────────
        if (action === "start") {
            const session = await startPersistentSession(
                workspaceId, name, command
            );
            return NextResponse.json({ session });
        }

        // ── run (stream output via SSE) ───────────────────────────────────────
        if (action === "run") {
            if (!command) {
                return NextResponse.json({ error: "command required" }, { status: 400 });
            }

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                async start(controller) {
                    const send = (event: object) => {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
                        );
                    };

                    try {
                        const result = await runInSession(
                            workspaceId, name, command,
                            {
                                timeoutMs: 120_000,
                                onChunk: (data) => send({ type: "chunk", data }),
                            }
                        );
                        send({ type: "done", exitCode: result.exitCode, timedOut: result.timedOut });
                    } catch (err: any) {
                        send({ type: "error", message: err.message });
                    } finally {
                        controller.close();
                    }
                },
            });

            return new Response(readable, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            });
        }

        // ── send raw input ────────────────────────────────────────────────────
        if (action === "send") {
            if (!input) return NextResponse.json({ error: "input required" }, { status: 400 });
            sendToSession(workspaceId, name, input);
            return NextResponse.json({ success: true });
        }

        // ── kill ──────────────────────────────────────────────────────────────
        if (action === "kill") {
            await killSession(workspaceId, name);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    } catch (err: any) {
        console.error("[API/terminal/persistent] Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}