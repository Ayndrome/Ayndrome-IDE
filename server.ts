// server.ts  (project root — replaces `next dev` / `next start`)
// Single entry point that:
//   1. Starts Next.js (handles all HTTP + API routes)
//   2. Attaches WebSocket server on same port (terminal PTY)
//   3. Runs background loops (idle container cleanup, auto-save)
//   4. Verifies Docker + dependencies on startup
//
// Run with:  npx tsx server.ts
// Or add to package.json scripts: "dev": "tsx server.ts"

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { createTerminalWSS } from "./src/server/sandbox/terminal-server";
import { verifyDocker, stopIdleContainers } from "./src/server/sandbox/sandbox-manager";
import { startAutoSaveLoop } from "./src/server/workspace/auto-save";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
    console.log(`\n🚀 Starting Web IDE Server (${dev ? "development" : "production"})\n`);

    // ── Step 1: Verify Docker is running and image exists ─────────────────────
    try {
        await verifyDocker();
    } catch (err: any) {
        console.error(`\n${err.message}\n`);
        process.exit(1);
    }

    // ── Step 2: Prepare Next.js ───────────────────────────────────────────────
    const app = next({ dev });
    const handle = app.getRequestHandler();
    await app.prepare();
    console.log("[Next.js] Ready ✓");

    // ── Step 3: Create HTTP server ────────────────────────────────────────────
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url ?? "", true);
        handle(req, res, parsedUrl);
    });

    // ── Step 4: Attach WebSocket server for terminal PTY ─────────────────────
    const wss = createTerminalWSS(httpServer);
    console.log(`[Terminal] WebSocket server attached at /ws/terminal ✓`);

    // ── Step 5: Start background loops ───────────────────────────────────────

    // Stop idle containers every 5 minutes
    setInterval(async () => {
        try {
            await stopIdleContainers();
        } catch (err: any) {
            console.error("[Idle cleanup] Error:", err.message);
        }
    }, 5 * 60 * 1000);

    // Auto-save loop (git commit dirty workspaces every 60s)
    startAutoSaveLoop();

    // ── Step 6: Start listening ───────────────────────────────────────────────
    httpServer.listen(port, () => {
        console.log(`\nWeb IDE running at http://localhost:${port}`);
        console.log(`   Terminal WS:  ws://localhost:${port}/ws/terminal`);
        console.log(`   Next.js API:  http://localhost:${port}/api\n`);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal: string) => {
        console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

        // Close WebSocket server (stops new connections)
        wss.close(() => {
            console.log("[Terminal] WebSocket server closed");
        });

        // Give auto-save 10 seconds to flush pending commits
        await new Promise(res => setTimeout(res, 3000));

        console.log("[Server] Goodbye.\n");
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Catch unhandled errors — log but don't crash the server
    process.on("uncaughtException", (err) => {
        console.error("[Server] Uncaught exception:", err);
    });
    process.on("unhandledRejection", (reason) => {
        console.error("[Server] Unhandled rejection:", reason);
    });
}

main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});