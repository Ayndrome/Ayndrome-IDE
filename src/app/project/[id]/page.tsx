'use client';

import { use } from "react";
import { useProject } from "@/src/app/features/projects/hooks/use-project";
import { Id } from "@/convex/_generated/dataModel";
import { IDEWorkspace } from "../../features/ide/components/IDEWorkspace";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectPageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
    const { id } = use(params);
    const project = useProject(id as Id<"projects">);

    if (project === undefined) {
        return (
            <div className="flex flex-col h-full w-full">
                {/* Navbar skeleton */}
                <div className="h-11 border-b border-border flex items-center px-4 gap-3 shrink-0">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <div className="ml-auto flex gap-2">
                        <Skeleton className="h-7 w-16 rounded-md" />
                        <Skeleton className="h-7 w-7 rounded-full" />
                    </div>
                </div>
                {/* Panes skeleton */}
                <div className="flex flex-1 overflow-hidden">
                    <Skeleton className="w-52 h-full rounded-none border-r border-border" />
                    <Skeleton className="flex-1 h-full rounded-none" />
                    <Skeleton className="flex-1 h-full rounded-none border-l border-border" />
                </div>
            </div>
        );
    }

    if (project === null) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Project not found or you don't have access.</p>
            </div>
        );
    }

    return <IDEWorkspace project={project} />;
}
