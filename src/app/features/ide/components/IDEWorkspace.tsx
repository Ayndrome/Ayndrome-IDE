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


'use client';
// IDEWorkspace.tsx — with resizable bottom terminal panel

import { useEffect, useRef, useCallback } from "react";
import { useConvex } from "convex/react";
import { Project } from "@/src/types/types";
import { useIDEStore } from "@/src/store/ide-store";
import { useChatStore } from "@/src/store/chat-thread-store";
import { IDENavbar } from "./IDENavbar";
import { FileExplorer } from "./FileExplorer";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { TerminalPanel } from "./TerminalPanel";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";

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
        workspaceId,
    } = useIDEStore();
    const { initialize } = useChatStore();
    const convex = useConvex();

    // ── Drag handle state for terminal resize ─────────────────────────────────
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
            const newH = Math.min(600, Math.max(80, dragStartH.current + delta));
            setBottomPanelHeight(newH);
        };
        const onUp = () => { dragging.current = false; };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [setBottomPanelHeight]);

    // ── Project + chat store initialization ───────────────────────────────────

    useEffect(() => {
        setProject(project._id, project.name);
    }, [project._id, project.name, setProject]);

    useEffect(() => {
        if (!project._id) return;
        initialize(convex, project._id as string);
    }, [project._id, convex, initialize]);

    const showTerminal = bottomPanel === "terminal";

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">

            {/* ── Navbar ──────────────────────────────────────────────── */}
            <IDENavbar project={project} />

            {/* ── Main workspace area ─────────────────────────────────── */}
            <div className="flex flex-col flex-1 overflow-hidden">

                {/* Editor + file tree */}
                <div className="flex flex-1 overflow-hidden min-h-0">

                    {(viewMode === "code" || viewMode === "split") && (
                        <ResizablePanelGroup
                            orientation="horizontal"
                            className="flex-1 h-full"
                        >
                            {/* File explorer */}
                            <ResizablePanel
                                defaultSize={20}
                                className="h-full min-w-0 overflow-hidden"
                            >
                                <FileExplorer
                                    projectId={project._id}
                                    projectName={project.name}
                                />
                            </ResizablePanel>

                            <ResizableHandle withHandle />

                            {/* Editor / split */}
                            {viewMode === "code" ? (
                                <ResizablePanel
                                    defaultSize={80}
                                    className="h-full min-w-0 overflow-hidden"
                                >
                                    <EditorPane />
                                </ResizablePanel>
                            ) : (
                                <>
                                    <ResizablePanel
                                        defaultSize={42}
                                        className="h-full min-w-0 overflow-hidden"
                                    >
                                        <EditorPane />
                                    </ResizablePanel>

                                    <ResizableHandle withHandle />

                                    <ResizablePanel
                                        defaultSize={40}
                                        className="h-full min-w-0 overflow-hidden"
                                    >
                                        <PreviewPane />
                                    </ResizablePanel>
                                </>
                            )}
                        </ResizablePanelGroup>
                    )}

                    {viewMode === "preview" && (
                        <div className="flex-1 h-full">
                            <PreviewPane />
                        </div>
                    )}
                </div>

                {/* ── Terminal bottom panel ────────────────────────────── */}
                {showTerminal && (
                    <>
                        {/* Drag handle */}
                        <div
                            onMouseDown={onDragStart}
                            className="flex items-center justify-center h-[4px] shrink-0 cursor-row-resize group"
                            style={{ backgroundColor: "#30363d" }}
                        >
                            <div
                                className="w-10 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ backgroundColor: "#58a6ff" }}
                            />
                        </div>

                        {/* Terminal panel */}
                        <div
                            className="shrink-0 overflow-hidden"
                            style={{ height: `${bottomPanelHeight}px` }}
                        >
                            <TerminalPanel
                                workspaceId={workspaceId}
                                className="h-full"
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};