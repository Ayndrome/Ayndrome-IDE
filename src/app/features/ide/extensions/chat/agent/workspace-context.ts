// src/app/features/ide/extensions/chat/agent/workspace-context.ts
// Phase 0-A: completely rewritten.
// Key changes:
//   1. Context injected ONCE as first user message, not every system prompt
//   2. Query-aware: only fetches what the intent actually needs
//   3. Redis-cached by content hash — zero cost on repeated calls
//   4. Token budget: hard cap 1000 tokens for context block
//   5. File tree = names only, depth 1 by default
//   6. Active file content (first 80 lines) injected for bug_fix/refactor

import { redis } from "@/src/lib/redis/redis";
import { classifyQuery, estimateTokens, type ContextNeeds } from "./query-classifier";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceSnapshot = {
    workspaceId: string;
    workspaceName: string;
    techStack: string | null;         // "Next.js 14, Tailwind, Prisma"
    fileTree: string | null;          // depth-1 names only
    packageJson: string | null;       // dependencies section only
    activeFilePath: string | null;
    activeFilePreview: string | null;  // first 80 lines for bug_fix/refactor
    gitBranch: string | null;
    gitDiff: string | null;           // --stat only, max 20 lines
    intent: string;
    tokenEstimate: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTEXT_TTL = 30;                // 30s cache — stays fresh during active dev
const MAX_CONTEXT_TOKENS = 1000;       // hard cap — ~3500 chars
const MAX_FILE_TREE_LINES = 40;        // depth-1 entries
const MAX_PKG_LINES = 30;             // dependencies section only
const MAX_DIFF_LINES = 20;            // --stat summary only
const ACTIVE_FILE_PREVIEW_LINES = 80; // first N lines for bug_fix/refactor

// ── Base URL helper ───────────────────────────────────────────────────────────
// Ensures fetch() works in both client-side and server-side contexts.

function getBaseUrl(): string {
    // Client-side: relative URLs work fine
    if (typeof window !== "undefined") return "";
    // Server-side: need absolute URL
    return process.env.NEXT_PUBLIC_BASE_URL
        || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
}

// ── Main: build context snapshot ─────────────────────────────────────────────

export async function fetchWorkspaceSnapshot(
    workspaceId: string,
    workspaceName: string,
    activeFilePath: string | null,
    openFilePaths: string[],
    userMessage: string = "",
): Promise<WorkspaceSnapshot> {
    const intent = classifyQuery(userMessage);
    const base = getBaseUrl();

    console.log(
        `[WorkspaceCtx] Intent: ${intent.intent} | ` +
        `needs: tree=${intent.needsFileTree}, pkg=${intent.needsPackageJson}, ` +
        `file=${intent.needsActiveFile}, diff=${intent.needsGitDiff}`
    );

    // ── Check Redis cache (keyed by workspaceId + intent) ──────────────────
    const cacheKey = `ws:${workspaceId}:ctx:${intent.intent}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        console.log(`[WorkspaceCtx] Cache hit for intent "${intent.intent}"`);
        return JSON.parse(cached) as WorkspaceSnapshot;
    }

    // ── Fetch only what intent needs (parallel) ────────────────────────────
    const [fileTree, packageJson, gitBranch, gitDiff, activeFilePreview] = await Promise.all([
        intent.needsFileTree
            ? fetchFileTree(base, workspaceId, intent.maxFileTreeDepth as 1 | 2)
            : Promise.resolve(null),

        intent.needsPackageJson
            ? fetchPackageJsonDeps(base, workspaceId)
            : Promise.resolve(null),

        fetchGitBranch(base, workspaceId),   // always fetch branch (tiny, free)

        intent.needsGitDiff
            ? fetchGitDiffStat(base, workspaceId)
            : Promise.resolve(null),

        // Inject active file content for bug_fix/refactor (saves a tool round-trip)
        (intent.needsActiveFile && activeFilePath)
            ? fetchActiveFilePreview(base, workspaceId, activeFilePath)
            : Promise.resolve(null),
    ]);

    // ── Tech stack detection (from package.json) ──────────────────────────
    const techStack = packageJson ? detectTechStack(packageJson) : null;

    const snapshot: WorkspaceSnapshot = {
        workspaceId,
        workspaceName,
        techStack,
        fileTree,
        packageJson,
        activeFilePath: intent.needsActiveFile ? activeFilePath : null,
        activeFilePreview,
        gitBranch,
        gitDiff,
        intent: intent.intent,
        tokenEstimate: 0,
    };

    // ── Compute token estimate ─────────────────────────────────────────────
    const contextStr = buildContextBlock(snapshot);
    snapshot.tokenEstimate = estimateTokens(contextStr);

    console.log(
        `[WorkspaceCtx] Built snapshot: ${snapshot.tokenEstimate} tokens ` +
        `(budget: ${MAX_CONTEXT_TOKENS} tokens) | ` +
        `tree=${fileTree?.length ?? 0} chars, pkg=${packageJson?.length ?? 0} chars`
    );

    if (snapshot.tokenEstimate > MAX_CONTEXT_TOKENS) {
        console.warn(
            `[WorkspaceCtx] OVER BUDGET: ${snapshot.tokenEstimate} > ${MAX_CONTEXT_TOKENS} tokens! ` +
            `Trimming context...`
        );
        // Trim in priority order: file tree first, then pkg, then active file
        if (snapshot.fileTree) {
            const lines = snapshot.fileTree.split("\n");
            if (lines.length > 20) {
                snapshot.fileTree = lines.slice(0, 20).join("\n") + `\n... (${lines.length - 20} more)`;
            }
        }
        if (snapshot.packageJson) {
            const lines = snapshot.packageJson.split("\n");
            if (lines.length > 15) {
                snapshot.packageJson = lines.slice(0, 15).join("\n");
            }
        }
        if (snapshot.activeFilePreview) {
            const lines = snapshot.activeFilePreview.split("\n");
            if (lines.length > 40) {
                snapshot.activeFilePreview = lines.slice(0, 40).join("\n") +
                    `\n... (${lines.length - 40} more lines, use read_file for full content)`;
            }
        }
        snapshot.tokenEstimate = estimateTokens(buildContextBlock(snapshot));
        console.log(`[WorkspaceCtx] After trim: ${snapshot.tokenEstimate} tokens`);
    }

    // ── Cache the snapshot ─────────────────────────────────────────────────
    await redis.set(cacheKey, JSON.stringify(snapshot), CONTEXT_TTL);

    return snapshot;
}

// ── Build context string ──────────────────────────────────────────────────────

export function buildContextBlock(snapshot: WorkspaceSnapshot): string {
    const parts: string[] = [];

    parts.push(`Project: ${snapshot.workspaceName}`);

    if (snapshot.techStack) {
        parts.push(`Stack: ${snapshot.techStack}`);
    }

    if (snapshot.gitBranch) {
        parts.push(`Branch: ${snapshot.gitBranch}`);
    }

    if (snapshot.activeFilePath) {
        parts.push(`Active file: ${snapshot.activeFilePath}`);
    }

    if (snapshot.fileTree) {
        parts.push(`\nFile structure:\n${snapshot.fileTree}`);
    }

    if (snapshot.packageJson) {
        parts.push(`\nDependencies:\n${snapshot.packageJson}`);
    }

    if (snapshot.activeFilePreview) {
        parts.push(`\nActive file preview (first ${ACTIVE_FILE_PREVIEW_LINES} lines):\n\`\`\`\n${snapshot.activeFilePreview}\n\`\`\``);
    }

    if (snapshot.gitDiff) {
        parts.push(`\nRecent changes:\n${snapshot.gitDiff}`);
    }

    return parts.join("\n");
}

// ── Individual fetchers ───────────────────────────────────────────────────────

async function fetchFileTree(
    base: string,
    workspaceId: string,
    depth: 1 | 2,
): Promise<string | null> {
    try {
        const res = await fetch(
            `${base}/api/files?workspaceId=${encodeURIComponent(workspaceId)}&path=&type=dir`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const entries: Array<{ name: string; type: string }> = data.entries ?? [];

        const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

        const lines: string[] = [];
        for (const e of entries) {
            if (IGNORED.has(e.name)) continue;
            const icon = e.type === "folder" ? "📁" : "📄";
            lines.push(`${icon} ${e.name}`);

            // Depth 2: expand non-ignored folders
            if (depth === 2 && e.type === "folder" && lines.length < MAX_FILE_TREE_LINES) {
                try {
                    const r2 = await fetch(
                        `${base}/api/files?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(e.name)}&type=dir`
                    );
                    if (r2.ok) {
                        const d2 = await r2.json();
                        for (const e2 of (d2.entries ?? []).slice(0, 8)) {
                            if (!IGNORED.has(e2.name)) {
                                lines.push(`  ${e2.type === "folder" ? "📁" : "📄"} ${e2.name}`);
                            }
                        }
                    }
                } catch { }
            }

            if (lines.length >= MAX_FILE_TREE_LINES) {
                lines.push(`... (more files not shown)`);
                break;
            }
        }

        return lines.join("\n");
    } catch (err: any) {
        console.error("[WorkspaceCtx] fetchFileTree error:", err.message);
        return null;
    }
}

async function fetchPackageJsonDeps(base: string, workspaceId: string): Promise<string | null> {
    try {
        const res = await fetch(
            `${base}/api/files?workspaceId=${encodeURIComponent(workspaceId)}&path=package.json&type=file`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.content) return null;

        const pkg = JSON.parse(data.content);

        // Only extract what matters — not the whole file
        const deps = {
            ...(pkg.dependencies ?? {}),
            ...(pkg.devDependencies ?? {}),
        };
        const scripts = pkg.scripts ?? {};

        const depLines = Object.entries(deps)
            .slice(0, 20)
            .map(([k, v]) => `  ${k}: ${v}`);

        const scriptLines = Object.entries(scripts)
            .slice(0, 8)
            .map(([k, v]) => `  ${k}: ${v}`);

        const lines: string[] = [];
        if (depLines.length) {
            lines.push("deps:", ...depLines);
        }
        if (scriptLines.length) {
            lines.push("scripts:", ...scriptLines);
        }

        return lines.slice(0, MAX_PKG_LINES).join("\n");
    } catch (err: any) {
        console.error("[WorkspaceCtx] fetchPackageJsonDeps error:", err.message);
        return null;
    }
}

async function fetchGitBranch(base: string, workspaceId: string): Promise<string | null> {
    try {
        const res = await fetch(
            `${base}/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.gitBranch ?? null;
    } catch {
        return null;
    }
}

async function fetchGitDiffStat(base: string, workspaceId: string): Promise<string | null> {
    try {
        const res = await fetch(`${base}/api/terminal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspaceId,
                command: "git diff --stat HEAD 2>/dev/null | head -20",
                stream: false,
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const out = (data.output ?? data.stdout ?? "").trim();
        return out || null;
    } catch {
        return null;
    }
}

async function fetchActiveFilePreview(
    base: string,
    workspaceId: string,
    filePath: string,
): Promise<string | null> {
    try {
        const res = await fetch(
            `${base}/api/files?workspaceId=${encodeURIComponent(workspaceId)}` +
            `&path=${encodeURIComponent(filePath)}&type=file` +
            `&endLine=${ACTIVE_FILE_PREVIEW_LINES}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.content) return null;

        const totalLines = data.totalLines ?? data.content.split("\n").length;
        const preview = data.content;

        if (totalLines > ACTIVE_FILE_PREVIEW_LINES) {
            return preview + `\n... (${totalLines - ACTIVE_FILE_PREVIEW_LINES} more lines)`;
        }
        return preview;
    } catch (err: any) {
        console.error("[WorkspaceCtx] fetchActiveFilePreview error:", err.message);
        return null;
    }
}

// ── Tech stack detection ──────────────────────────────────────────────────────

function detectTechStack(packageJsonSection: string): string {
    const text = packageJsonSection.toLowerCase();
    const found: string[] = [];

    const checks: Array<[RegExp, string]> = [
        [/next/, "Next.js"],
        [/react/, "React"],
        [/vue/, "Vue"],
        [/svelte/, "Svelte"],
        [/angular/, "Angular"],
        [/tailwind/, "Tailwind"],
        [/prisma/, "Prisma"],
        [/drizzle/, "Drizzle"],
        [/mongoose|mongodb/, "MongoDB"],
        [/pg|postgres/, "PostgreSQL"],
        [/mysql2|mysql/, "MySQL"],
        [/redis/, "Redis"],
        [/convex/, "Convex"],
        [/supabase/, "Supabase"],
        [/firebase/, "Firebase"],
        [/express/, "Express"],
        [/fastify/, "Fastify"],
        [/zod/, "Zod"],
        [/trpc/, "tRPC"],
        [/zustand/, "Zustand"],
        [/jotai/, "Jotai"],
        [/jest/, "Jest"],
        [/vitest/, "Vitest"],
        [/playwright/, "Playwright"],
        [/typescript/, "TypeScript"],
    ];

    for (const [re, name] of checks) {
        if (re.test(text)) found.push(name);
        if (found.length >= 6) break;
    }

    return found.join(", ") || "Node.js";
}