// // src/app/api/files/route.ts
// // File system API — read, write, list, create, delete, watch.
// // All operations go through the sandbox exec layer so they
// // happen inside the container with correct permissions.
// // Files physically live on host disk via bind mount.

// import { NextRequest, NextResponse } from "next/server";
// import fs from "fs";
// import path from "path";
// import { getWorkspacePathSafe } from "@/src/server/workspace/local-registry";


// // ── Path safety ───────────────────────────────────────────────────────────────
// // Prevent path traversal: user cannot escape their workspace root.
// // e.g. filePath = "../../etc/passwd" → rejected

// function safeJoin(workspacePath: string, relativePath: string): string | null {
//     // Normalize and resolve
//     const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
//     const fullPath = path.join(workspacePath, normalized);

//     // Must stay inside workspace
//     if (!fullPath.startsWith(workspacePath + path.sep) &&
//         fullPath !== workspacePath) {
//         return null;
//     }
//     return fullPath;
// }

// // ── GET /api/files ────────────────────────────────────────────────────────────
// // Read file content OR list directory entries.
// // Query params:
// //   workspaceId  required
// //   path         file or directory path relative to workspace root
// //   type         "file" | "dir" (default "file")
// //   startLine    optional — for partial reads
// //   endLine      optional — for partial reads

// export async function GET(req: NextRequest) {
//     const url = new URL(req.url);
//     const workspaceId = url.searchParams.get("workspaceId");
//     const filePath = url.searchParams.get("path") ?? "";
//     const type = url.searchParams.get("type") ?? "file";
//     const startLine = url.searchParams.get("startLine");
//     const endLine = url.searchParams.get("endLine");

//     if (!workspaceId) {
//         return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
//     }

//     const workspacePath = getWorkspacePathSafe(workspaceId);
//     if (!workspacePath) {
//         return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
//     }

//     try {
//         // ── List directory ────────────────────────────────────────────────────
//         if (type === "dir") {
//             const dirPath = filePath
//                 ? safeJoin(workspacePath, filePath)
//                 : workspacePath;

//             if (!dirPath) {
//                 return NextResponse.json({ error: "Invalid path" }, { status: 400 });
//             }

//             if (!fs.existsSync(dirPath)) {
//                 return NextResponse.json({ entries: [] });
//             }

//             const entries = fs.readdirSync(dirPath, { withFileTypes: true });
//             const result = entries
//                 .filter(e => !e.name.startsWith(".git"))  // hide .git internals
//                 .map(e => ({
//                     name: e.name,
//                     type: e.isDirectory() ? "folder" : "file",
//                     relativePath: filePath
//                         ? `${filePath}/${e.name}`
//                         : e.name,
//                     // Size for files
//                     size: e.isFile()
//                         ? (() => {
//                             try {
//                                 return fs.statSync(
//                                     path.join(dirPath, e.name)
//                                 ).size;
//                             } catch { return 0; }
//                         })()
//                         : undefined,
//                 }))
//                 .sort((a, b) => {
//                     // Folders first, then alphabetical
//                     if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
//                     return a.name.localeCompare(b.name);
//                 });

//             return NextResponse.json({ entries });
//         }

//         // ── Read file ─────────────────────────────────────────────────────────
//         const fullPath = safeJoin(workspacePath, filePath);
//         if (!fullPath) {
//             return NextResponse.json({ error: "Invalid path" }, { status: 400 });
//         }

//         if (!fs.existsSync(fullPath)) {
//             return NextResponse.json({ error: "File not found" }, { status: 404 });
//         }

//         const stat = fs.statSync(fullPath);
//         if (stat.isDirectory()) {
//             return NextResponse.json(
//                 { error: "Path is a directory, use type=dir" },
//                 { status: 400 }
//             );
//         }

//         // Check file size — refuse to send huge files to browser
//         const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
//         if (stat.size > MAX_FILE_SIZE) {
//             return NextResponse.json(
//                 {
//                     error: "File too large for editor",
//                     size: stat.size,
//                     maxSize: MAX_FILE_SIZE,
//                     truncated: true,
//                 },
//                 { status: 413 }
//             );
//         }

//         let content = fs.readFileSync(fullPath, "utf-8");
//         const allLines = content.split("\n");
//         const totalLines = allLines.length;

//         // Apply line range if requested
//         if (startLine || endLine) {
//             const start = startLine ? parseInt(startLine, 10) - 1 : 0;
//             const end = endLine ? parseInt(endLine, 10) : totalLines;
//             content = allLines.slice(start, end).join("\n");
//         }

//         return NextResponse.json({
//             content,
//             totalLines,
//             truncated: false,
//             size: stat.size,
//             path: filePath,
//         });

//     } catch (err: any) {
//         console.error(`[API/files] GET error:`, err.message);
//         return NextResponse.json({ error: err.message }, { status: 500 });
//     }
// }

// // ── POST /api/files ───────────────────────────────────────────────────────────
// // Write, create, or delete a file/folder.
// // Body: { workspaceId, path, content?, action }
// // action: "write" | "create" | "delete" | "rename"

// export async function POST(req: NextRequest) {
//     try {
//         const body = await req.json();
//         const {
//             workspaceId,
//             path: filePath,
//             content,
//             action = "write",
//             isFolder = false,
//             newPath,
//         } = body as {
//             workspaceId: string;
//             path: string;
//             content?: string;
//             action?: string;
//             isFolder?: boolean;
//             newPath?: string;
//         };

//         if (!workspaceId || !filePath) {
//             return NextResponse.json(
//                 { error: "workspaceId and path are required" },
//                 { status: 400 }
//             );
//         }

//         const workspacePath = getWorkspacePathSafe(workspaceId);
//         if (!workspacePath) {
//             return NextResponse.json({ error: "Workspace not found", path: workspacePath }, { status: 404 });
//         }

//         const fullPath = safeJoin(workspacePath, filePath);
//         if (!fullPath) {
//             return NextResponse.json({ error: "Invalid path" }, { status: 400 });
//         }

//         // ── write ──────────────────────────────────────────────────────────────
//         if (action === "write") {
//             if (content === undefined) {
//                 return NextResponse.json({ error: "content required" }, { status: 400 });
//             }

//             // Ensure parent directory exists
//             fs.mkdirSync(path.dirname(fullPath), { recursive: true });
//             fs.writeFileSync(fullPath, content, "utf-8");

//             return NextResponse.json({ success: true, path: filePath });
//         }

//         // ── create ─────────────────────────────────────────────────────────────
//         if (action === "create") {
//             if (isFolder) {
//                 fs.mkdirSync(fullPath, { recursive: true });
//             } else {
//                 fs.mkdirSync(path.dirname(fullPath), { recursive: true });
//                 // Create empty file if not exists
//                 if (!fs.existsSync(fullPath)) {
//                     fs.writeFileSync(fullPath, "", "utf-8");
//                 }
//             }
//             return NextResponse.json({ success: true, path: filePath });
//         }

//         // ── delete ─────────────────────────────────────────────────────────────
//         if (action === "delete") {
//             if (!fs.existsSync(fullPath)) {
//                 return NextResponse.json({ success: true }); // already gone
//             }
//             fs.rmSync(fullPath, { recursive: true, force: true });
//             return NextResponse.json({ success: true });
//         }

//         // ── rename / move ──────────────────────────────────────────────────────
//         if (action === "rename") {
//             if (!newPath) {
//                 return NextResponse.json(
//                     { error: "newPath required for rename" },
//                     { status: 400 }
//                 );
//             }
//             const newFullPath = safeJoin(workspacePath, newPath);
//             if (!newFullPath) {
//                 return NextResponse.json({ error: "Invalid newPath" }, { status: 400 });
//             }

//             fs.mkdirSync(path.dirname(newFullPath), { recursive: true });
//             fs.renameSync(fullPath, newFullPath);
//             return NextResponse.json({ success: true, path: newPath });
//         }

//         return NextResponse.json(
//             { error: `Unknown action: ${action}` },
//             { status: 400 }
//         );

//     } catch (err: any) {
//         console.error(`[API/files] POST error:`, err.message);
//         return NextResponse.json({ error: err.message }, { status: 500 });
//     }
// }



// src/app/api/files/route.ts — add auth + rate limiting + path validation

// import { NextRequest, NextResponse } from "next/server";
// import fs from "fs";
// import path from "path";
// import { getWorkspacePathSafe } from "@/src/server/workspace/local-registry";
// import {
//     requireAuth,
//     checkRateLimit,
//     rateLimitResponse,
//     validateFilePath,
//     validatePayloadSize,
// } from "@/src/app/api/_middleware/auth";

// function safeJoin(workspacePath: string, relativePath: string): string | null {
//     const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
//     const fullPath = path.join(workspacePath, normalized);
//     if (!fullPath.startsWith(workspacePath + path.sep) && fullPath !== workspacePath) {
//         return null;
//     }
//     return fullPath;
// }

// export async function GET(req: NextRequest) {
//     // Auth
//     const authResult = await requireAuth(req);
//     if (authResult instanceof NextResponse) return authResult;

//     // Rate limit
//     const url = new URL(req.url);
//     const rl = checkRateLimit(authResult.userId, "/api/files");
//     if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

//     let workspaceId = "jx7989cer1nnx2e7c1z26d9nn9849bh5";
//     const filePath = url.searchParams.get("path") ?? "";
//     const type = url.searchParams.get("type") ?? "file";
//     const startLine = url.searchParams.get("startLine");
//     const endLine = url.searchParams.get("endLine");
//     // workspaceId = "jx75gm79mre6jrt9tkgrqss5mn83hhjh";
//     console.log("workspaceId", workspaceId);
//     console.log("filePath", filePath);
//     console.log("type", type);
//     console.log("startLine", startLine);
//     console.log("endLine", endLine);

//     if (!workspaceId) {
//         return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
//     }

//     const workspacePath = getWorkspacePathSafe(workspaceId);
//     console.log("workspacePath", workspacePath);
//     if (!workspacePath) {
//         return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
//     }

//     // Path validation
//     if (filePath) {
//         const pathCheck = validateFilePath(filePath, workspacePath);
//         if (!pathCheck.valid) {
//             return NextResponse.json(
//                 { error: pathCheck.reason },
//                 { status: 400 }
//             );
//         }
//     }

//     try {
//         if (type === "dir") {
//             const dirPath = filePath ? safeJoin(workspacePath, filePath) : workspacePath;
//             if (!dirPath) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
//             if (!fs.existsSync(dirPath)) return NextResponse.json({ entries: [] });

//             const entries = fs.readdirSync(dirPath, { withFileTypes: true })
//                 .filter(e => !e.name.startsWith(".git"))
//                 .map(e => ({
//                     name: e.name,
//                     type: e.isDirectory() ? "folder" : "file",
//                     relativePath: filePath ? `${filePath}/${e.name}` : e.name,
//                     size: e.isFile()
//                         ? (() => { try { return fs.statSync(path.join(dirPath, e.name)).size; } catch { return 0; } })()
//                         : undefined,
//                 }))
//                 .sort((a, b) => {
//                     if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
//                     return a.name.localeCompare(b.name);
//                 });

//             return NextResponse.json({ entries });
//         }

//         const fullPath = safeJoin(workspacePath, filePath);
//         if (!fullPath) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
//         if (!fs.existsSync(fullPath)) return NextResponse.json({ error: "File not found" }, { status: 404 });

//         const stat = fs.statSync(fullPath);
//         if (stat.isDirectory()) {
//             return NextResponse.json({ error: "Use type=dir for directories" }, { status: 400 });
//         }

//         const MAX_FILE_SIZE = 2 * 1024 * 1024;
//         if (stat.size > MAX_FILE_SIZE) {
//             return NextResponse.json(
//                 { error: "File too large", size: stat.size, truncated: true },
//                 { status: 413 }
//             );
//         }


//         const peekMode = url.searchParams.get("peek") === "true";
//         const PEEK_LINES = 100;

//         let content = fs.readFileSync(fullPath, "utf-8");
//         const lines = content.split("\n");
//         const total = lines.length;

//         if (startLine || endLine) {
//             // Explicit line range — return exactly what was requested
//             const s = startLine ? parseInt(startLine, 10) - 1 : 0;
//             const e = endLine ? parseInt(endLine, 10) : total;
//             content = lines.slice(s, e).join("\n");
//             console.log(
//                 `[API/files] Line range read: ${filePath} ` +
//                 `lines ${s + 1}-${e} of ${total}`
//             );
//         } else if (peekMode && total > PEEK_LINES) {
//             // Peek mode: first 100 lines + summary
//             const peeked = lines.slice(0, PEEK_LINES).join("\n");
//             const remaining = total - PEEK_LINES;

//             // Extract top-level symbols from remaining lines for navigation
//             const symbols = extractSymbols(lines.slice(PEEK_LINES), PEEK_LINES);
//             const symbolHint = symbols.length > 0
//                 ? `\n\n[Symbols in remaining ${remaining} lines: ${symbols.join(", ")}]`
//                 : "";

//             content = peeked +
//                 `\n\n[... ${remaining} more lines not shown. ` +
//                 `Use startLine/endLine to read specific sections.]` +
//                 symbolHint;

//             console.log(
//                 `[API/files] PEEK mode: ${filePath} — ` +
//                 `showing ${PEEK_LINES}/${total} lines, ` +
//                 `saved ~${Math.ceil((remaining * 40) / 3.5)} tokens`
//             );
//         } else {
//             console.log(
//                 `[API/files] Full read: ${filePath} — ` +
//                 `${total} lines (~${Math.ceil(content.length / 3.5)} tokens)`
//             );
//         }

//         return NextResponse.json({
//             content,
//             totalLines: total,
//             truncated: peekMode && total > PEEK_LINES,
//             size: stat.size,
//             path: filePath,
//         });

//         // ── Symbol extractor (lightweight — no AST parser needed) ─────────────────────
//         function extractSymbols(lines: string[], startLineOffset: number): string[] {
//             const symbols: string[] = [];
//             const patterns = [
//                 /^export (?:default )?(?:function|class|const|async function)\s+(\w+)/,
//                 /^(?:function|class)\s+(\w+)/,
//                 /^const\s+(\w+)\s*=/,
//                 /^export\s+(?:type|interface|enum)\s+(\w+)/,
//                 /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,  // method definitions
//             ];

//             for (let i = 0; i < lines.length && symbols.length < 10; i++) {
//                 for (const pattern of patterns) {
//                     const match = lines[i].match(pattern);
//                     if (match?.[1]) {
//                         symbols.push(`${match[1]}:L${startLineOffset + i + 1}`);
//                         break;
//                     }
//                 }
//             }

//             return symbols;
//         }


//     } catch (err: any) {
//         console.error("[API/files] GET error:", err.message);
//         return NextResponse.json({ error: err.message }, { status: 500 });
//     }
// }

// export async function POST(req: NextRequest) {
//     const authResult = await requireAuth(req);
//     if (authResult instanceof NextResponse) return authResult;

//     const url = new URL(req.url);
//     const rl = checkRateLimit(authResult.userId, "/api/files");
//     if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

//     try {
//         const body = await req.json();
//         let { workspaceId, path: filePath, content, action = "write", isFolder, newPath } = body;
//         workspaceId = "jx7989cer1nnx2e7c1z26d9nn9849bh5";
//         if (!workspaceId || !filePath) {
//             return NextResponse.json({ error: "workspaceId and path required" }, { status: 400 });
//         }

//         // Path validation
//         const pathCheck = validateFilePath(filePath, "");
//         if (!pathCheck.valid) {
//             return NextResponse.json({ error: pathCheck.reason }, { status: 400 });
//         }

//         // Payload size validation for writes
//         if (content !== undefined) {
//             const sizeCheck = validatePayloadSize(content);
//             if (!sizeCheck.valid) {
//                 return NextResponse.json({ error: sizeCheck.reason }, { status: 413 });
//             }
//         }

//         const workspacePath = getWorkspacePathSafe(workspaceId);
//         if (!workspacePath) {
//             return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
//         }

//         const fullPath = safeJoin(workspacePath, filePath);
//         if (!fullPath) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

//         if (action === "write") {
//             if (content === undefined) return NextResponse.json({ error: "content required" }, { status: 400 });
//             fs.mkdirSync(path.dirname(fullPath), { recursive: true });
//             fs.writeFileSync(fullPath, content, "utf-8");
//             return NextResponse.json({ success: true, path: filePath });
//         }

//         if (action === "create") {
//             if (isFolder) {
//                 fs.mkdirSync(fullPath, { recursive: true });
//             } else {
//                 fs.mkdirSync(path.dirname(fullPath), { recursive: true });
//                 if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, "", "utf-8");
//             }
//             return NextResponse.json({ success: true, path: filePath });
//         }

//         if (action === "delete") {
//             if (fs.existsSync(fullPath)) fs.rmSync(fullPath, { recursive: true, force: true });
//             return NextResponse.json({ success: true });
//         }

//         if (action === "rename") {
//             if (!newPath) return NextResponse.json({ error: "newPath required" }, { status: 400 });
//             const newFullPath = safeJoin(workspacePath, newPath);
//             if (!newFullPath) return NextResponse.json({ error: "Invalid newPath" }, { status: 400 });
//             fs.mkdirSync(path.dirname(newFullPath), { recursive: true });
//             fs.renameSync(fullPath, newFullPath);
//             return NextResponse.json({ success: true, path: newPath });
//         }

//         return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

//     } catch (err: any) {
//         console.error("[API/files] POST error:", err.message);
//         return NextResponse.json({ error: err.message }, { status: 500 });
//     }
// }




// src/app/api/files/route.ts
// COMPLETE REWRITE — removes hardcoded workspaceId, adds peek mode,
// adds create_directory action, adds symbol extraction

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getWorkspacePathSafe } from "@/src/server/workspace/local-registry";
import {
    requireAuth,
    checkRateLimit,
    rateLimitResponse,
    validateFilePath,
    validatePayloadSize,
} from "@/src/app/api/_middleware/auth";

// ── Path safety ───────────────────────────────────────────────────────────────

function safeJoin(workspacePath: string, relativePath: string): string | null {
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(workspacePath, normalized);
    if (!fullPath.startsWith(workspacePath + path.sep) && fullPath !== workspacePath) {
        return null;
    }
    return fullPath;
}

// ── Symbol extractor ──────────────────────────────────────────────────────────

function extractSymbols(lines: string[], startLineOffset: number): string[] {
    const symbols: string[] = [];
    const patterns = [
        /^export (?:default )?(?:async function|function|class|const)\s+(\w+)/,
        /^(?:function|class)\s+(\w+)/,
        /^const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
        /^export\s+(?:type|interface|enum)\s+(\w+)/,
    ];
    for (let i = 0; i < lines.length && symbols.length < 12; i++) {
        for (const pattern of patterns) {
            const match = lines[i].match(pattern);
            if (match?.[1]) {
                symbols.push(`${match[1]}:L${startLineOffset + i + 1}`);
                break;
            }
        }
    }
    return symbols;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const url = new URL(req.url);
    const rl = checkRateLimit(authResult.userId, "/api/files");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

    // ── Read workspaceId from query params — NEVER hardcode ───────────────────
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    const filePath = url.searchParams.get("path") ?? "";
    const type = url.searchParams.get("type") ?? "file";
    const startLine = url.searchParams.get("startLine");
    const endLine = url.searchParams.get("endLine");
    const peekMode = url.searchParams.get("peek") === "true";

    console.log("[API/files] GET", { workspaceId, filePath, type, peekMode });

    if (!workspaceId) {
        console.error("[API/files] GET: missing workspaceId");
        return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const workspacePath = getWorkspacePathSafe(workspaceId);
    if (!workspacePath) {
        console.error(`[API/files] GET: workspace not found: ${workspaceId}`);
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (filePath) {
        const pathCheck = validateFilePath(filePath, workspacePath);
        if (!pathCheck.valid) {
            return NextResponse.json({ error: pathCheck.reason }, { status: 400 });
        }
    }

    try {
        // ── Directory listing ─────────────────────────────────────────────────
        if (type === "dir") {
            const dirPath = filePath
                ? safeJoin(workspacePath, filePath)
                : workspacePath;
            if (!dirPath) {
                return NextResponse.json({ error: "Invalid path" }, { status: 400 });
            }
            if (!fs.existsSync(dirPath)) {
                return NextResponse.json({ entries: [] });
            }

            const IGNORED = new Set([".git", "node_modules", ".next", "dist", "build", ".cache"]);

            const entries = fs.readdirSync(dirPath, { withFileTypes: true })
                .filter(e => !IGNORED.has(e.name))
                .map(e => ({
                    name: e.name,
                    type: e.isDirectory() ? "folder" : "file",
                    isDirectory: e.isDirectory(),
                    relativePath: filePath ? `${filePath}/${e.name}` : e.name,
                    size: e.isFile()
                        ? (() => { try { return fs.statSync(path.join(dirPath, e.name)).size; } catch { return 0; } })()
                        : undefined,
                }))
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

            console.log(
                `[API/files] dir: ${filePath || "/"} → ${entries.length} entries`
            );
            return NextResponse.json({ entries });
        }

        // ── Search ────────────────────────────────────────────────────────────
        if (type === "search") {
            const query = url.searchParams.get("query") ?? "";
            const isRegex = url.searchParams.get("isRegex") === "true";
            const includePattern = url.searchParams.get("includePattern");

            if (!query) {
                return NextResponse.json({ filePaths: [], hasMore: false });
            }

            // Simple grep-based search through workspace files
            const results: string[] = [];
            const searchDir = workspacePath;

            const walkDir = (dir: string, prefix: string) => {
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if ([".git", "node_modules", ".next"].includes(entry.name)) continue;
                        const fullPath = path.join(dir, entry.name);
                        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                        if (entry.isDirectory()) {
                            walkDir(fullPath, relPath);
                        } else if (entry.isFile()) {
                            if (includePattern && !entry.name.match(includePattern)) continue;
                            try {
                                const content = fs.readFileSync(fullPath, "utf-8");
                                const matches = isRegex
                                    ? content.match(new RegExp(query))
                                    : content.includes(query);
                                if (matches) results.push(relPath);
                            } catch { }
                        }
                        if (results.length >= 50) return;
                    }
                } catch { }
            };

            walkDir(searchDir, "");
            return NextResponse.json({
                filePaths: results.slice(0, 20),
                hasMore: results.length > 20,
            });
        }

        // ── Search in file ────────────────────────────────────────────────────
        if (type === "search-in-file") {
            const query = url.searchParams.get("query") ?? "";
            const isRegex = url.searchParams.get("isRegex") === "true";

            const fullPath = safeJoin(workspacePath, filePath);
            if (!fullPath || !fs.existsSync(fullPath)) {
                return NextResponse.json({ matchingLines: [] });
            }

            const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
            const matches = lines.reduce<number[]>((acc, line, i) => {
                const hit = isRegex
                    ? line.match(new RegExp(query))
                    : line.includes(query);
                if (hit) acc.push(i + 1);
                return acc;
            }, []);

            return NextResponse.json({ matchingLines: matches });
        }

        // ── File read ─────────────────────────────────────────────────────────
        const fullPath = safeJoin(workspacePath, filePath);
        if (!fullPath) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }
        console.log("[API/files] fullPath", fullPath);
        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return NextResponse.json(
                { error: "Use type=dir for directories" },
                { status: 400 }
            );
        }

        const MAX_FILE_SIZE = 2 * 1024 * 1024;
        if (stat.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File too large", size: stat.size, truncated: true },
                { status: 413 }
            );
        }

        const rawContent = fs.readFileSync(fullPath, "utf-8");
        const allLines = rawContent.split("\n");
        const total = allLines.length;
        let content = rawContent;
        let truncated = false;

        const PEEK_LINES = 100;

        if (startLine || endLine) {
            // Explicit line range
            const s = startLine ? parseInt(startLine, 10) - 1 : 0;
            const e = endLine ? parseInt(endLine, 10) : total;
            content = allLines.slice(s, e).join("\n");
            console.log(
                `[API/files] range read: ${filePath} L${s + 1}-${e}/${total}`
            );
        } else if (peekMode && total > PEEK_LINES) {
            // Peek mode: first 100 lines + symbol map
            const peeked = allLines.slice(0, PEEK_LINES);
            const remaining = allLines.slice(PEEK_LINES);
            const symbols = extractSymbols(remaining, PEEK_LINES);
            const symbolStr = symbols.length > 0
                ? `\n\n[Symbols in remaining ${total - PEEK_LINES} lines: ${symbols.join(", ")}]`
                : "";

            content = peeked.join("\n") +
                `\n\n[... ${total - PEEK_LINES} more lines. Use startLine/endLine to read more.]` +
                symbolStr;
            truncated = true;

            console.log(
                `[API/files] peek: ${filePath} — ` +
                `${PEEK_LINES}/${total} lines shown, ` +
                `${symbols.length} symbols extracted, ` +
                `saved ~${Math.ceil(((total - PEEK_LINES) * 40) / 3.5)} tokens`
            );
        } else {
            console.log(
                `[API/files] full read: ${filePath} — ` +
                `${total} lines (~${Math.ceil(rawContent.length / 3.5)} tokens)`
            );
        }

        return NextResponse.json({
            content,
            totalLines: total,
            truncated,
            size: stat.size,
            path: filePath,
        });

    } catch (err: any) {
        console.error("[API/files] GET error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;

    const rl = checkRateLimit(authResult.userId, "/api/files");
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!);

    try {
        const body = await req.json();
        const {
            path: filePath,
            content,
            action = "write",
            isFolder,
            newPath,
        } = body;

        // ── Read workspaceId from body — NEVER hardcode ───────────────────────
        const workspaceId: string = body.workspaceId ?? "";

        console.log("[API/files] POST", { workspaceId, filePath, action });

        if (!workspaceId) {
            console.error("[API/files] POST: missing workspaceId");
            return NextResponse.json(
                { error: "workspaceId required" },
                { status: 400 }
            );
        }
        if (!filePath) {
            return NextResponse.json(
                { error: "path required" },
                { status: 400 }
            );
        }

        const pathCheck = validateFilePath(filePath, "");
        if (!pathCheck.valid) {
            return NextResponse.json({ error: pathCheck.reason }, { status: 400 });
        }

        if (content !== undefined) {
            const sizeCheck = validatePayloadSize(content);
            if (!sizeCheck.valid) {
                return NextResponse.json({ error: sizeCheck.reason }, { status: 413 });
            }
        }

        const workspacePath = getWorkspacePathSafe(workspaceId);
        if (!workspacePath) {
            console.error(`[API/files] POST: workspace not found: ${workspaceId}`);
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        const fullPath = safeJoin(workspacePath, filePath);
        if (!fullPath) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        // ── write ─────────────────────────────────────────────────────────────
        if (action === "write") {
            if (content === undefined) {
                return NextResponse.json({ error: "content required" }, { status: 400 });
            }
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, "utf-8");
            console.log(`[API/files] wrote: ${filePath} (${content.length} chars)`);
            return NextResponse.json({ success: true, path: filePath });
        }

        // ── create (file or directory) ────────────────────────────────────────
        if (action === "create") {
            if (isFolder) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`[API/files] created dir: ${filePath}`);
            } else {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                if (!fs.existsSync(fullPath)) {
                    fs.writeFileSync(fullPath, "", "utf-8");
                }
                console.log(`[API/files] created file: ${filePath}`);
            }
            return NextResponse.json({ success: true, path: filePath });
        }

        // ── delete ────────────────────────────────────────────────────────────
        if (action === "delete") {
            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`[API/files] deleted: ${filePath}`);
            }
            return NextResponse.json({ success: true });
        }

        // ── rename / move ─────────────────────────────────────────────────────
        if (action === "rename") {
            if (!newPath) {
                return NextResponse.json({ error: "newPath required" }, { status: 400 });
            }
            const newFullPath = safeJoin(workspacePath, newPath);
            if (!newFullPath) {
                return NextResponse.json({ error: "Invalid newPath" }, { status: 400 });
            }
            fs.mkdirSync(path.dirname(newFullPath), { recursive: true });
            fs.renameSync(fullPath, newFullPath);
            console.log(`[API/files] renamed: ${filePath} → ${newPath}`);
            return NextResponse.json({ success: true, path: newPath });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
        );

    } catch (err: any) {
        console.error("[API/files] POST error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}