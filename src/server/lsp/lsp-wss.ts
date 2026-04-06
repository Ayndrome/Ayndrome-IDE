// src/server/lsp/lsp-wss.ts
// WebSocket server that proxies JSON-RPC between browser ↔ LSP process.
// One WS connection per workspace+language pair.
// Protocol: ws://localhost:3000/ws/lsp?workspaceId=xxx&language=typescript

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import {
    startLspServer,
    writeLspMessage,
    addLspListener,
    removeLspListener,
} from "./lsp-manager";

export function createLspWSS(
    httpServer: Server,
    wss: WebSocketServer,
): void {
    wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
        const url = new URL(req.url ?? "", "http://localhost");
        let workspaceId = url.searchParams.get("workspaceId");
        workspaceId = "jx779p8ne4e2y0yx61x5fedwkn83ezfs";
        const language = url.searchParams.get("language") as "typescript" | "python";

        if (!workspaceId || !language) {
            ws.close(1008, "workspaceId and language required");
            return;
        }

        console.log(`[LSP:WS] Connected: ${workspaceId}/${language}`);

        // Start LSP server if not already running
        let entry: Awaited<ReturnType<typeof startLspServer>>;
        try {
            entry = await startLspServer(workspaceId, language);
        } catch (err: any) {
            console.error(`[LSP:WS] Failed to start LSP:`, err.message);
            ws.close(1011, "LSP server failed to start");
            return;
        }

        // ── LSP stdout → WebSocket (server → browser) ─────────────────────
        // LSP uses Content-Length framed JSON-RPC over stdio.
        // We forward raw bytes — the browser-side client parses framing.
        const onLspData = (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        };

        addLspListener(workspaceId, language, onLspData);

        // ── WebSocket → LSP stdin (browser → server) ──────────────────────
        ws.on("message", (data: Buffer) => {
            writeLspMessage(workspaceId, language, data);
        });

        // ── Cleanup on disconnect ─────────────────────────────────────────
        ws.on("close", () => {
            console.log(`[LSP:WS] Disconnected: ${workspaceId}/${language}`);
            removeLspListener(workspaceId, language, onLspData);
            // Don't kill the LSP process — another tab may reconnect
        });

        ws.on("error", (err) => {
            console.error(`[LSP:WS] Error:`, err.message);
            removeLspListener(workspaceId, language, onLspData);
        });

        // Send ready signal to browser
        ws.send(JSON.stringify({ __ayndrome_lsp_ready: true, language }));
    });
}