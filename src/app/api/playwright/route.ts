// src/app/api/playwright/route.ts
// REST API for all Playwright operations.
// Called by agent tools and the preview pane.

import { NextRequest, NextResponse } from "next/server";
import {
    takeScreenshot,
    capturePageState,
    runInteractionScript,
    runPlaywrightTests,
    waitUntilReady,
    detectPort,
    closeSession,
} from "@/src/server/playwright/playwright-manager";
import { requireAuth, checkRateLimit, rateLimitResponse }
    from "@/src/app/api/_middleware/auth";

export async function POST(req: NextRequest) {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult

    const url = new URL(req.url);
    const rl = checkRateLimit(authResult.userId, "/api/playwright");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

    try {
        const body = await req.json();
        const action = body.action as string;

        // ── screenshot ────────────────────────────────────────────────────────
        if (action === "screenshot") {
            const result = await takeScreenshot({
                workspaceId: body.workspaceId,
                url: body.url,
                fullPage: body.fullPage ?? false,
                viewport: body.viewport,
                waitFor: body.waitFor ?? "networkidle",
                selector: body.selector,
            });
            // Don't return filePath to client
            return NextResponse.json({
                base64: result.base64,
                width: result.width,
                height: result.height,
                url: result.url,
                timestamp: result.timestamp,
            });
        }

        // ── page state ────────────────────────────────────────────────────────
        if (action === "page_state") {
            const result = await capturePageState({
                workspaceId: body.workspaceId,
                url: body.url,
                viewport: body.viewport,
            });
            return NextResponse.json({
                screenshot: {
                    base64: result.screenshot.base64,
                    width: result.screenshot.width,
                    height: result.screenshot.height,
                    url: result.screenshot.url,
                    timestamp: result.screenshot.timestamp,
                },
                consoleErrors: result.consoleErrors,
                networkErrors: result.networkErrors,
                domSnapshot: result.domSnapshot,
                title: result.title,
                url: result.url,
            });
        }

        // ── interact ──────────────────────────────────────────────────────────
        if (action === "interact") {
            const result = await runInteractionScript({
                workspaceId: body.workspaceId,
                url: body.url,
                steps: body.steps,
                viewport: body.viewport,
                screenshotOnEachStep: body.screenshotOnEachStep ?? false,
            });
            return NextResponse.json(result);
        }

        // ── run tests (streaming) ─────────────────────────────────────────────
        if (action === "run_tests") {
            if (body.stream) {
                const encoder = new TextEncoder();
                const readable = new ReadableStream({
                    async start(controller) {
                        const send = (event: object) => {
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
                            );
                        };
                        try {
                            const result = await runPlaywrightTests({
                                workspaceId: body.workspaceId,
                                testFile: body.testFile,
                                pattern: body.pattern,
                                timeout: body.timeout,
                                onChunk: (chunk) => send({ type: "chunk", data: chunk }),
                            });
                            send({ type: "done", result });
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

            const result = await runPlaywrightTests({
                workspaceId: body.workspaceId,
                testFile: body.testFile,
                pattern: body.pattern,
                timeout: body.timeout,
            });
            return NextResponse.json(result);
        }

        // ── wait until ready ──────────────────────────────────────────────────
        if (action === "wait_ready") {
            const result = await waitUntilReady({
                url: body.url,
                timeoutMs: body.timeoutMs ?? 30_000,
                successStatus: body.successStatus ?? 200,
                pattern: body.pattern,
            });
            return NextResponse.json(result);
        }

        // ── close session ─────────────────────────────────────────────────────
        if (action === "close_session") {
            await closeSession(body.workspaceId);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    } catch (err: any) {
        console.error("[API/playwright] Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    // Proxy screenshot image for preview pane
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const targetUrl = url.searchParams.get("url") ?? "http://localhost:3000";

    if (!workspaceId) {
        return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    try {
        const result = await takeScreenshot({
            workspaceId,
            url: targetUrl,
            fullPage: url.searchParams.get("fullPage") === "true",
            waitFor: "networkidle",
        });

        const buf = Buffer.from(result.base64, "base64");
        return new Response(buf, {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "no-cache",
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}