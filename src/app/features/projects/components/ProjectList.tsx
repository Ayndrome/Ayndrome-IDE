'use client';

import { Project } from "@/src/types/types";
import { cn } from "@/lib/utils";
import { Clock, FolderOpen, GitBranch, MoreHorizontal, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface ProjectListProps {
    projects: Project[] | null | undefined;
    onViewAllProjects: () => void;
}

const statusConfig = {
    processing: { label: "Processing", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    completed: { label: "Ready", className: "bg-green-500/15  text-green-400  border-green-500/30" },
    failed: { label: "Failed", className: "bg-red-500/15    text-red-400    border-red-500/30" },
};

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export const ProjectList = ({ projects, onViewAllProjects }: ProjectListProps) => {
    const router = useRouter();
    if (!projects) {
        return (
            <div className="w-full flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ))}
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="w-full flex flex-col items-center gap-3 py-8 text-muted-foreground">
                <FolderOpen className="size-8 opacity-40" />
                <p className="text-sm">No projects yet — create your first one!</p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Projects</span>
                <button
                    onClick={onViewAllProjects}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors duration-200"
                >
                    View all <ChevronRight className="size-3" />
                </button>
            </div>

            {projects.map((project) => {
                const status = project.importStatus ?? project.exportStatus;
                const cfg = status ? statusConfig[status] : null;

                return (
                    <button
                        key={project._id}
                        onClick={() => router.push(`/project/${project._id}`)}
                        className={cn(
                            "w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg",
                            "border border-transparent hover:border-border",
                            "hover:bg-muted/50 transition-all duration-150 text-left"
                        )}
                    >
                        {/* Icon */}
                        <div className="shrink-0 size-8 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <GitBranch className="size-3.5 text-primary" />
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{project.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Clock className="size-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{timeAgo(project?.updatedAt ?? 0)}</span>
                                {cfg && (
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", cfg.className)}>
                                        {cfg.label}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* More icon */}
                        <MoreHorizontal className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                );
            })}
        </div>
    );
};