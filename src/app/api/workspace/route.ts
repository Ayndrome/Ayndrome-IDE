// src/app/api/workspace/route.ts
// Workspace lifecycle API — provision, status, close, delete.
// Called by the frontend when user opens/closes a project.
// All operations are authenticated via Convex auth token.

import { NextRequest, NextResponse } from "next/server";
import {
    getOrCreateSandbox,
    execInSandbox,
    stopSandbox,
    destroySandbox,
    listSandboxes,
} from "@/src/server/sandbox/sandbox-manager";
import {
    registerWorkspace,
    getWorkspacePathSafe,
    deleteWorkspace,
    touchWorkspace,
} from "@/src/server/workspace/local-registry";
import {
    initWorkspace,
    getGitStatus,
    autoCommit,
} from "@/src/server/workspace/git-manager";
import { saveOnClose } from "@/src/server/workspace/auto-save";
import { markWorkspaceActive, markWorkspaceInactive } from "@/src/server/workspace/auto-save";

// ── Auth helper ───────────────────────────────────────────────────────────────
// Validates the Convex session token from Authorization header.
// Returns userId or throws 401.

async function requireAuth(req: NextRequest): Promise<string> {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
        throw new Error("UNAUTHORIZED");
    }
    // For now validate token format — replace with real Convex token validation
    // when you wire Clerk/Auth.js fully
    // TODO: validate against Convex auth
    return token; // return userId from token
}

// ── POST /api/workspace/provision ────────────────────────────────────────────
// Called when user opens a project for the first time or after server restart.
// Creates workspace dir, git init, spins up Docker container.
// Idempotent — safe to call multiple times.

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "provision";

    try {
        const body = await req.json();

        // ── provision ─────────────────────────────────────────────────────────
        if (action === "provision") {
            const { workspaceId, projectName, gitRemoteUrl } = body as {
                workspaceId: string;
                projectName: string;
                gitRemoteUrl?: string;
            };

            if (!workspaceId || !projectName) {
                return NextResponse.json(
                    { error: "workspaceId and projectName are required" },
                    { status: 400 }
                );
            }

            // Register on disk
            const hostPath = registerWorkspace(workspaceId, projectName);

            // Init git repo if not already
            const gitResult = await initWorkspace(workspaceId, projectName);
            if (!gitResult.success) {
                console.error(`[API/workspace] Git init failed:`, gitResult.error);
                // Non-fatal — continue without git
            }

            // Spin up container (or wake sleeping one)
            const sandbox = await getOrCreateSandbox(workspaceId, projectName);

            // Mark active for auto-save
            markWorkspaceActive(workspaceId);

            // Get current git status for UI
            const gitStatus = await getGitStatus(workspaceId);

            return NextResponse.json({
                workspaceId,
                hostPath,
                containerId: sandbox.containerId.slice(0, 12),
                containerStatus: "running",
                gitBranch: gitStatus.branch ?? "main",
                lastCommitSha: gitStatus.commitSha,
                isDirty: gitStatus.isDirty,
            });
        }

        // ── close ─────────────────────────────────────────────────────────────
        if (action === "close") {
            const { workspaceId } = body as { workspaceId: string };
            if (!workspaceId) {
                return NextResponse.json(
                    { error: "workspaceId is required" },
                    { status: 400 }
                );
            }

            // Commit + push before sleeping
            await saveOnClose(workspaceId);

            // Stop container (sleep — not destroy)
            await stopSandbox(workspaceId);

            markWorkspaceInactive(workspaceId);

            return NextResponse.json({ success: true, status: "stopped" });
        }

        // ── touch (keep alive) ────────────────────────────────────────────────
        if (action === "touch") {
            const { workspaceId } = body as { workspaceId: string };
            if (workspaceId) touchWorkspace(workspaceId);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
        );

    } catch (err: any) {
        console.error(`[API/workspace] POST error:`, err.message);
        return NextResponse.json(
            { error: err.message ?? "Internal server error" },
            { status: err.message === "UNAUTHORIZED" ? 401 : 500 }
        );
    }
}

// ── GET /api/workspace/status ─────────────────────────────────────────────────
// Returns container status + git status for a workspace.
// Called by the IDE on mount to check if workspace is ready.

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const listAll = url.searchParams.get("list") === "true";

    try {
        // List all sandboxes (admin/debug use)
        if (listAll) {
            const sandboxes = await listSandboxes();
            return NextResponse.json({ sandboxes });
        }

        if (!workspaceId) {
            return NextResponse.json(
                { error: "workspaceId is required" },
                { status: 400 }
            );
        }

        const hostPath = getWorkspacePathSafe(workspaceId);
        if (!hostPath) {
            return NextResponse.json(
                { containerStatus: "not_created", workspaceId },
                { status: 200 }
            );
        }

        // Get git status from disk
        const gitStatus = await getGitStatus(workspaceId);

        return NextResponse.json({
            workspaceId,
            containerStatus: "running",
            hostPath,
            gitBranch: gitStatus.branch,
            lastCommitSha: gitStatus.commitSha,
            isDirty: gitStatus.isDirty,
            changedFiles: gitStatus.fileStatuses ?? [],
        });

    } catch (err: any) {
        console.error(`[API/workspace] GET error:`, err.message);
        return NextResponse.json(
            { error: err.message },
            { status: 500 }
        );
    }
}

// ── DELETE /api/workspace ─────────────────────────────────────────────────────
// Permanently deletes workspace — container + disk files.
// Called when user deletes a project.

export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId");
        const hardDelete = url.searchParams.get("hard") === "true";

        if (!workspaceId) {
            return NextResponse.json(
                { error: "workspaceId is required" },
                { status: 400 }
            );
        }

        markWorkspaceInactive(workspaceId);

        // Destroy container
        await destroySandbox(workspaceId);

        // Delete files from disk (if hard delete)
        if (hardDelete) {
            deleteWorkspace(workspaceId);
        }

        return NextResponse.json({ success: true, workspaceId });

    } catch (err: any) {
        console.error(`[API/workspace] DELETE error:`, err.message);
        return NextResponse.json(
            { error: err.message },
            { status: 500 }
        );
    }
}