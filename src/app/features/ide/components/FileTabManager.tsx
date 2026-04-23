// src/app/features/ide/components/FileTabManager.tsx
// Migrated to disk-based paths.
// Primary key: relativePath (string) instead of Id<"files">
// Breadcrumbs: derived from relativePath — no Convex query needed
// Content: lives on disk, not Convex

'use client';

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { useEditorStore } from "@/src/store/editor-store";
import { useIDEStore } from "@/src/store/ide-store";
import { useGetAllFiles } from "@/src/app/features/projects/hooks/use-file";
import { FileIcon } from "@react-symbols/icons/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { XIcon, ChevronRightIcon } from "lucide-react";

// ── Breadcrumb ────────────────────────────────────────────────────────────────
// Built from relativePath — no Convex query needed.
// "src/components/ui/Button.tsx" → ["src", "components", "ui", "Button.tsx"]

interface BreadcrumbProps {
    relativePath: string;
}

const FileBreadcrumb: React.FC<BreadcrumbProps> = ({ relativePath }) => {
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    return (
        <div
            className="flex items-center gap-0.5 px-3 py-1 text-[11px] shrink-0 overflow-x-auto"
            style={{
                backgroundColor: "#1e1f22",
                borderBottom: "1px solid #30363d",
                color: "#8b949e",
            }}
        >
            {segments.map((seg, i) => (
                <span key={i} className="flex items-center gap-0.5 shrink-0">
                    {i > 0 && (
                        <ChevronRightIcon className="size-2.5 opacity-40 shrink-0" />
                    )}
                    <span
                        className={cn(
                            "transition-colors",
                            i === segments.length - 1
                                ? "text-foreground font-medium"
                                : "cursor-default hover:text-foreground"
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
    relativePath: string;
    fileName: string;
    isDirty: boolean;
    isActive: boolean;
    onActivate: () => void;
    onClose: (e: React.MouseEvent) => void;
}

const TabPill: React.FC<TabPillProps> = ({
    relativePath,
    fileName,
    isDirty,
    isActive,
    onActivate,
    onClose,
}) => (
    <button
        onClick={onActivate}
        title={relativePath}
        style={{
            backgroundColor: isActive ? "#1e1f22" : "#161b22",
            color: isActive ? "#e6edf3" : "#8b949e",
            borderRight: "1px solid #30363d",
            borderBottom: isActive ? "none" : "1px solid #30363d",
        }}
        className={cn(
            "group relative flex items-center gap-1.5 px-3 py-2",
            "text-xs shrink-0 focus:outline-none transition-colors select-none",
            !isActive && "hover:bg-[#21262d] hover:text-[#e6edf3]",
        )}
    >
        {/* Active tab top accent bar */}
        {isActive && (
            <span
                className="absolute top-0 left-0 right-0 h-[2px] rounded-b-sm"
                style={{ backgroundColor: "#388bfd" }}
            />
        )}

        {/* File type icon */}
        <FileIcon
            fileName={fileName}
            autoAssign
            className="size-3.5 shrink-0"
        />

        {/* File name */}
        <span className="max-w-[120px] truncate">{fileName}</span>

        {/* Dirty dot / close button */}
        <span
            onClick={onClose}
            className={cn(
                "ml-0.5 size-3.5 flex items-center justify-center rounded-sm",
                "transition-all cursor-pointer",
                isDirty
                    ? "text-primary"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100"
            )}
        >
            {/* Dirty indicator dot — hides on hover to reveal X */}
            {isDirty && (
                <span className="size-1.5 rounded-full bg-current group-hover:hidden" />
            )}
            {/* Close X — always shown on hover, shown for dirty on hover too */}
            <XIcon
                className={cn(
                    "size-2.5",
                    isDirty ? "hidden group-hover:block" : ""
                )}
            />
        </span>
    </button>
);

// ── FileTabManager (main export) ──────────────────────────────────────────────

interface FileTabManagerProps {
    projectId: Id<"projects"> | null;
}

export const FileTabManager: React.FC<FileTabManagerProps> = ({ projectId }) => {
    const {
        tabs,
        activeFilePath,
        setActiveFile,
        closeTab,
        closeTabsMatching,
    } = useEditorStore();

    const { workspaceId } = useIDEStore();

    // ── Bug 4: close tabs when files deleted outside the IDE ──────────────────
    // Convex keeps a live list of all files. When that list updates (e.g. a file
    // is removed via terminal `rm`), any open tab for that path gets closed.
    const allFiles = useGetAllFiles((workspaceId || null) as Id<"workspaces"> | null);
    useEffect(() => {
        if (!allFiles) return; // still loading — don't act
        const known = new Set(allFiles.map(f => f.relativePath));
        // Find all open tabs that are no longer in Convex
        const stale = tabs.filter(t => !known.has(t.relativePath));
        stale.forEach(t => closeTabsMatching(t.relativePath));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allFiles]);

    // Filter tabs to only those belonging to this project
    const projectTabs = projectId
        ? tabs.filter(t => t.projectId === projectId)
        : [];

    const activeTab = projectTabs.find(
        t => t.relativePath === activeFilePath
    ) ?? null;

    // Empty state — no open files
    if (projectTabs.length === 0) {
        return (
            <div
                className="flex items-center h-9 px-3 text-xs italic"
                style={{ backgroundColor: "#1e1f22", color: "#6e7681" }}
            />
        );
    }

    return (
        <div className="flex flex-col w-full min-w-0">

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <ScrollArea className="w-full">
                <nav
                    className="flex items-stretch h-9"
                    style={{
                        backgroundColor: "#1e1f22",
                        borderBottom: "1px solid #30363d",
                    }}
                    aria-label="Open editor tabs"
                >
                    {projectTabs.map((tab) => (
                        <TabPill
                            key={tab.relativePath}
                            relativePath={tab.relativePath}
                            fileName={tab.fileName}
                            isDirty={tab.isDirty}
                            isActive={tab.relativePath === activeFilePath}
                            onActivate={() => setActiveFile(tab.relativePath)}
                            onClose={(e) => {
                                e.stopPropagation();
                                closeTab(tab.relativePath);
                            }}
                        />
                    ))}
                </nav>
                <ScrollBar orientation="horizontal" className="h-[3px]" />
            </ScrollArea>

            {/* ── Breadcrumb for active file ────────────────────────────── */}
            {activeTab && (
                <FileBreadcrumb relativePath={activeTab.relativePath} />
            )}
        </div>
    );
};