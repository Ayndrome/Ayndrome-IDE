// 'use client';

// import { useEffect } from "react";
// import { Project } from "@/src/types/types";
// import { useIDEStore } from "@/src/store/ide-store";
// import { IDENavbar } from "./IDENavbar";
// import { FileExplorer } from "./FileExplorer";
// import { EditorPane } from "./EditorPane";
// import { PreviewPane } from "./PreviewPane";
// import {
//     ResizablePanelGroup,
//     ResizablePanel,
//     ResizableHandle,
// } from "@/components/ui/resizable";

// interface IDEWorkspaceProps {
//     project: Project;
// }

// export const IDEWorkspace = ({ project }: IDEWorkspaceProps) => {
//     const { viewMode, setProject } = useIDEStore();

//     // Seed store with the current project on mount / project change
//     useEffect(() => {
//         setProject(project._id, project.name);
//     }, [project._id, project.name, setProject]);

//     return (
//         <div className="flex flex-col h-full w-full overflow-hidden">
//             {/* ── Navbar — reads/writes store directly ── */}
//             <IDENavbar project={project} />

//             {/* ── Workspace ── */}
//             <div className="flex flex-1 overflow-hidden">
//                 {(viewMode === "code" || viewMode === "split") && (
//                     <ResizablePanelGroup orientation="horizontal" className="flex-1 h-full">

//                         <ResizablePanel
//                             defaultSize={20}
//                             // minSize={0}
//                             // maxSize={75}
//                             // collapsible
//                             // collapsedSize={0}
//                             className="h-full min-w-0 overflow-hidden"
//                         >
//                             <FileExplorer
//                                 projectId={project._id}
//                                 projectName={project.name}
//                             />
//                         </ResizablePanel>

//                         <ResizableHandle withHandle />

//                         {viewMode === "code" ? (
//                             <ResizablePanel
//                                 defaultSize={80}
//                                 // minSize={0}
//                                 // collapsible
//                                 // collapsedSize={0}
//                                 className="h-full min-w-0 overflow-hidden"
//                             >
//                                 <EditorPane />
//                             </ResizablePanel>
//                         ) : (
//                             <>
//                                 <ResizablePanel
//                                     defaultSize={42}
//                                     // minSize={0}
//                                     // collapsible
//                                     // collapsedSize={0}
//                                     className="h-full min-w-0 overflow-hidden"
//                                 >
//                                     <EditorPane />
//                                 </ResizablePanel>

//                                 <ResizableHandle withHandle />

//                                 <ResizablePanel
//                                     defaultSize={40}
//                                     // minSize={0}
//                                     // collapsible
//                                     // collapsedSize={0}
//                                     className="h-full min-w-0 overflow-hidden"
//                                 >
//                                     <PreviewPane />
//                                 </ResizablePanel>
//                             </>
//                         )}
//                     </ResizablePanelGroup>
//                 )}

//                 {viewMode === "preview" && (
//                     <div className="flex-1 h-full">
//                         <PreviewPane />
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };


// 'use client';
// // IDEWorkspace.tsx — updated to initialize chat store with workspaceId

// import { useEffect } from "react";
// import { useConvex } from "convex/react";
// import { Project } from "@/src/types/types";
// import { useIDEStore } from "@/src/store/ide-store";
// import { useChatStore } from "@/src/store/chat-thread-store";
// import { IDENavbar } from "./IDENavbar";
// import { FileExplorer } from "./FileExplorer";
// import { EditorPane } from "./EditorPane";
// import { PreviewPane } from "./PreviewPane";
// import {
//     ResizablePanelGroup,
//     ResizablePanel,
//     ResizableHandle,
// } from "@/components/ui/resizable";

// interface IDEWorkspaceProps {
//     project: Project;
// }

// export const IDEWorkspace = ({ project }: IDEWorkspaceProps) => {
//     const { viewMode, setProject } = useIDEStore();
//     const { initialize, isLoaded } = useChatStore();
//     const convex = useConvex();

//     // Seed IDE store with project context
//     useEffect(() => {
//         setProject(project._id, project.name);
//     }, [project._id, project.name, setProject]);

//     // Initialize chat store with workspaceId
//     // project._id acts as workspaceId — it uniquely identifies this workspace
//     // and scopes all chat threads, tool calls, and agent context
//     useEffect(() => {
//         if (!project._id) return;
//         initialize(convex, project._id as string);
//     }, [project._id, convex, initialize]);

//     return (
//         <div className="flex flex-col h-full w-full overflow-hidden">
//             <IDENavbar project={project} />

//             <div className="flex flex-1 overflow-hidden">
//                 {(viewMode === "code" || viewMode === "split") && (
//                     <ResizablePanelGroup
//                         orientation="horizontal"
//                         className="flex-1 h-full"
//                     >
//                         <ResizablePanel
//                             defaultSize={20}
//                             className="h-full min-w-0 overflow-hidden"
//                         >
//                             <FileExplorer
//                                 projectId={project._id}
//                                 projectName={project.name}
//                             />
//                         </ResizablePanel>

//                         <ResizableHandle withHandle />

//                         {viewMode === "code" ? (
//                             <ResizablePanel
//                                 defaultSize={80}
//                                 className="h-full min-w-0 overflow-hidden"
//                             >
//                                 <EditorPane />
//                             </ResizablePanel>
//                         ) : (
//                             <>
//                                 <ResizablePanel
//                                     defaultSize={42}
//                                     className="h-full min-w-0 overflow-hidden"
//                                 >
//                                     <EditorPane />
//                                 </ResizablePanel>

//                                 <ResizableHandle withHandle />

//                                 <ResizablePanel
//                                     defaultSize={40}
//                                     className="h-full min-w-0 overflow-hidden"
//                                 >
//                                     <PreviewPane />
//                                 </ResizablePanel>
//                             </>
//                         )}
//                     </ResizablePanelGroup>
//                 )}

//                 {viewMode === "preview" && (
//                     <div className="flex-1 h-full">
//                         <PreviewPane />
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };


// Fix: Convex workspace provisioned FIRST, its _id used as disk key

// 'use client';

// import { useEffect, useRef, useCallback, useState } from "react";
// import { useConvex, useMutation } from "convex/react";
// import { api } from "@/convex/_generated/api";
// import { Id } from "@/convex/_generated/dataModel";
// import { Project } from "@/src/types/types";
// import { useIDEStore } from "@/src/store/ide-store";
// import { useChatStore } from "@/src/store/chat-thread-store";
// import { IDENavbar } from "./IDENavbar";
// import { FileExplorer } from "./FileExplorer";
// import { EditorPane } from "./EditorPane";
// import { PreviewPane } from "./PreviewPane";
// import { TerminalPanel } from "./TerminalPanel";
// import {
//     ResizablePanelGroup,
//     ResizablePanel,
//     ResizableHandle,
// } from "@/components/ui/resizable";

// interface IDEWorkspaceProps {
//     project: Project;
// }

// export const IDEWorkspace = ({ project }: IDEWorkspaceProps) => {
//     const {
//         viewMode,
//         setProject,
//         bottomPanel,
//         bottomPanelHeight,
//         setBottomPanelHeight,
//     } = useIDEStore();
//     const { initialize } = useChatStore();
//     const convex = useConvex();
//     const provisionInConvex = useMutation(api.workspaces.provision);

//     const [workspaceId, setWorkspaceId] =
//         useState<Id<"workspaces"> | null>(null);

//     // ── Drag handle ───────────────────────────────────────────────────────────
//     const dragging = useRef(false);
//     const dragStartY = useRef(0);
//     const dragStartH = useRef(0);

//     const onDragStart = useCallback((e: React.MouseEvent) => {
//         dragging.current = true;
//         dragStartY.current = e.clientY;
//         dragStartH.current = bottomPanelHeight;
//         e.preventDefault();
//     }, [bottomPanelHeight]);

//     useEffect(() => {
//         const onMove = (e: MouseEvent) => {
//             if (!dragging.current) return;
//             const delta = dragStartY.current - e.clientY;
//             setBottomPanelHeight(
//                 Math.min(600, Math.max(80, dragStartH.current + delta))
//             );
//         };
//         const onUp = () => { dragging.current = false; };
//         window.addEventListener("mousemove", onMove);
//         window.addEventListener("mouseup", onUp);
//         return () => {
//             window.removeEventListener("mousemove", onMove);
//             window.removeEventListener("mouseup", onUp);
//         };
//     }, [setBottomPanelHeight]);

//     // ── Project initialization ─────────────────────────────────────────────────
//     useEffect(() => {
//         setProject(project._id, project.name);
//     }, [project._id, project.name, setProject]);

//     // ── Workspace provisioning ─────────────────────────────────────────────────
//     // Order matters:
//     //   1. Upsert workspace record in Convex → get workspace._id
//     //   2. POST /api/workspace with workspace._id as the disk key
//     //   3. Initialize chat store with workspace._id

//     useEffect(() => {
//         if (!project._id) return;
//         let cancelled = false;

//         const provision = async () => {
//             try {
//                 // ── Step 1: Get or create Convex workspace record ──────────────
//                 // We don't know diskPath yet so pass a placeholder.
//                 // The mutation is idempotent — returns existing _id if already
//                 // provisioned for this project.
//                 const wid = await provisionInConvex({
//                     projectId: project._id,
//                     name: project.name,
//                     diskPath: "pending",   // updated in step 2
//                     gitBranch: "main",
//                 });

//                 if (cancelled) return;

//                 // ── Step 2: POST to backend using workspace._id as disk key ───
//                 // The backend uses wid as the folder name so disk path and
//                 // Convex workspace _id always match.
//                 const provRes = await fetch("/api/workspace?action=provision", {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({
//                         workspaceId: wid as string,
//                         projectName: project.name,
//                         convexWorkspaceId: wid as string,
//                         projectId: project._id as string,  // ← actual project _id, NOT wid
//                     }),
//                 });
//                 if (!provRes.ok) {
//                     console.error(
//                         "[IDEWorkspace] Container provision failed:",
//                         await provRes.text()
//                     );
//                     return;
//                 }

//                 const { diskPath, gitBranch } = await provRes.json();

//                 if (cancelled) return;

//                 // ── Step 3: Update Convex record with real diskPath ────────────
//                 await provisionInConvex({
//                     projectId: project._id,
//                     name: project.name,
//                     diskPath,
//                     gitBranch: gitBranch ?? "main",
//                 });

//                 if (cancelled) return;

//                 setWorkspaceId(wid);

//                 // ── Step 4: Initialize chat with workspace._id ─────────────────
//                 initialize(convex, wid as string);

//             } catch (err) {
//                 console.error("[IDEWorkspace] Provision error:", err);
//             }
//         };

//         provision();
//         return () => { cancelled = true; };

//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [project._id]);

//     const showTerminal = bottomPanel === "terminal";

//     if (!workspaceId) {
//         return (
//             <div className="flex flex-col h-full w-full overflow-hidden">
//                 <IDENavbar project={project} />
//                 <div className="flex flex-1 items-center justify-center">
//                     <div className="flex flex-col items-center gap-3">
//                         <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
//                         <p className="text-xs text-muted-foreground">
//                             Starting workspace…
//                         </p>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div className="flex flex-col h-full w-full overflow-hidden">
//             <IDENavbar project={project} />

//             <div className="flex flex-col flex-1 overflow-hidden">
//                 <div className="flex flex-1 overflow-hidden min-h-0">
//                     {(viewMode === "code" || viewMode === "split") && (
//                         <ResizablePanelGroup
//                             orientation="horizontal"
//                             className="flex-1 h-full"
//                         >
//                             <ResizablePanel
//                                 defaultSize={20}
//                                 className="h-full min-w-0 overflow-hidden"
//                             >
//                                 <FileExplorer
//                                     projectId={project._id}
//                                     workspaceId={workspaceId}
//                                     projectName={project.name}
//                                 />
//                             </ResizablePanel>

//                             <ResizableHandle withHandle />

//                             {viewMode === "code" ? (
//                                 <ResizablePanel
//                                     defaultSize={80}
//                                     className="h-full min-w-0 overflow-hidden"
//                                 >
//                                     <EditorPane />
//                                 </ResizablePanel>
//                             ) : (
//                                 <>
//                                     <ResizablePanel
//                                         defaultSize={42}
//                                         className="h-full min-w-0 overflow-hidden"
//                                     >
//                                         <EditorPane />
//                                     </ResizablePanel>
//                                     <ResizableHandle withHandle />
//                                     <ResizablePanel
//                                         defaultSize={40}
//                                         className="h-full min-w-0 overflow-hidden"
//                                     >
//                                         <PreviewPane />
//                                     </ResizablePanel>
//                                 </>
//                             )}
//                         </ResizablePanelGroup>
//                     )}

//                     {viewMode === "preview" && (
//                         <div className="flex-1 h-full">
//                             <PreviewPane />
//                         </div>
//                     )}
//                 </div>

//                 {showTerminal && (
//                     <>
//                         <div
//                             onMouseDown={onDragStart}
//                             className="flex items-center justify-center h-[4px] shrink-0 cursor-row-resize group"
//                             style={{ backgroundColor: "#30363d" }}
//                         >
//                             <div
//                                 className="w-10 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
//                                 style={{ backgroundColor: "#58a6ff" }}
//                             />
//                         </div>
//                         <div
//                             className="shrink-0 overflow-hidden"
//                             style={{ height: `${bottomPanelHeight}px` }}
//                         >
//                             <TerminalPanel
//                                 workspaceId={workspaceId as string}
//                                 className="h-full"
//                             />
//                         </div>
//                     </>
//                 )}
//             </div>
//         </div>
//     );
// };



// src/app/features/ide/components/IDEWorkspace.tsx
// Phase 10: new layout — sessions sidebar + chat + editor + file tree
// Structure: [SessionSidebar?] | [ChatPanel] | [EditorPane] | [FileExplorer]
// Chat panel is the hero. Editor and file tree on the right.
// Sessions sidebar is toggleable from navbar.

'use client';

import { useEffect, useRef, useCallback, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Project } from "@/src/types/types";
import { useIDEStore } from "@/src/store/ide-store";
import { useChatStore } from "@/src/store/chat-thread-store";
import { IDENavbar } from "./IDENavbar";
import { SessionSidebar } from "./SessionSidebar";
import { FileExplorer } from "./FileExplorer";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { TerminalPanel } from "./TerminalPanel";
import { ChatPanel } from "../extensions/chat/ChatPanel";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";

const C = {
    border: "#3c3f41",
    bg: "#1e1f22",
} as const;

interface IDEWorkspaceProps {
    project: Project;
}

export const IDEWorkspace = ({ project }: IDEWorkspaceProps) => {
    const {
        viewMode,
        setProject,
        bottomPanel,
        bottomPanelHeight,
        setBottomPanelHeight,
        showSessionSidebar,
    } = useIDEStore();

    const { initialize } = useChatStore();
    const convex = useConvex();
    const provisionInConvex = useMutation(api.workspaces.provision);

    const [workspaceId, setWorkspaceId] =
        useState<Id<"workspaces"> | null>(null);

    // ── Drag handle for terminal ──────────────────────────────────────────────
    const dragging = useRef(false);
    const dragStartY = useRef(0);
    const dragStartH = useRef(0);

    const onDragStart = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        dragStartY.current = e.clientY;
        dragStartH.current = bottomPanelHeight;
        e.preventDefault();
    }, [bottomPanelHeight]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const delta = dragStartY.current - e.clientY;
            setBottomPanelHeight(
                Math.min(600, Math.max(80, dragStartH.current + delta))
            );
        };
        const onUp = () => { dragging.current = false; };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [setBottomPanelHeight]);

    // ── Project init ──────────────────────────────────────────────────────────
    useEffect(() => {
        setProject(project._id, project.name);
    }, [project._id, project.name, setProject]);

    // ── Workspace provisioning ────────────────────────────────────────────────
    useEffect(() => {
        if (!project._id) return;
        let cancelled = false;

        const provision = async () => {
            try {
                const wid = await provisionInConvex({
                    projectId: project._id,
                    name: project.name,
                    diskPath: "pending",
                    gitBranch: "main",
                });

                if (cancelled) return;

                const provRes = await fetch("/api/workspace?action=provision", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId: wid as string,
                        projectName: project.name,
                        convexWorkspaceId: wid as string,
                        projectId: project._id as string,
                    }),
                });

                if (!provRes.ok) {
                    console.error("[IDEWorkspace] Provision failed:", await provRes.text());
                    return;
                }

                const { diskPath, gitBranch } = await provRes.json();
                if (cancelled) return;

                await provisionInConvex({
                    projectId: project._id,
                    name: project.name,
                    diskPath,
                    gitBranch: gitBranch ?? "main",
                });

                if (cancelled) return;

                setWorkspaceId(wid);
                initialize(convex, wid as string);

            } catch (err) {
                console.error("[IDEWorkspace] Provision error:", err);
            }
        };

        provision();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project._id]);

    const showTerminal = bottomPanel === "terminal";

    // ── Loading state ─────────────────────────────────────────────────────────
    if (!workspaceId) {
        return (
            <div
                className="flex flex-col h-full w-full overflow-hidden"
                style={{ backgroundColor: C.bg }}
            >
                <IDENavbar project={project} />
                <div className="flex flex-1 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="size-5 border-2 border-t-transparent rounded-full animate-spin"
                            style={{ borderColor: "#59a869", borderTopColor: "transparent" }}
                        />
                        <p className="text-[11px]" style={{ color: "#6f737a" }}>
                            Starting workspace…
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Main layout ───────────────────────────────────────────────────────────
    // Columns (left to right):
    //   1. SessionSidebar  — 180px fixed, toggleable
    //   2. ChatPanel       — flexible, ~380px default (the hero)
    //   3. EditorPane      — flexible (code/split view)
    //   4. FileExplorer    — 200px fixed (right side, like reference)

    return (
        <div
            className="flex flex-col h-full w-full overflow-hidden"
            style={{ backgroundColor: C.bg }}
        >
            <IDENavbar project={project} />

            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
                {/* Main row */}
                <div className="flex flex-1 overflow-hidden min-h-0">
                    <ResizablePanelGroup
                        orientation="horizontal"
                        className="flex-1 h-full"
                    >
                        {/* ── Session sidebar ── */}
                        {showSessionSidebar && (
                            <>
                                <ResizablePanel
                                    defaultSize={13}
                                    // minSize={10}
                                    // maxSize={20}
                                    className="h-full min-w-0 overflow-hidden"
                                >
                                    <SessionSidebar />
                                </ResizablePanel>
                                <ResizableHandle />
                            </>
                        )}

                        {/* ── Chat panel (hero) ── */}
                        <ResizablePanel
                            defaultSize={showSessionSidebar ? 27 : 32}
                            // minSize={22}
                            // maxSize={55}
                            className="h-full min-w-0 overflow-hidden"
                        >
                            {/* Chat panel bg = card color (#2b2d30) */}
                            <div
                                className="h-full w-full"
                                style={{ backgroundColor: "#2b2d30" }}
                            >
                                <ChatPanel />
                            </div>
                        </ResizablePanel>

                        <ResizableHandle />

                        {/* ── Editor area ── */}
                        {viewMode === "preview" ? (
                            <ResizablePanel
                                defaultSize={showSessionSidebar ? 46 : 53}
                                className="h-full min-w-0 overflow-hidden"
                            >
                                <PreviewPane />
                            </ResizablePanel>
                        ) : viewMode === "split" ? (
                            <>
                                <ResizablePanel
                                    defaultSize={28}
                                    // minSize={18}
                                    className="h-full min-w-0 overflow-hidden"
                                >
                                    <EditorPane />
                                </ResizablePanel>
                                <ResizableHandle />
                                <ResizablePanel
                                    defaultSize={17}
                                    // minSize={10}
                                    className="h-full min-w-0 overflow-hidden"
                                >
                                    <PreviewPane />
                                </ResizablePanel>
                            </>
                        ) : (
                            // code mode — editor takes remaining space
                            <ResizablePanel
                                defaultSize={showSessionSidebar ? 46 : 53}
                                // minSize={20}
                                className="h-full min-w-0 overflow-hidden"
                            >
                                <EditorPane />
                            </ResizablePanel>
                        )}

                        <ResizableHandle />

                        {/* ── File explorer (far right) ── */}
                        <ResizablePanel
                            defaultSize={14}
                            // minSize={10}
                            // maxSize={25}
                            className="h-full min-w-0 overflow-hidden"
                        >
                            <FileExplorer
                                projectId={project._id}
                                workspaceId={workspaceId}
                                projectName={project.name}
                            />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </div>

                {/* ── Terminal strip ── */}
                {showTerminal && (
                    <>
                        <div
                            onMouseDown={onDragStart}
                            className="flex items-center justify-center h-[4px] shrink-0 cursor-row-resize group"
                            style={{ backgroundColor: C.border }}
                        >
                            <div
                                className="w-10 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ backgroundColor: "#59a869" }}
                            />
                        </div>
                        <div
                            className="shrink-0 overflow-hidden"
                            style={{ height: `${bottomPanelHeight}px` }}
                        >
                            <TerminalPanel
                                workspaceId={workspaceId as string}
                                className="h-full"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};