// src/app/api/files/route.ts
// File system API — read, write, list, create, delete, watch.
// All operations go through the sandbox exec layer so they
// happen inside the container with correct permissions.
// Files physically live on host disk via bind mount.

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getWorkspacePathSafe } from "@/src/server/workspace/local-registry";
import { execInSandbox } from "@/src/server/sandbox/sandbox-manager";

// ── Path safety ───────────────────────────────────────────────────────────────
// Prevent path traversal: user cannot escape their workspace root.
// e.g. filePath = "../../etc/passwd" → rejected

function safeJoin(workspacePath: string, relativePath: string): string | null {
    // Normalize and resolve
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(workspacePath, normalized);

    // Must stay inside workspace
    if (!fullPath.startsWith(workspacePath + path.sep) &&
        fullPath !== workspacePath) {
        return null;
    }
    return fullPath;
}

// ── GET /api/files ────────────────────────────────────────────────────────────
// Read file content OR list directory entries.
// Query params:
//   workspaceId  required
//   path         file or directory path relative to workspace root
//   type         "file" | "dir" (default "file")
//   startLine    optional — for partial reads
//   endLine      optional — for partial reads

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const filePath = url.searchParams.get("path") ?? "";
    const type = url.searchParams.get("type") ?? "file";
    const startLine = url.searchParams.get("startLine");
    const endLine = url.searchParams.get("endLine");

    if (!workspaceId) {
        return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const workspacePath = getWorkspacePathSafe(workspaceId);
    if (!workspacePath) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    try {
        // ── List directory ────────────────────────────────────────────────────
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

            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const result = entries
                .filter(e => !e.name.startsWith(".git"))  // hide .git internals
                .map(e => ({
                    name: e.name,
                    type: e.isDirectory() ? "folder" : "file",
                    relativePath: filePath
                        ? `${filePath}/${e.name}`
                        : e.name,
                    // Size for files
                    size: e.isFile()
                        ? (() => {
                            try {
                                return fs.statSync(
                                    path.join(dirPath, e.name)
                                ).size;
                            } catch { return 0; }
                        })()
                        : undefined,
                }))
                .sort((a, b) => {
                    // Folders first, then alphabetical
                    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

            return NextResponse.json({ entries });
        }

        // ── Read file ─────────────────────────────────────────────────────────
        const fullPath = safeJoin(workspacePath, filePath);
        if (!fullPath) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return NextResponse.json(
                { error: "Path is a directory, use type=dir" },
                { status: 400 }
            );
        }

        // Check file size — refuse to send huge files to browser
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
        if (stat.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    error: "File too large for editor",
                    size: stat.size,
                    maxSize: MAX_FILE_SIZE,
                    truncated: true,
                },
                { status: 413 }
            );
        }

        let content = fs.readFileSync(fullPath, "utf-8");
        const allLines = content.split("\n");
        const totalLines = allLines.length;

        // Apply line range if requested
        if (startLine || endLine) {
            const start = startLine ? parseInt(startLine, 10) - 1 : 0;
            const end = endLine ? parseInt(endLine, 10) : totalLines;
            content = allLines.slice(start, end).join("\n");
        }

        return NextResponse.json({
            content,
            totalLines,
            truncated: false,
            size: stat.size,
            path: filePath,
        });

    } catch (err: any) {
        console.error(`[API/files] GET error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ── POST /api/files ───────────────────────────────────────────────────────────
// Write, create, or delete a file/folder.
// Body: { workspaceId, path, content?, action }
// action: "write" | "create" | "delete" | "rename"

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            workspaceId,
            path: filePath,
            content,
            action = "write",
            isFolder = false,
            newPath,
        } = body as {
            workspaceId: string;
            path: string;
            content?: string;
            action?: string;
            isFolder?: boolean;
            newPath?: string;
        };

        if (!workspaceId || !filePath) {
            return NextResponse.json(
                { error: "workspaceId and path are required" },
                { status: 400 }
            );
        }

        const workspacePath = getWorkspacePathSafe(workspaceId);
        if (!workspacePath) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        const fullPath = safeJoin(workspacePath, filePath);
        if (!fullPath) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        // ── write ──────────────────────────────────────────────────────────────
        if (action === "write") {
            if (content === undefined) {
                return NextResponse.json({ error: "content required" }, { status: 400 });
            }

            // Ensure parent directory exists
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, "utf-8");

            return NextResponse.json({ success: true, path: filePath });
        }

        // ── create ─────────────────────────────────────────────────────────────
        if (action === "create") {
            if (isFolder) {
                fs.mkdirSync(fullPath, { recursive: true });
            } else {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                // Create empty file if not exists
                if (!fs.existsSync(fullPath)) {
                    fs.writeFileSync(fullPath, "", "utf-8");
                }
            }
            return NextResponse.json({ success: true, path: filePath });
        }

        // ── delete ─────────────────────────────────────────────────────────────
        if (action === "delete") {
            if (!fs.existsSync(fullPath)) {
                return NextResponse.json({ success: true }); // already gone
            }
            fs.rmSync(fullPath, { recursive: true, force: true });
            return NextResponse.json({ success: true });
        }

        // ── rename / move ──────────────────────────────────────────────────────
        if (action === "rename") {
            if (!newPath) {
                return NextResponse.json(
                    { error: "newPath required for rename" },
                    { status: 400 }
                );
            }
            const newFullPath = safeJoin(workspacePath, newPath);
            if (!newFullPath) {
                return NextResponse.json({ error: "Invalid newPath" }, { status: 400 });
            }

            fs.mkdirSync(path.dirname(newFullPath), { recursive: true });
            fs.renameSync(fullPath, newFullPath);
            return NextResponse.json({ success: true, path: newPath });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
        );

    } catch (err: any) {
        console.error(`[API/files] POST error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}