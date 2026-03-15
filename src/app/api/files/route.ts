// src/app/api/files/route.ts
// All file operations for the chat agent — backed entirely by Convex.
// Files are NOT stored on the OS filesystem; they live in the Convex `files` table.
//
// Architecture:
//   Browser (chat agent) → fetch /api/files?action=X
//   → This route (Next.js server) → ConvexHttpClient → Convex DB
//
// The LLM sends human-readable paths like "src/utils/index.ts".
// We resolve those paths by walking the Convex file tree under the project root.
//
// URL shape:  /api/files?action=<action>&projectId=<id>[&other params]
// projectId is ALWAYS required so we know which project's file tree to operate on.

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

// ── Convex client (server-side, no React hooks) ────────────────────────────────

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// ── Helpers ───────────────────────────────────────────────────────────────────

function err(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

/**
 * Resolve a virtual path like "src/utils/index.ts" to a Convex file Id.
 * Walks the tree starting from projectId root.
 * Returns null if no file is found at that path.
 */
async function resolvePathToId(
    projectId: Id<'projects'>,
    filePath: string
): Promise<Id<'files'> | null> {
    // Normalize: strip leading slashes, split into segments
    const segments = filePath.replace(/^\/+/, '').split('/').filter(Boolean);
    if (segments.length === 0) return null;

    let parentId: Id<'files'> | undefined = undefined;

    for (const segment of segments) {
        const children: Array<{ name: string; _id: Id<'files'>; type: string }> =
            await convex.query(api.files.getFolderFiles, { projectId, parentId });
        const match = children.find(f => f.name === segment);
        if (!match) return null;
        parentId = match._id;
    }

    return parentId ?? null;
}

/**
 * Build the full virtual path of a file by walking up the tree.
 * Returns e.g. "src/utils/index.ts"
 */
async function buildPath(
    projectId: Id<'projects'>,
    fileId: Id<'files'>
): Promise<string> {
    const segments = await convex.query(api.files.getFilePath, {
        projectId,
        fileId,
    });
    return segments.join('/');
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const projectId = searchParams.get('projectId') as Id<'projects'> | null;

    if (!projectId) return err("Missing 'projectId'");

    switch (action) {
        case 'read': return handleRead(searchParams, projectId);
        case 'search-in-file': return handleSearchInFile(searchParams, projectId);
        case 'search': return handleSearch(searchParams, projectId);
        case 'list': return handleList(searchParams, projectId);
        default:
            return err(`Unknown action: ${action}`);
    }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const projectId = searchParams.get('projectId') as Id<'projects'> | null;

    if (!projectId) return err("Missing 'projectId'");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    switch (action) {
        case 'write': return handleWrite(body, projectId);
        case 'create': return handleCreate(body, projectId);
        case 'terminal': return handleTerminal(body);
        default:
            return err(`Unknown action: ${action}`);
    }
}

// ── DELETE handler ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action');
    const projectId = searchParams.get('projectId') as Id<'projects'> | null;

    if (!projectId) return err("Missing 'projectId'");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    switch (action) {
        case 'delete': return handleDelete(body, projectId);
        default:
            return err(`Unknown action: ${action}`);
    }
}

// ── Action: read_file ─────────────────────────────────────────────────────────

async function handleRead(params: URLSearchParams, projectId: Id<'projects'>) {
    const filePath = params.get('path');
    const startLine = params.get('startLine') ? Number(params.get('startLine')) : undefined;
    const endLine = params.get('endLine') ? Number(params.get('endLine')) : undefined;

    if (!filePath) return err("Missing 'path'");

    const fileId = await resolvePathToId(projectId, filePath);
    if (!fileId) return err(`File not found: ${filePath}`, 404);

    const file = await convex.query(api.files.getFile, { fileId });
    if (!file || file.type !== 'file') return err(`Not a file: ${filePath}`, 404);

    const content = file.content ?? '';
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    const MAX_LINES = 500;
    let from = startLine != null ? startLine - 1 : 0;
    let to = endLine != null ? endLine : totalLines;
    from = Math.max(0, from);
    to = Math.min(totalLines, to);

    const sliced = allLines.slice(from, to);
    const truncated = sliced.length > MAX_LINES;
    const final = truncated ? sliced.slice(0, MAX_LINES) : sliced;

    return NextResponse.json({
        content: final.join('\n'),
        totalLines,
        truncated,
    });
}

// ── Action: write_file ────────────────────────────────────────────────────────

async function handleWrite(body: Record<string, unknown>, projectId: Id<'projects'>) {
    const filePath = body.path as string | undefined;
    const content = body.content as string | undefined;

    if (!filePath) return err("Missing 'path'");
    if (content == null) return err("Missing 'content'");

    const fileId = await resolvePathToId(projectId, filePath);
    if (!fileId) return err(`File not found: ${filePath}`, 404);

    await convex.mutation(api.files.updateFileContent, { id: fileId, content });

    return NextResponse.json({ success: true, lintErrors: [] });
}

// ── Action: create_file ───────────────────────────────────────────────────────

async function handleCreate(body: Record<string, unknown>, projectId: Id<'projects'>) {
    const filePath = body.path as string | undefined;
    const isFolder = body.isFolder === true;

    if (!filePath) return err("Missing 'path'");

    // Split into parent path and new file/folder name
    const segments = filePath.replace(/^\/+/, '').split('/').filter(Boolean);
    if (segments.length === 0) return err("Invalid path");

    const name = segments[segments.length - 1];
    const parentSegments = segments.slice(0, -1);

    // Resolve (or create) the parent directory
    let parentId: Id<'files'> | undefined = undefined;
    for (const seg of parentSegments) {
        const children = await convex.query(api.files.getFolderFiles, { projectId, parentId });
        const match = children.find((f: { name: string; _id: Id<'files'>; type: string }) => f.name === seg && f.type === 'folder');
        if (match) {
            parentId = match._id;
        } else {
            // Auto-create intermediate directories
            parentId = await convex.mutation(api.files.createFileOrFolder, {
                projectId,
                name: seg,
                type: 'folder',
                parentId,
            });
        }
    }

    await convex.mutation(api.files.createFileOrFolder, {
        projectId,
        name,
        type: isFolder ? 'folder' : 'file',
        parentId,
        content: isFolder ? undefined : '',
    });

    return NextResponse.json({ success: true });
}

// ── Action: delete_file ───────────────────────────────────────────────────────

async function handleDelete(body: Record<string, unknown>, projectId: Id<'projects'>) {
    const filePath = body.path as string | undefined;
    if (!filePath) return err("Missing 'path'");

    const fileId = await resolvePathToId(projectId, filePath);
    if (!fileId) return err(`File not found: ${filePath}`, 404);

    // convex/files.ts deleteFileOrFolder already handles recursive deletion
    await convex.mutation(api.files.deleteFileOrFolder, { id: fileId });

    return NextResponse.json({ success: true });
}

// ── Action: search_in_file ────────────────────────────────────────────────────

async function handleSearchInFile(params: URLSearchParams, projectId: Id<'projects'>) {
    const filePath = params.get('path');
    const query = params.get('query');
    const isRegex = params.get('isRegex') === 'true';

    if (!filePath) return err("Missing 'path'");
    if (!query) return err("Missing 'query'");

    const fileId = await resolvePathToId(projectId, filePath);
    if (!fileId) return err(`File not found: ${filePath}`, 404);

    const file = await convex.query(api.files.getFile, { fileId });
    if (!file || file.type !== 'file') return err(`Not a file: ${filePath}`, 404);

    const lines = (file.content ?? '').split('\n');

    let pattern: RegExp;
    try {
        pattern = isRegex
            ? new RegExp(query)
            : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    } catch {
        return err('Invalid regex pattern');
    }

    const matchingLines = lines
        .map((line: string, i: number) => (pattern.test(line) ? i + 1 : null))
        .filter((n: number | null): n is number => n !== null);

    return NextResponse.json({ matchingLines });
}

// ── Action: search_files ──────────────────────────────────────────────────────
// Recursively walks the Convex file tree and greps each file's content.

async function handleSearch(params: URLSearchParams, projectId: Id<'projects'>) {
    const query = params.get('query');
    const isRegex = params.get('isRegex') === 'true';
    const includePattern = params.get('include') ?? undefined;

    if (!query) return err("Missing 'query'");

    let pattern: RegExp;
    try {
        pattern = isRegex
            ? new RegExp(query)
            : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    } catch {
        return err('Invalid regex pattern');
    }

    const MAX_HITS = 50;
    const results: string[] = [];

    // Recursive BFS over the Convex file tree
    const walk = async (parentId: Id<'files'> | undefined, prefix: string) => {
        if (results.length >= MAX_HITS) return;

        const children = await convex.query(api.files.getFolderFiles, { projectId, parentId });

        for (const child of children) {
            if (results.length >= MAX_HITS) break;
            const childPath = prefix ? `${prefix}/${child.name}` : child.name;

            if (child.type === 'folder') {
                await walk(child._id, childPath);
            } else {
                // Apply include pattern filter if provided
                if (includePattern) {
                    const match = includePattern.replace(/\*/g, '.*');
                    if (!new RegExp(match).test(child.name)) continue;
                }
                if (child.content && pattern.test(child.content)) {
                    results.push(childPath);
                }
            }
        }
    };

    await walk(undefined, '');

    return NextResponse.json({
        filePaths: results,
        hasMore: results.length >= MAX_HITS,
    });
}

// ── Action: list_directory ────────────────────────────────────────────────────

async function handleList(params: URLSearchParams, projectId: Id<'projects'>) {
    const dirPath = params.get('path');

    // If no path or '/' or '.', list root
    let parentId: Id<'files'> | undefined = undefined;

    if (dirPath && dirPath !== '/' && dirPath !== '.') {
        const dirId = await resolvePathToId(projectId, dirPath);
        if (!dirId) return err(`Directory not found: ${dirPath}`, 404);
        parentId = dirId;
    }

    const children = await convex.query(api.files.getFolderFiles, { projectId, parentId });

    const entries = children.map((f: { name: string; _id: Id<'files'>; type: string }) => ({
        name: f.name,
        path: dirPath ? `${dirPath}/${f.name}` : f.name,
        isDirectory: f.type === 'folder',
        isSymbolicLink: false, // Convex has no symlinks
    }));

    return NextResponse.json({ entries });
}

// ── Action: run_terminal ──────────────────────────────────────────────────────
// Web IDEs can't run arbitrary shell commands in the user's OS.
// This is a stub that returns a clear "not supported" message.
// If you need terminal support, implement it via a separate execution sandbox
// (e.g., an E2B sandbox, Modal, or a self-hosted runner).

async function handleTerminal(body: Record<string, unknown>) {
    const command = body.command as string | undefined;
    if (!command) return err("Missing 'command'");

    return NextResponse.json({
        output: `[Terminal not available in web IDE]\nCommand: ${command}\n\nTo enable terminal support, connect an execution sandbox (E2B, Modal, etc.)`,
        exitCode: 1,
        timedOut: false,
    });
}
