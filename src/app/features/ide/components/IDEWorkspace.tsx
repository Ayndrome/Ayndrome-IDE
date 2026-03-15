'use client';

import { useEffect } from "react";
import { Project } from "@/src/types/types";
import { useIDEStore } from "@/src/store/ide-store";
import { IDENavbar } from "./IDENavbar";
import { FileExplorer } from "./FileExplorer";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";

interface IDEWorkspaceProps {
    project: Project;
}

export const IDEWorkspace = ({ project }: IDEWorkspaceProps) => {
    const { viewMode, setProject } = useIDEStore();

    // Seed store with the current project on mount / project change
    useEffect(() => {
        setProject(project._id, project.name);
    }, [project._id, project.name, setProject]);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* ── Navbar — reads/writes store directly ── */}
            <IDENavbar project={project} />

            {/* ── Workspace ── */}
            <div className="flex flex-1 overflow-hidden">
                {(viewMode === "code" || viewMode === "split") && (
                    <ResizablePanelGroup orientation="horizontal" className="flex-1 h-full">

                        <ResizablePanel
                            defaultSize={20}
                            // minSize={0}
                            // maxSize={75}
                            // collapsible
                            // collapsedSize={0}
                            className="h-full min-w-0 overflow-hidden"
                        >
                            <FileExplorer
                                projectId={project._id}
                                projectName={project.name}
                            />
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        {viewMode === "code" ? (
                            <ResizablePanel
                                defaultSize={80}
                                // minSize={0}
                                // collapsible
                                // collapsedSize={0}
                                className="h-full min-w-0 overflow-hidden"
                            >
                                <EditorPane />
                            </ResizablePanel>
                        ) : (
                            <>
                                <ResizablePanel
                                    defaultSize={42}
                                    // minSize={0}
                                    // collapsible
                                    // collapsedSize={0}
                                    className="h-full min-w-0 overflow-hidden"
                                >
                                    <EditorPane />
                                </ResizablePanel>

                                <ResizableHandle withHandle />

                                <ResizablePanel
                                    defaultSize={40}
                                    // minSize={0}
                                    // collapsible
                                    // collapsedSize={0}
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
        </div>
    );
};
