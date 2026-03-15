'use client';

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { useEditorStore } from "@/src/store/editor-store";
import { useIDEStore } from "@/src/store/ide-store";
import { useGetFilePath } from "@/src/app/features/projects/hooks/use-file";
import { FileIcon } from "@react-symbols/icons/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { XIcon, ChevronRightIcon } from "lucide-react";

// ── Breadcrumb for the active file ───────────────────────────────────────────

interface BreadcrumbProps {
    fileId: Id<"files">;
    projectId: Id<"projects">;
}

const FileBreadcrumb = ({ fileId, projectId }: BreadcrumbProps) => {
    const { updateFilePath } = useEditorStore();
    const segments = useGetFilePath(projectId, fileId);

    useEffect(() => {
        if (segments) updateFilePath(fileId, segments);
    }, [segments, fileId, updateFilePath]);

    if (!segments || segments.length === 0) return null;

    return (
        <div
            className="flex items-center gap-0.5 px-3 py-1 text-[11px] shrink-0"
            style={{
                backgroundColor: '#0d1117',
                borderBottom: '1px solid #30363d',
                color: '#8b949e',
            }}
        >
            {segments.map((seg, i) => (
                <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRightIcon className="size-2.5 opacity-40" />}
                    <span
                        className={cn(
                            i === segments.length - 1
                                ? "text-foreground font-medium"
                                : "hover:text-foreground cursor-default transition-colors"
                        )}
                    >
                        {seg}
                    </span>
                </span>
            ))}
        </div>
    );
};

// ── Single tab pill ───────────────────────────────────────────────────────────

interface TabPillProps {
    fileId: Id<"files">;
    fileName: string;
    isDirty: boolean;
    isActive: boolean;
    isFirst: boolean;
    onActivate: () => void;
    onClose: (e: React.MouseEvent) => void;
}

const TabPill = ({ fileId, fileName, isDirty, isActive, isFirst, onActivate, onClose }: TabPillProps) => (
    <button
        onClick={onActivate}
        title={fileName}
        style={{
            // Active tab == editor bg (#0d1117) → seamless merge into editor canvas
            // Inactive tab == canvas.subtle (#161b22) → lifted appearance
            backgroundColor: isActive ? '#0d1117' : '#161b22',
            color: isActive ? '#e6edf3' : '#8b949e',
            borderRight: '1px solid #30363d',
            borderBottom: isActive ? 'none' : '1px solid #30363d',
        }}
        className={cn(
            "group relative flex items-center gap-1.5 px-3 py-2 text-xs shrink-0",
            "focus:outline-none transition-colors select-none",
            !isActive && "hover:bg-[#21262d] hover:text-[#e6edf3]",
        )}
    >
        {isActive && (
            <span className="absolute top-0 left-0 right-0 h-[2px] rounded-b-sm" style={{ backgroundColor: '#388bfd' }} />
        )}

        {/* File type icon */}
        <FileIcon fileName={fileName} autoAssign className="size-3.5 shrink-0" />

        {/* Name */}
        <span className="max-w-[120px] truncate">{fileName}</span>

        {/* Dirty dot / close button */}
        <span
            onClick={onClose}
            className={cn(
                "ml-0.5 size-3.5 flex items-center justify-center rounded-sm",
                "transition-all",
                isDirty
                    ? "text-primary group-hover:text-foreground"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100"
            )}
        >
            {isDirty ? (
                <span className="size-1.5 rounded-full bg-current group-hover:hidden" />
            ) : null}
            <XIcon className={cn("size-2.5", isDirty ? "hidden group-hover:block" : "")} />
        </span>
    </button>
);

// ── FileTabManager ────────────────────────────────────────────────────────────

interface FileTabManagerProps {
    projectId: Id<"projects"> | null;
}

export const FileTabManager = ({ projectId }: FileTabManagerProps) => {
    const { tabs, activeFileId, setActiveFile, closeTab } = useEditorStore();

    // Only show tabs belonging to this project
    const projectTabs = projectId
        ? tabs.filter(t => t.projectId === projectId)
        : [];

    const activeTab = projectTabs.find(t => t.fileId === activeFileId) ?? null;

    if (projectTabs.length === 0) {
        return (
            <div
                className="flex items-center px-3 h-full text-xs italic"
                style={{ backgroundColor: '#0d1117', color: '#6e7681' }}
            >

            </div>
        );
    }

    return (
        <div className="flex flex-col w-full min-w-0">
            {/* ── Tab bar ── */}
            <ScrollArea className="w-full">
                <nav
                    className="flex items-stretch h-9"
                    style={{ backgroundColor: '#161b22', borderBottom: '1px solid #30363d' }}
                    aria-label="Open editor tabs"
                >
                    {projectTabs.map((tab, i) => (
                        <TabPill
                            key={tab.fileId}
                            fileId={tab.fileId}
                            fileName={tab.fileName}
                            isDirty={tab.isDirty}
                            isActive={tab.fileId === activeFileId}
                            isFirst={i === 0}
                            onActivate={() => setActiveFile(tab.fileId)}
                            onClose={(e) => { e.stopPropagation(); closeTab(tab.fileId); }}
                        />
                    ))}
                </nav>
                <ScrollBar orientation="horizontal" className="h-[3px]" />
            </ScrollArea>

            {/* ── Breadcrumb for the active file ── */}
            {activeTab && projectId && (
                <FileBreadcrumb fileId={activeTab.fileId} projectId={projectId} />
            )}
        </div>
    );
};