// // src/app/api/workspace/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import {
//     getOrCreateSandbox,
//     stopSandbox,
//     destroySandbox,
//     listSandboxes,
// } from "@/src/server/sandbox/sandbox-manager";
// import {
//     registerWorkspace,
//     getWorkspacePathSafe,
//     deleteWorkspace,
//     touchWorkspace,
// } from "@/src/server/workspace/local-registry";
// import {
//     initWorkspace,
//     getGitStatus,
// } from "@/src/server/workspace/git-manager";
// import { saveOnClose } from "@/src/server/workspace/auto-save";
// import {
//     markWorkspaceActive,
//     markWorkspaceInactive,
// } from "@/src/server/workspace/auto-save";

// // ── POST ──────────────────────────────────────────────────────────────────────

// export async function POST(req: NextRequest) {
//     const url = new URL(req.url);
//     const action = url.searchParams.get("action") ?? "provision";

//     try {
//         const body = await req.json();

//         // ── provision ─────────────────────────────────────────────────────────
//         if (action === "provision") {
//             const { projectId, projectName, gitRemoteUrl } = body as {
//                 projectId: string;
//                 projectName: string;
//                 gitRemoteUrl?: string;
//             };

//             if (!projectId || !projectName) {
//                 return NextResponse.json(
//                     { error: "projectId and projectName are required" },
//                     { status: 400 }
//                 );
//             }

//             // projectId acts as the workspaceId for local disk registry
//             // so each Convex project maps to exactly one workspace folder
//             const workspaceId = projectId;

//             // Register workspace folder on disk
//             const hostPath = registerWorkspace(workspaceId, projectName);

//             // Git init (idempotent)
//             const gitResult = await initWorkspace(workspaceId, projectName);
//             if (!gitResult.success) {
//                 console.warn(`[API/workspace] Git init warning:`, gitResult.error);
//             }

//             // Start Docker container (or wake sleeping one)
//             const sandbox = await getOrCreateSandbox(workspaceId, projectName);

//             // Mark active for auto-save loop
//             markWorkspaceActive(workspaceId);

//             // Get git status for Convex workspace record
//             const gitStatus = await getGitStatus(workspaceId);

//             return NextResponse.json({
//                 workspaceId,
//                 hostPath,
//                 diskPath: hostPath,
//                 containerId: sandbox.containerId.slice(0, 12),
//                 containerStatus: "running",
//                 gitBranch: gitStatus.branch ?? "main",
//                 lastCommitSha: gitStatus.commitSha ?? null,
//                 isDirty: gitStatus.isDirty ?? false,
//             });
//         }

//         // ── close ─────────────────────────────────────────────────────────────
//         if (action === "close") {
//             const { workspaceId } = body as { workspaceId: string };

//             if (!workspaceId) {
//                 return NextResponse.json(
//                     { error: "workspaceId is required" },
//                     { status: 400 }
//                 );
//             }

//             await saveOnClose(workspaceId);
//             await stopSandbox(workspaceId);
//             markWorkspaceInactive(workspaceId);

//             return NextResponse.json({ success: true, status: "stopped" });
//         }

//         // ── touch (keepalive) ─────────────────────────────────────────────────
//         if (action === "touch") {
//             const { workspaceId } = body as { workspaceId: string };
//             if (workspaceId) touchWorkspace(workspaceId);
//             return NextResponse.json({ success: true });
//         }

//         return NextResponse.json(
//             { error: `Unknown action: ${action}` },
//             { status: 400 }
//         );

//     } catch (err: any) {
//         console.error(`[API/workspace] POST error:`, err.message);
//         return NextResponse.json(
//             { error: err.message ?? "Internal server error" },
//             { status: 500 }
//         );
//     }
// }

// // ── GET ───────────────────────────────────────────────────────────────────────

// export async function GET(req: NextRequest) {
//     const url = new URL(req.url);
//     const workspaceId = url.searchParams.get("workspaceId");
//     const listAll = url.searchParams.get("list") === "true";

//     try {
//         // Admin — list all sandboxes
//         if (listAll) {
//             const sandboxes = await listSandboxes();
//             return NextResponse.json({ sandboxes });
//         }

//         if (!workspaceId) {
//             return NextResponse.json(
//                 { error: "workspaceId is required" },
//                 { status: 400 }
//             );
//         }

//         const hostPath = getWorkspacePathSafe(workspaceId);
//         if (!hostPath) {
//             return NextResponse.json(
//                 { containerStatus: "not_created", workspaceId },
//                 { status: 200 }
//             );
//         }

//         const gitStatus = await getGitStatus(workspaceId);

//         return NextResponse.json({
//             workspaceId,
//             hostPath,
//             diskPath: hostPath,
//             containerStatus: "running",
//             gitBranch: gitStatus.branch ?? "main",
//             lastCommitSha: gitStatus.commitSha ?? null,
//             isDirty: gitStatus.isDirty ?? false,
//             changedFiles: gitStatus.fileStatuses ?? [],
//         });

//     } catch (err: any) {
//         console.error(`[API/workspace] GET error:`, err.message);
//         return NextResponse.json(
//             { error: err.message },
//             { status: 500 }
//         );
//     }
// }

// // ── DELETE ────────────────────────────────────────────────────────────────────

// export async function DELETE(req: NextRequest) {
//     try {
//         const url = new URL(req.url);
//         const workspaceId = url.searchParams.get("workspaceId");
//         const hardDelete = url.searchParams.get("hard") === "true";

//         if (!workspaceId) {
//             return NextResponse.json(
//                 { error: "workspaceId is required" },
//                 { status: 400 }
//             );
//         }

//         markWorkspaceInactive(workspaceId);
//         await destroySandbox(workspaceId);

//         if (hardDelete) {
//             deleteWorkspace(workspaceId);
//         }

//         return NextResponse.json({ success: true, workspaceId });

//     } catch (err: any) {
//         console.error(`[API/workspace] DELETE error:`, err.message);
//         return NextResponse.json(
//             { error: err.message },
//             { status: 500 }
//         );
//     }
// }

// src/app/api/workspace/route.ts — provision uses workspaceId from body

// import { NextRequest, NextResponse } from "next/server";
// import {
//     getOrCreateSandbox,
//     stopSandbox,
//     destroySandbox,
//     listSandboxes,
// } from "@/src/server/sandbox/sandbox-manager";
// import {
//     registerWorkspace,
//     getWorkspacePathSafe,
//     deleteWorkspace,
//     touchWorkspace,
// } from "@/src/server/workspace/local-registry";
// import {
//     initWorkspace,
//     getGitStatus,
// } from "@/src/server/workspace/git-manager";
// import { saveOnClose } from "@/src/server/workspace/auto-save";
// import {
//     markWorkspaceActive,
//     markWorkspaceInactive,
// } from "@/src/server/workspace/auto-save";

// export async function POST(req: NextRequest) {
//     const url = new URL(req.url);
//     const action = url.searchParams.get("action") ?? "provision";

//     try {
//         const body = await req.json();

//         // ── provision ─────────────────────────────────────────────────────────
//         if (action === "provision") {
//             const { workspaceId, projectName, gitRemoteUrl } = body as {
//                 workspaceId: string;  // ← Convex workspace._id passed from frontend
//                 projectName: string;
//                 gitRemoteUrl?: string;
//             };

//             if (!workspaceId || !projectName) {
//                 return NextResponse.json(
//                     { error: "workspaceId and projectName are required" },
//                     { status: 400 }
//                 );
//             }

//             // Register on disk using workspace._id as folder name
//             // Disk path = ~/web-ide-workspaces/<workspace._id>
//             const hostPath = registerWorkspace(workspaceId, projectName);

//             // Git init
//             const gitResult = await initWorkspace(workspaceId, projectName);
//             if (!gitResult.success) {
//                 console.warn(`[API/workspace] Git init warning:`, gitResult.error);
//             }

//             // Start container
//             const sandbox = await getOrCreateSandbox(workspaceId, projectName);
//             markWorkspaceActive(workspaceId);

//             const gitStatus = await getGitStatus(workspaceId);

//             return NextResponse.json({
//                 workspaceId,
//                 hostPath,
//                 diskPath: hostPath,
//                 containerId: sandbox.containerId.slice(0, 12),
//                 containerStatus: "running",
//                 gitBranch: gitStatus.branch ?? "main",
//                 lastCommitSha: gitStatus.commitSha ?? null,
//                 isDirty: gitStatus.isDirty ?? false,
//             });
//         }

//         // ── close ─────────────────────────────────────────────────────────────
//         if (action === "close") {
//             const { workspaceId } = body as { workspaceId: string };
//             if (!workspaceId) {
//                 return NextResponse.json(
//                     { error: "workspaceId is required" },
//                     { status: 400 }
//                 );
//             }
//             await saveOnClose(workspaceId);
//             await stopSandbox(workspaceId);
//             markWorkspaceInactive(workspaceId);
//             return NextResponse.json({ success: true, status: "stopped" });
//         }

//         // ── touch ─────────────────────────────────────────────────────────────
//         if (action === "touch") {
//             const { workspaceId } = body as { workspaceId: string };
//             if (workspaceId) touchWorkspace(workspaceId);
//             return NextResponse.json({ success: true });
//         }

//         return NextResponse.json(
//             { error: `Unknown action: ${action}` },
//             { status: 400 }
//         );

//     } catch (err: any) {
//         console.error(`[API/workspace] POST error:`, err.message);
//         return NextResponse.json(
//             { error: err.message ?? "Internal server error" },
//             { status: 500 }
//         );
//     }
// }

// export async function GET(req: NextRequest) {
//     const url = new URL(req.url);
//     const workspaceId = url.searchParams.get("workspaceId");
//     const listAll = url.searchParams.get("list") === "true";

//     try {
//         if (listAll) {
//             const sandboxes = await listSandboxes();
//             return NextResponse.json({ sandboxes });
//         }

//         if (!workspaceId) {
//             return NextResponse.json(
//                 { error: "workspaceId is required" },
//                 { status: 400 }
//             );
//         }

//         const hostPath = getWorkspacePathSafe(workspaceId);
//         if (!hostPath) {
//             return NextResponse.json(
//                 { containerStatus: "not_created", workspaceId },
//                 { status: 200 }
//             );
//         }

//         const gitStatus = await getGitStatus(workspaceId);

//         return NextResponse.json({
//             workspaceId,
//             hostPath,
//             diskPath: hostPath,
//             containerStatus: "running",
//             gitBranch: gitStatus.branch ?? "main",
//             lastCommitSha: gitStatus.commitSha ?? null,
//             isDirty: gitStatus.isDirty ?? false,
//             changedFiles: gitStatus.fileStatuses ?? [],
//         });

//     } catch (err: any) {
//         console.error(`[API/workspace] GET error:`, err.message);
//         return NextResponse.json(
//             { error: err.message },
//             { status: 500 }
//         );
//     }
// }

// export async function DELETE(req: NextRequest) {
//     try {
//         const url = new URL(req.url);
//         const workspaceId = url.searchParams.get("workspaceId");
//         const hardDelete = url.searchParams.get("hard") === "true";

//         if (!workspaceId) {
//             return NextResponse.json(
//                 { error: "workspaceId is required" },
//                 { status: 400 }
//             );
//         }

//         markWorkspaceInactive(workspaceId);
//         await destroySandbox(workspaceId);
//         if (hardDelete) deleteWorkspace(workspaceId);

//         return NextResponse.json({ success: true, workspaceId });

//     } catch (err: any) {
//         console.error(`[API/workspace] DELETE error:`, err.message);
//         return NextResponse.json(
//             { error: err.message },
//             { status: 500 }
//         );
//     }
// }


// src/app/api/workspace/route.ts — add watcher start/stop

import { NextRequest, NextResponse } from "next/server";
import {
    getOrCreateSandbox, stopSandbox,
    destroySandbox, listSandboxes,
} from "@/src/server/sandbox/sandbox-manager";
import {
    registerWorkspace, getWorkspacePathSafe,
    deleteWorkspace, touchWorkspace,
} from "@/src/server/workspace/local-registry";
import {
    initWorkspace, getGitStatus,
} from "@/src/server/workspace/git-manager";
import { saveOnClose } from "@/src/server/workspace/auto-save";
import {
    markWorkspaceActive, markWorkspaceInactive,
} from "@/src/server/workspace/auto-save";
import {
    startWatching, stopWatching,
} from "@/src/server/workspace/workspace-watcher";

import { killAllSessions } from "@/src/server/sandbox/persistent-terminal-manager";


export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "provision";

    try {
        const body = await req.json();

        if (action === "provision") {
            const {
                workspaceId, projectName,
                convexWorkspaceId, projectId,   // ← new fields from IDEWorkspace
                gitRemoteUrl,
            } = body as {
                workspaceId: string;
                projectName: string;
                convexWorkspaceId?: string;
                projectId?: string;
                gitRemoteUrl?: string;
            };

            if (!workspaceId || !projectName) {
                return NextResponse.json(
                    { error: "workspaceId and projectName are required" },
                    { status: 400 }
                );
            }

            const hostPath = registerWorkspace(workspaceId, projectName);
            const gitResult = await initWorkspace(workspaceId, projectName);
            if (!gitResult.success) {
                console.warn(`[API/workspace] Git init warning:`, gitResult.error);
            }

            const sandbox = await getOrCreateSandbox(workspaceId, projectName);
            markWorkspaceActive(workspaceId);

            // ── Start file watcher ─────────────────────────────────────────
            if (!convexWorkspaceId || !projectId) return "Error";
            startWatching(workspaceId, convexWorkspaceId, projectId);

            // Register metadata for watcher bridge
            // so it knows which Convex records to update
            if (convexWorkspaceId && projectId) {
                console.log(`[Workspace] Registering watcher meta:`, {
                    workspaceId,
                    convexWorkspaceId,
                    projectId,
                });
                // registerWorkspaceMeta(workspaceId, );
            }
            const gitStatus = await getGitStatus(workspaceId);

            return NextResponse.json({
                workspaceId,
                hostPath,
                diskPath: hostPath,
                containerId: sandbox.containerId.slice(0, 12),
                containerStatus: "running",
                gitBranch: gitStatus.branch ?? "main",
                lastCommitSha: gitStatus.commitSha ?? null,
                isDirty: gitStatus.isDirty ?? false,
            });
        }

        if (action === "close") {
            const { workspaceId } = body as { workspaceId: string };
            if (!workspaceId) {
                return NextResponse.json(
                    { error: "workspaceId is required" },
                    { status: 400 }
                );
            }

            await saveOnClose(workspaceId);
            await stopSandbox(workspaceId);
            await killAllSessions(workspaceId);
            await stopWatching(workspaceId);           // ← stop watcher on close
            // unregisterWorkspaceMeta(workspaceId);      // ← clean up bridge
            markWorkspaceInactive(workspaceId);

            return NextResponse.json({ success: true, status: "stopped" });
        }

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
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const listAll = url.searchParams.get("list") === "true";

    try {
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
        const gitStatus = await getGitStatus(workspaceId);
        return NextResponse.json({
            workspaceId,
            hostPath,
            diskPath: hostPath,
            containerStatus: "running",
            gitBranch: gitStatus.branch ?? "main",
            lastCommitSha: gitStatus.commitSha ?? null,
            isDirty: gitStatus.isDirty ?? false,
            changedFiles: gitStatus.fileStatuses ?? [],
        });
    } catch (err: any) {
        console.error(`[API/workspace] GET error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

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
        await destroySandbox(workspaceId);
        await stopWatching(workspaceId);
        // unregisterWorkspaceMeta(workspaceId);
        if (hardDelete) deleteWorkspace(workspaceId);

        return NextResponse.json({ success: true, workspaceId });
    } catch (err: any) {
        console.error(`[API/workspace] DELETE error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}