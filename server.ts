// // server.ts  (project root — replaces `next dev` / `next start`)
// // Single entry point that:
// //   1. Starts Next.js (handles all HTTP + API routes)
// //   2. Attaches WebSocket server on same port (terminal PTY)
// //   3. Runs background loops (idle container cleanup, auto-save)
// //   4. Verifies Docker + dependencies on startup
// //
// // Run with:  npx tsx server.ts
// // Or add to package.json scripts: "dev": "tsx server.ts"

// import { createServer } from "http";
// import { parse } from "url";
// import next from "next";
// import { createTerminalWSS } from "./src/server/sandbox/terminal-server";
// import { verifyDocker, stopIdleContainers } from "./src/server/sandbox/sandbox-manager";
// import { startAutoSaveLoop } from "./src/server/workspace/auto-save";

// const dev = process.env.NODE_ENV !== "production";
// const port = parseInt(process.env.PORT ?? "3000", 10);

// async function main() {
//     console.log(`\n🚀 Starting Web IDE Server (${dev ? "development" : "production"})\n`);

//     // ── Step 1: Verify Docker is running and image exists ─────────────────────
//     try {
//         await verifyDocker();
//     } catch (err: any) {
//         console.error(`\n${err.message}\n`);
//         process.exit(1);
//     }

//     // ── Step 2: Prepare Next.js ───────────────────────────────────────────────
//     const app = next({ dev });
//     const handle = app.getRequestHandler();
//     await app.prepare();
//     console.log("[Next.js] Ready ✓");

//     // ── Step 3: Create HTTP server ────────────────────────────────────────────
//     const httpServer = createServer((req, res) => {
//         const parsedUrl = parse(req.url ?? "", true);
//         handle(req, res, parsedUrl);
//     });

//     // ── Step 4: Attach WebSocket server for terminal PTY ─────────────────────
//     const wss = createTerminalWSS(httpServer);
//     console.log(`[Terminal] WebSocket server attached at /ws/terminal ✓`);

//     // ── Step 5: Start background loops ───────────────────────────────────────

//     // Stop idle containers every 5 minutes
//     setInterval(async () => {
//         try {
//             await stopIdleContainers();
//         } catch (err: any) {
//             console.error("[Idle cleanup] Error:", err.message);
//         }
//     }, 5 * 60 * 1000);

//     // Auto-save loop (git commit dirty workspaces every 60s)
//     startAutoSaveLoop();

//     // ── Step 6: Start listening ───────────────────────────────────────────────
//     httpServer.listen(port, () => {
//         console.log(`\nWeb IDE running at http://localhost:${port}`);
//         console.log(`   Terminal WS:  ws://localhost:${port}/ws/terminal`);
//         console.log(`   Next.js API:  http://localhost:${port}/api\n`);
//     });

//     // ── Graceful shutdown ─────────────────────────────────────────────────────
//     const shutdown = async (signal: string) => {
//         console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

//         // Close WebSocket server (stops new connections)
//         wss.close(() => {
//             console.log("[Terminal] WebSocket server closed");
//         });

//         // Give auto-save 10 seconds to flush pending commits
//         await new Promise(res => setTimeout(res, 3000));

//         console.log("[Server] Goodbye.\n");
//         process.exit(0);
//     };

//     process.on("SIGTERM", () => shutdown("SIGTERM"));
//     process.on("SIGINT", () => shutdown("SIGINT"));

//     // Catch unhandled errors — log but don't crash the server
//     process.on("uncaughtException", (err) => {
//         console.error("[Server] Uncaught exception:", err);
//     });
//     process.on("unhandledRejection", (reason) => {
//         console.error("[Server] Unhandled rejection:", reason);
//     });
// }

// main().catch((err) => {
//     console.error("Failed to start server:", err);
//     process.exit(1);
// });


// server.ts — replace the current file entirely

// import { createServer } from "http";
// import { parse } from "url";
// import next from "next";
// import { WebSocketServer } from "ws";
// import { createTerminalWSS } from "./src/server/sandbox/terminal-server";
// import {
//     verifyDocker,
//     stopIdleContainers,
// } from "./src/server/sandbox/sandbox-manager";
// import { startAutoSaveLoop } from "./src/server/workspace/auto-save";

// const dev = process.env.NODE_ENV !== "production";
// const port = parseInt(process.env.PORT ?? "3000", 10);

// async function main() {
//     console.log(`\n🚀 Starting Web IDE Server (${dev ? "development" : "production"})\n`);

//     await verifyDocker();

//     const app = next({ dev });
//     const handle = app.getRequestHandler();
//     await app.prepare();
//     console.log("[Next.js] Ready ✓");

//     const httpServer = createServer((req, res) => {
//         const parsedUrl = parse(req.url ?? "", true);
//         handle(req, res, parsedUrl);
//     });

//     // ── Key fix: manually route WebSocket upgrade events ──────────────────────
//     // Next.js HMR uses path starting with /_next/webpack-hmr
//     // Our terminal uses /ws/terminal
//     // Without this separation both servers fight over every upgrade event
//     // causing HMR to break and hard reloads every few seconds

//     const terminalWss = new WebSocketServer({ noServer: true });

//     // Wire terminal handlers onto the noServer WSS
//     createTerminalWSS(httpServer, terminalWss);

//     httpServer.on("upgrade", (req, socket, head) => {
//         const { pathname } = parse(req.url ?? "");

//         if (pathname === "/ws/terminal") {
//             // Our terminal PTY server handles this
//             terminalWss.handleUpgrade(req, socket, head, (ws) => {
//                 terminalWss.emit("connection", ws, req);
//             });
//         }
//         // All other upgrade requests (/_next/webpack-hmr, etc.)
//         // are left alone — Next.js internal handler picks them up
//     });

//     setInterval(async () => {
//         try { await stopIdleContainers(); }
//         catch (err: any) { console.error("[Idle cleanup]", err.message); }
//     }, 5 * 60 * 1000);

//     startAutoSaveLoop();

//     httpServer.listen(port, () => {
//         console.log(`\n✅ Web IDE running at http://localhost:${port}`);
//         console.log(`   Terminal WS: ws://localhost:${port}/ws/terminal\n`);
//     });

//     const shutdown = async (signal: string) => {
//         console.log(`\n[Server] ${signal} — shutting down...`);
//         await new Promise<void>((res) => httpServer.close(() => res()));
//         process.exit(0);
//     };

//     process.on("SIGTERM", () => shutdown("SIGTERM"));
//     process.on("SIGINT", () => shutdown("SIGINT"));
//     process.on("uncaughtException", (err) => console.error("[Server] Uncaught:", err));
//     process.on("unhandledRejection", (reason) => console.error("[Server] Rejection:", reason));
// }

// main().catch((err) => {
//     console.error("Failed to start:", err);
//     process.exit(1);
// }); 


// server.ts — add watcher bridge init

// import { createServer } from "http";
// import { parse } from "url";
// import next from "next";
// import { WebSocketServer } from "ws";
// import { createTerminalWSS } from "./src/server/sandbox/terminal-server";
// import {
//     verifyDocker,
//     stopIdleContainers,
// } from "./src/server/sandbox/sandbox-manager";
// import { startAutoSaveLoop } from "./src/server/workspace/auto-save";
// // import { initWatcherBridge } from "./src/server/workspace/watcher-bridge";
// import { cleanupIdleSessions, killAllSessions }
//     from "./src/server/sandbox/persistent-terminal-manager";

// const dev = process.env.NODE_ENV !== "production";
// const port = parseInt(process.env.PORT ?? "3000", 10);

// async function main() {
//     console.log(`\n🚀 Starting Web IDE Server (${dev ? "development" : "production"})\n`);

//     await verifyDocker();

//     // ── Initialize watcher bridge BEFORE Next.js ──────────────────────────────
//     // Must run before any workspace is provisioned
//     // initWatcherBridge();

//     const app = next({ dev });
//     const handle = app.getRequestHandler();
//     await app.prepare();
//     console.log("[Next.js] Ready ✓");

//     const httpServer = createServer((req, res) => {
//         const parsedUrl = parse(req.url ?? "", true);
//         handle(req, res, parsedUrl);
//     });

//     const terminalWss = new WebSocketServer({ noServer: true });
//     createTerminalWSS(httpServer, terminalWss);

//     httpServer.on("upgrade", (req, socket, head) => {
//         const { pathname } = parse(req.url ?? "");
//         if (pathname === "/ws/terminal") {
//             terminalWss.handleUpgrade(req, socket, head, (ws) => {
//                 terminalWss.emit("connection", ws, req);
//             });
//         }
//     });

//     setInterval(async () => {
//         try { await stopIdleContainers(); }
//         catch (err: any) { console.error("[Idle cleanup]", err.message); }
//     }, 5 * 60 * 1000);

//     setInterval(() => {
//         try { cleanupIdleSessions(); }
//         catch (err: any) { console.error("[PersistentTerminal] Cleanup error:", err.message); }
//     }, 5 * 60 * 1000);

//     startAutoSaveLoop();

//     httpServer.listen(port, () => {
//         console.log(`\n✅ Web IDE running at http://localhost:${port}`);
//         console.log(`   Terminal WS: ws://localhost:${port}/ws/terminal\n`);
//     });

//     const shutdown = async (signal: string) => {
//         console.log(`\n[Server] ${signal} — shutting down...`);
//         await new Promise<void>((res) => httpServer.close(() => res()));
//         process.exit(0);
//     };

//     process.on("SIGTERM", () => shutdown("SIGTERM"));
//     process.on("SIGINT", () => shutdown("SIGINT"));
//     process.on("uncaughtException", (err) => console.error("[Server] Uncaught:", err));
//     process.on("unhandledRejection", (reason) => console.error("[Server] Rejection:", reason));
// }

// main().catch((err) => {
//     console.error("Failed to start:", err);
//     process.exit(1);
// });



// server.ts — add LSP WSS alongside terminal WSS

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { createTerminalWSS } from "./src/server/sandbox/terminal-server";
import { createLspWSS } from "./src/server/lsp/lsp-wss";       // ← NEW
import { cleanupIdleLspServers } from "./src/server/lsp/lsp-manager";   // ← NEW
import {
    verifyDocker,
    stopIdleContainers,
} from "./src/server/sandbox/sandbox-manager";
import { startAutoSaveLoop } from "./src/server/workspace/auto-save";
import { cleanupIdleSessions }
    from "./src/server/sandbox/persistent-terminal-manager";
import { cleanupIdleSessions as cleanupPlaywrightSessions, shutdown as shutdownPlaywright }
    from "./src/server/playwright/playwright-manager";
const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
    console.log(`\n🚀 Starting Ayndrome IDE Server (${dev ? "dev" : "prod"})\n`);

    await verifyDocker();

    const app = next({ dev });
    const handle = app.getRequestHandler();
    await app.prepare();
    console.log("[Next.js] Ready ✓");

    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url ?? "", true);
        handle(req, res, parsedUrl);
    });

    // ── WebSocket servers ─────────────────────────────────────────────────────
    const terminalWss = new WebSocketServer({ noServer: true });
    const lspWss = new WebSocketServer({ noServer: true });   // ← NEW

    createTerminalWSS(httpServer, terminalWss);
    createLspWSS(httpServer, lspWss);                              // ← NEW

    httpServer.on("upgrade", (req, socket, head) => {
        const { pathname } = parse(req.url ?? "");

        if (pathname === "/ws/terminal") {
            terminalWss.handleUpgrade(req, socket, head, (ws) => {
                terminalWss.emit("connection", ws, req);
            });
        } else if (pathname === "/ws/lsp") {                       // ← NEW
            lspWss.handleUpgrade(req, socket, head, (ws) => {
                lspWss.emit("connection", ws, req);
            });
        }
    });

    // ── Cleanup intervals ─────────────────────────────────────────────────────
    setInterval(async () => {
        try { await stopIdleContainers(); }
        catch (err: any) { console.error("[Idle cleanup]", err.message); }
    }, 5 * 60 * 1000);

    setInterval(() => {
        try { cleanupIdleSessions(); }
        catch (err: any) { console.error("[PersistentTerminal]", err.message); }
    }, 5 * 60 * 1000);

    setInterval(() => {                                            // ← NEW
        try { cleanupIdleLspServers(); }
        catch (err: any) { console.error("[LSP cleanup]", err.message); }
    }, 15 * 60 * 1000);

    setInterval(async () => {
        try { await cleanupPlaywrightSessions(); }
        catch (err: any) { console.error("[Playwright] Cleanup error:", err.message); }
    }, 10 * 60 * 1000);

    startAutoSaveLoop();

    httpServer.listen(port, () => {
        console.log(`\n✅ Ayndrome IDE running at http://localhost:${port}`);
        console.log(`   Terminal WS : ws://localhost:${port}/ws/terminal`);
        console.log(`   LSP WS      : ws://localhost:${port}/ws/lsp\n`);
    });

    const shutdown = async (signal: string) => {
        console.log(`\n[Server] ${signal} — shutting down...`);
        await shutdownPlaywright();
        await new Promise<void>((res) => httpServer.close(() => res()));
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("uncaughtException", (err) => console.error("[Server] Uncaught:", err));
    process.on("unhandledRejection", (r) => console.error("[Server] Rejection:", r));
}

main().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
});