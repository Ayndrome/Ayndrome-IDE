// src/server/lsp/lsp-manager.ts
// Manages one LSP server process per workspace per language.
// LSP servers run inside the Docker container via docker exec.
// Each process communicates via stdio — we pipe that through WebSocket.

import { ChildProcess, spawn } from "child_process";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LspLanguage = "typescript" | "python";

type LspEntry = {
    process: ChildProcess;
    workspaceId: string;
    language: LspLanguage;
    startedAt: number;
    // Listeners waiting for data from LSP stdout
    listeners: Set<(data: Buffer) => void>;
};

// ── Registry ──────────────────────────────────────────────────────────────────

// key: `${workspaceId}:${language}`
const lspProcesses = new Map<string, LspEntry>();

function lspKey(workspaceId: string, language: LspLanguage): string {
    return `${workspaceId}:${language}`;
}

// ── LSP command per language ──────────────────────────────────────────────────

function getLspCommand(language: LspLanguage): string[] {
    switch (language) {
        case "typescript":
            return ["typescript-language-server", "--stdio"];
        case "python":
            return ["pyright-langserver", "--stdio"];
    }
}

// ── Start LSP server ──────────────────────────────────────────────────────────

export async function startLspServer(
    workspaceId: string,
    language: LspLanguage,
): Promise<LspEntry> {
    const key = lspKey(workspaceId, language);
    const existing = lspProcesses.get(key);

    if (existing && existing.process.exitCode === null) {
        return existing;
    }

    const containerName = `web-ide-${workspaceId}`;
    const lspCmd = getLspCommand(language);

    console.log(`[LSP] Starting ${language} server for ${workspaceId}`);

    // Run LSP server inside the container via docker exec
    const proc = spawn("docker", [
        "exec", "-i",
        "-w", "/workspace",
        containerName,
        ...lspCmd,
    ], {
        stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stderr?.on("data", (d) =>
        console.error(`[LSP:${language}:${workspaceId}]`, d.toString().trim())
    );

    proc.on("exit", (code) => {
        console.log(`[LSP] ${language} exited (${code}) for ${workspaceId}`);
        lspProcesses.delete(key);
    });

    const entry: LspEntry = {
        process: proc,
        workspaceId,
        language,
        startedAt: Date.now(),
        listeners: new Set(),
    };

    // Broadcast stdout to all registered WS listeners
    proc.stdout?.on("data", (data: Buffer) => {
        for (const listener of entry.listeners) {
            listener(data);
        }
    });

    lspProcesses.set(key, entry);
    return entry;
}

// ── Get existing LSP entry ────────────────────────────────────────────────────

export function getLspEntry(
    workspaceId: string,
    language: LspLanguage,
): LspEntry | undefined {
    return lspProcesses.get(lspKey(workspaceId, language));
}

// ── Write to LSP stdin (client → LSP) ────────────────────────────────────────

export function writeLspMessage(
    workspaceId: string,
    language: LspLanguage,
    data: Buffer | string,
): void {
    const entry = lspProcesses.get(lspKey(workspaceId, language));
    if (!entry || entry.process.exitCode !== null) {
        console.warn(`[LSP] No active ${language} process for ${workspaceId}`);
        return;
    }
    entry.process.stdin?.write(data);
}

// ── Register / unregister WebSocket data listeners ───────────────────────────

export function addLspListener(
    workspaceId: string,
    language: LspLanguage,
    listener: (data: Buffer) => void,
): void {
    const entry = lspProcesses.get(lspKey(workspaceId, language));
    if (entry) entry.listeners.add(listener);
}

export function removeLspListener(
    workspaceId: string,
    language: LspLanguage,
    listener: (data: Buffer) => void,
): void {
    const entry = lspProcesses.get(lspKey(workspaceId, language));
    if (entry) entry.listeners.delete(listener);
}

// ── Kill LSP server ───────────────────────────────────────────────────────────

export function killLspServer(
    workspaceId: string,
    language: LspLanguage,
): void {
    const key = lspKey(workspaceId, language);
    const entry = lspProcesses.get(key);
    if (entry) {
        entry.process.kill();
        lspProcesses.delete(key);
        console.log(`[LSP] Killed ${language} for ${workspaceId}`);
    }
}

export function killAllLspServers(workspaceId: string): void {
    for (const lang of ["typescript", "python"] as LspLanguage[]) {
        killLspServer(workspaceId, lang);
    }
}

// ── Idle cleanup ──────────────────────────────────────────────────────────────

export function cleanupIdleLspServers(): void {
    const IDLE_MS = 30 * 60 * 1000;
    const now = Date.now();
    for (const [key, entry] of lspProcesses.entries()) {
        if (now - entry.startedAt > IDLE_MS) {
            entry.process.kill();
            lspProcesses.delete(key);
            console.log(`[LSP] Idle cleanup: ${key}`);
        }
    }
}