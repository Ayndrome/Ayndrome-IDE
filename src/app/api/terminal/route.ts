// src/app/api/terminal/route.ts
// REST endpoint for agent tool calls — non-interactive exec.
// This is separate from the WebSocket PTY server (which is for user terminal).
// The agent calls this via chat-tools.ts run_terminal implementation.
// Returns full output + exitCode when command finishes.

import { NextRequest, NextResponse } from "next/server";
import { execInSandbox } from "@/src/server/sandbox/sandbox-manager";

// Streaming output via Server-Sent Events
// The agent's onStdout callback pushes chunks here in real time
// so the ToolCard UI updates as the command runs

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            workspaceId,
            command,
            cwd,
            stream = false,
        } = body as {
            workspaceId: string;
            command: string;
            cwd?: string;
            stream?: boolean;
        };

        if (!workspaceId || !command) {
            return NextResponse.json(
                { error: "workspaceId and command required" },
                { status: 400 }
            );
        }

        // ── Streaming response (for live ToolCard output) ──────────────────────
        if (stream) {
            const encoder = new TextEncoder();

            const readable = new ReadableStream({
                async start(controller) {
                    const sendChunk = (chunk: string) => {
                        const data = JSON.stringify({ type: "chunk", data: chunk });
                        controller.enqueue(
                            encoder.encode(`data: ${data}\n\n`)
                        );
                    };

                    try {
                        const result = await execInSandbox(
                            workspaceId,
                            command,
                            {
                                cwd,
                                timeoutMs: 120_000, // 2min for long commands
                                onStdout: sendChunk,
                                onStderr: sendChunk,
                            }
                        );

                        // Send final result
                        const done = JSON.stringify({
                            type: "done",
                            exitCode: result.exitCode,
                            timedOut: result.timedOut,
                        });
                        controller.enqueue(encoder.encode(`data: ${done}\n\n`));

                    } catch (err: any) {
                        const error = JSON.stringify({
                            type: "error",
                            message: err.message,
                        });
                        controller.enqueue(encoder.encode(`data: ${error}\n\n`));
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

        // ── Non-streaming (wait for completion) ────────────────────────────────
        const result = await execInSandbox(workspaceId, command, {
            cwd,
            timeoutMs: 60_000,
        });

        return NextResponse.json(result);

    } catch (err: any) {
        console.error(`[API/terminal] Error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}