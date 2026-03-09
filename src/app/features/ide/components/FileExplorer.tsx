'use client';

import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
    useCreateFileOrFolder,
    useDeleteFileOrFolder,
    useRenameFileOrFolder,
} from "@/src/app/features/projects/hooks/use-file";
import { useEditorStore } from "@/src/store/editor-store";
import { CreateInput } from "@/src/app/features/ide/utils/create-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileIcon, FolderIcon, DefaultFolderOpenedIcon } from "@react-symbols/icons/utils";
import { PlusIcon, FolderPlusIcon, RefreshCwIcon, ChevronRight, ChevronDown } from "lucide-react";

interface FileItem {
    _id: Id<"files">;
    name: string;
    type: "file" | "folder";
    parentId?: Id<"files">;
    projectId: Id<"projects">;
    content?: string;
}

interface CreatingState {
    parentId?: Id<"files">;
    type: "file" | "folder";
    depth: number;
}

interface RenamingState {
    id: Id<"files">;
    name: string;
    type: "file" | "folder";
    depth: number;
}

interface DeletePendingState {
    id: Id<"files">;
    name: string;
    hasContent: boolean;
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────

interface DeleteDialogProps {
    item: DeletePendingState | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteDialog = ({ item, onConfirm, onCancel }: DeleteDialogProps) => (
    <AlertDialog open={!!item} onOpenChange={(o) => { if (!o) onCancel(); }}>
        <AlertDialogContent size="sm">
            <AlertDialogHeader>
                <AlertDialogTitle>Delete "{item?.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                    {item?.hasContent
                        ? "This file has content. Deleting it is permanent and cannot be undone."
                        : "This will permanently delete the item."}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel size="sm" onClick={onCancel}>Cancel</AlertDialogCancel>
                <AlertDialogAction size="sm" variant="destructive" onClick={onConfirm}>
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
);


// ── Recursive File Tree Node ───────────────────────────────────────────────────

interface FileTreeNodeProps {
    item: FileItem;
    depth: number;
    projectId: Id<"projects">;
    activeFileId: Id<"files"> | null;
    selectedId: Id<"files"> | null;
    onSelect: (item: FileItem) => void;
    onContextAction: (action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut', item: FileItem, depth: number) => void;
    creating: CreatingState | null;
    onCreateSubmit: (name: string) => void;
    onCreateCancel: () => void;
    renaming: RenamingState | null;
    onRenameSubmit: (name: string) => void;
    onRenameCancel: () => void;
}

const FileTreeNode = ({
    item, depth, projectId, activeFileId, selectedId,
    onSelect, onContextAction,
    creating, onCreateSubmit, onCreateCancel,
    renaming, onRenameSubmit, onRenameCancel,
}: FileTreeNodeProps) => {
    const [open, setOpen] = useState(false);
    const isFolder = item.type === "folder";
    const isActive = item._id === activeFileId;
    const isSelected = item._id === selectedId;
    const isRenaming = renaming?.id === item._id;

    const children = useQuery(
        api.files.getFolderFiles,
        isFolder && open ? { projectId, parentId: item._id } : "skip"
    );

    const showCreateUnder = creating?.parentId === item._id && open;

    const handleClick = useCallback(() => {
        onSelect(item);
        if (isFolder) setOpen(o => !o);
    }, [item, isFolder, onSelect]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === ' ') handleClick();
        if (e.key === 'F2') onContextAction('rename', item, depth);
        if ((e.key === 'Delete' || e.key === 'Backspace') && e.currentTarget === e.target) {
            onContextAction('delete', item, depth);
        }
        if (isFolder) {
            if (e.key === 'ArrowRight' && !open) setOpen(true);
            if (e.key === 'ArrowLeft' && open) setOpen(false);
        }
    }, [handleClick, item, depth, isFolder, open, onContextAction]);

    const indentPx = depth * 12 + 4;

    return (
        <div role="treeitem" aria-expanded={isFolder ? open : undefined} aria-selected={isSelected}>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {isRenaming ? (
                        <div>
                            <CreateInput
                                type={item.type}
                                depth={depth}
                                defaultName={item.name}
                                onSubmit={onRenameSubmit}
                                onCancel={onRenameCancel}
                            />
                        </div>
                    ) : (
                        <div
                            tabIndex={0}
                            onClick={handleClick}
                            onKeyDown={handleKeyDown}
                            style={{
                                paddingLeft: `${indentPx}px`,
                                backgroundColor: isActive
                                    ? '#2f3b4a'
                                    : isSelected
                                        ? '#1f2428'
                                        : 'transparent',
                                color: isActive ? '#e6edf3' : '#cdd9e5',
                            }}
                            className={cn(
                                "group/node flex items-center gap-1 pr-2 py-[3px] cursor-pointer",
                                "text-xs select-none outline-none transition-colors",
                                "hover:bg-[#1c2128]",
                                isActive && "font-medium",
                            )}
                        >
                            {/* Expand chevron */}
                            <span className="shrink-0 size-4 flex items-center justify-center">
                                {isFolder ? (
                                    open
                                        ? <ChevronDown className="size-3 text-muted-foreground/70" />
                                        : <ChevronRight className="size-3 text-muted-foreground/70" />
                                ) : null}
                            </span>

                            {/* VS Code icon */}
                            <span className="shrink-0 size-4 flex items-center justify-center">
                                {isFolder
                                    ? open
                                        ? <DefaultFolderOpenedIcon className="size-4" />
                                        : <FolderIcon folderName={item.name} className="size-4" />
                                    : <FileIcon fileName={item.name} autoAssign className="size-4" />
                                }
                            </span>

                            {/* Label */}
                            <span className="flex-1 min-w-0 truncate ml-0.5">{item.name}</span>
                        </div>
                    )}
                </ContextMenuTrigger>

                <ContextMenuContent className="w-52">
                    {isFolder && (
                        <>
                            <ContextMenuItem onSelect={() => { setOpen(true); onContextAction('new-file', item, depth); }}>
                                New File
                                <ContextMenuShortcut>N</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => { setOpen(true); onContextAction('new-folder', item, depth); }}>
                                New Folder
                                <ContextMenuShortcut>F</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                        </>
                    )}
                    <ContextMenuItem onSelect={() => onContextAction('rename', item, depth)}>
                        Rename
                        <ContextMenuShortcut>F2</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onContextAction('copy', item, depth)}>
                        Copy
                        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onContextAction('cut', item, depth)}>
                        Cut
                        <ContextMenuShortcut>⌘X</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => onContextAction('delete', item, depth)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        Delete
                        <ContextMenuShortcut>⌫</ContextMenuShortcut>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Children + inline create */}
            {isFolder && open && (
                <div>
                    {showCreateUnder && (
                        <CreateInput
                            type={creating!.type}
                            depth={creating!.depth}
                            onSubmit={onCreateSubmit}
                            onCancel={onCreateCancel}
                        />
                    )}
                    {children === undefined && (
                        <div
                            style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                            className="text-[10px] text-muted-foreground/50 py-1"
                        >
                            Loading…
                        </div>
                    )}
                    {children?.map(child => (
                        <FileTreeNode
                            key={child._id}
                            item={child as FileItem}
                            depth={depth + 1}
                            projectId={projectId}
                            activeFileId={activeFileId}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onContextAction={onContextAction}
                            creating={creating}
                            onCreateSubmit={onCreateSubmit}
                            onCreateCancel={onCreateCancel}
                            renaming={renaming}
                            onRenameSubmit={onRenameSubmit}
                            onRenameCancel={onRenameCancel}
                        />
                    ))}
                    {children?.length === 0 && !showCreateUnder && (
                        <div
                            style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                            className="text-[10px] text-muted-foreground/40 italic py-1"
                        >
                            empty
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};