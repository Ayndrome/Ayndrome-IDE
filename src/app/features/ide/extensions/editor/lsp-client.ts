// src/app/features/ide/extensions/editor/lsp-client.ts
// Manages the WebSocket connection to the LSP bridge.
// Handles JSON-RPC framing (Content-Length headers).
// One instance per editor per language.

export type LspNotificationHandler = (method: string, params: any) => void;

type PendingRequest = {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
};

export class LspClient {
    private ws: WebSocket | null = null;
    private msgId: number = 1;
    private pending: Map<number, PendingRequest> = new Map();
    private handlers: LspNotificationHandler[] = [];
    private buffer: string = "";
    private ready: boolean = false;
    private queue: string[] = [];   // messages queued before ready

    constructor(
        private workspaceId: string,
        private language: "typescript" | "python",
        private rootUri: string,
    ) { }

    // ── Connect ───────────────────────────────────────────────────────────────

    connect(): void {
        const url = `ws://localhost:3000/ws/lsp?workspaceId=${this.workspaceId}&language=${this.language}`;
        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log(`[LSP:Client] Connected (${this.language})`);
        };

        this.ws.onmessage = (event) => {
            // Server may send our ready signal as JSON
            if (typeof event.data === "string") {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.__ayndrome_lsp_ready) {
                        this._onReady();
                        return;
                    }
                } catch { }
                this._processRawData(event.data);
            } else {
                // Binary — convert to string
                const text = new TextDecoder().decode(event.data as ArrayBuffer);
                this._processRawData(text);
            }
        };

        this.ws.onclose = () => {
            console.log(`[LSP:Client] Disconnected (${this.language})`);
            this.ready = false;
        };

        this.ws.onerror = (err) => {
            console.error(`[LSP:Client] Error:`, err);
        };
    }

    // ── Ready — send initialize + queued messages ─────────────────────────────

    private _onReady(): void {
        this._sendInitialize();
    }

    private _sendInitialize(): void {
        this._sendRequest("initialize", {
            processId: null,
            rootUri: this.rootUri,
            capabilities: {
                textDocument: {
                    hover: {
                        contentFormat: ["markdown", "plaintext"],
                    },
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            resolveSupport: { properties: ["documentation", "detail"] },
                            documentationFormat: ["markdown", "plaintext"],
                        },
                    },
                    definition: { linkSupport: false },
                    publishDiagnostics: { relatedInformation: true },
                    signatureHelp: {
                        signatureInformation: {
                            documentationFormat: ["markdown", "plaintext"],
                        },
                    },
                },
                workspace: {
                    workspaceFolders: true,
                },
            },
            workspaceFolders: [{
                uri: this.rootUri,
                name: "workspace",
            }],
        }).then(() => {
            this._sendNotification("initialized", {});
            this.ready = true;
            // Flush queued messages
            for (const msg of this.queue) {
                this.ws?.send(msg);
            }
            this.queue = [];
        }).catch((err) => {
            console.error("[LSP] Initialize failed:", err);
        });
    }

    // ── JSON-RPC framing ──────────────────────────────────────────────────────
    // LSP uses: "Content-Length: N\r\n\r\n{json}"

    private _frame(body: string): string {
        return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
    }

    private _processRawData(data: string): void {
        this.buffer += data;

        while (true) {
            // Look for Content-Length header
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) break;

            const header = this.buffer.slice(0, headerEnd);
            const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!lengthMatch) {
                // Malformed — skip past this
                this.buffer = this.buffer.slice(headerEnd + 4);
                continue;
            }

            const length = parseInt(lengthMatch[1], 10);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + length;

            if (this.buffer.length < bodyEnd) break; // need more data

            const body = this.buffer.slice(bodyStart, bodyEnd);
            this.buffer = this.buffer.slice(bodyEnd);

            try {
                this._handleMessage(JSON.parse(body));
            } catch (err) {
                console.error("[LSP] Failed to parse message:", err);
            }
        }
    }

    private _handleMessage(msg: any): void {
        if (msg.id != null && this.pending.has(msg.id)) {
            // Response to our request
            const { resolve, reject } = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) {
                reject(new Error(msg.error.message));
            } else {
                resolve(msg.result);
            }
        } else if (msg.method) {
            // Notification or server-initiated request
            for (const handler of this.handlers) {
                handler(msg.method, msg.params);
            }
        }
    }

    // ── Send helpers ──────────────────────────────────────────────────────────

    private _sendRaw(msg: string): void {
        const framed = this._frame(msg);
        if (!this.ready && !msg.includes('"initialize"')) {
            this.queue.push(framed);
            return;
        }
        this.ws?.send(framed);
    }

    _sendRequest(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.msgId++;
            this.pending.set(id, { resolve, reject });
            this._sendRaw(JSON.stringify({ jsonrpc: "2.0", id, method, params }));

            // Timeout after 10s
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`LSP request timeout: ${method}`));
                }
            }, 10_000);
        });
    }

    _sendNotification(method: string, params: any): void {
        this._sendRaw(JSON.stringify({ jsonrpc: "2.0", method, params }));
    }

    // ── LSP document sync ─────────────────────────────────────────────────────

    didOpen(uri: string, languageId: string, text: string, version = 1): void {
        this._sendNotification("textDocument/didOpen", {
            textDocument: { uri, languageId, version, text },
        });
    }

    didChange(uri: string, text: string, version: number): void {
        this._sendNotification("textDocument/didChange", {
            textDocument: { uri, version },
            contentChanges: [{ text }],
        });
    }

    didClose(uri: string): void {
        this._sendNotification("textDocument/didClose", {
            textDocument: { uri },
        });
    }

    // ── LSP requests ──────────────────────────────────────────────────────────

    hover(uri: string, line: number, character: number): Promise<any> {
        return this._sendRequest("textDocument/hover", {
            textDocument: { uri },
            position: { line, character },
        });
    }

    completion(uri: string, line: number, character: number): Promise<any> {
        return this._sendRequest("textDocument/completion", {
            textDocument: { uri },
            position: { line, character },
            context: { triggerKind: 1 },
        });
    }

    definition(uri: string, line: number, character: number): Promise<any> {
        return this._sendRequest("textDocument/definition", {
            textDocument: { uri },
            position: { line, character },
        });
    }

    signatureHelp(uri: string, line: number, character: number): Promise<any> {
        return this._sendRequest("textDocument/signatureHelp", {
            textDocument: { uri },
            position: { line, character },
        });
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    onNotification(handler: LspNotificationHandler): () => void {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose(): void {
        this._sendNotification("exit", {});
        this.ws?.close();
        this.ws = null;
        this.pending.clear();
        this.handlers = [];
    }

    isReady(): boolean { return this.ready; }
}

// ── Singleton registry ────────────────────────────────────────────────────────
// One LspClient per workspaceId+language — shared across editor tabs

const clients = new Map<string, LspClient>();

export function getLspClient(
    workspaceId: string,
    language: "typescript" | "python",
    rootUri: string,
): LspClient {
    const key = `${workspaceId}:${language}`;
    const existing = clients.get(key);
    if (existing?.isReady() || existing) return existing;

    const client = new LspClient(workspaceId, language, rootUri);
    client.connect();
    clients.set(key, client);
    return client;
}

export function disposeLspClient(
    workspaceId: string,
    language: "typescript" | "python",
): void {
    const key = `${workspaceId}:${language}`;
    clients.get(key)?.dispose();
    clients.delete(key);
}

// ── File URI helpers ──────────────────────────────────────────────────────────

export function toFileUri(relativePath: string): string {
    return `file:///workspace/${relativePath.replace(/^\//, "")}`;
}

export function fromFileUri(uri: string): string {
    return uri.replace("file:///workspace/", "");
}

export function languageFromPath(filePath: string): "typescript" | "python" | null {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext ?? "")) return "typescript";
    if (["py", "pyi"].includes(ext ?? "")) return "python";
    return null;
}