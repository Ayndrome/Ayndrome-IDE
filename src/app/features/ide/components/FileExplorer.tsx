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


// ── Main FileExplorer ──────────────────────────────────────────────────────────

interface FileExplorerProps {
    projectId: Id<"projects">;
    projectName: string;
}

export const FileExplorer = ({ projectId, projectName }: FileExplorerProps) => {
    const { openFile, activeFileId, closeTab } = useEditorStore();
    const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
    const [creating, setCreating] = useState<CreatingState | null>(null);
    const [renaming, setRenaming] = useState<RenamingState | null>(null);
    const [deletePending, setDeletePending] = useState<DeletePendingState | null>(null);

    const rootFiles = useQuery(api.files.getFolderFiles, { projectId, parentId: undefined });
    const createFileOrFolder = useCreateFileOrFolder();
    const deleteFileOrFolder = useDeleteFileOrFolder();
    const renameFileOrFolder = useRenameFileOrFolder();

    const handleSelect = useCallback((item: FileItem) => {
        setSelectedItem(item);
        if (item.type === 'file') {
            openFile(item._id, projectId, item.name, item.content ?? '');
        }
    }, [openFile, projectId]);

    // ── Smart create: put create input inside the selected folder,
    //   or inside the parent of the selected file, or at root ──
    const getCreateParent = useCallback((overrideItem?: FileItem): { parentId?: Id<"files">; depth: number } => {
        const target = overrideItem ?? selectedItem;
        if (!target) return { parentId: undefined, depth: 0 };
        if (target.type === 'folder') return { parentId: target._id, depth: 1 };
        // file selected → create alongside it (in its parent)
        return { parentId: target.parentId, depth: target.parentId ? 1 : 0 };
    }, [selectedItem]);

    const startCreate = useCallback((type: "file" | "folder", overrideItem?: FileItem) => {
        const { parentId, depth } = getCreateParent(overrideItem);
        setCreating({ parentId, type, depth });
        setRenaming(null);
    }, [getCreateParent]);

    // ── Context menu actions ──
    const handleContextAction = useCallback((
        action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut',
        item: FileItem,
        depth: number
    ) => {
        setSelectedItem(item);
        switch (action) {
            case 'new-file':
                setCreating({ parentId: item._id, type: 'file', depth: depth + 1 });
                break;
            case 'new-folder':
                setCreating({ parentId: item._id, type: 'folder', depth: depth + 1 });
                break;
            case 'rename':
                setRenaming({ id: item._id, name: item.name, type: item.type, depth });
                setCreating(null);
                break;
            case 'delete':
                setDeletePending({
                    id: item._id,
                    name: item.name,
                    hasContent: !!item.content && item.content.length > 0,
                });
                break;
            case 'copy':
                navigator.clipboard.writeText(item.name).catch(() => { });
                break;
            case 'cut':
                // TODO: implement cut with paste
                break;
        }
    }, []);

    // ── Create submit ──
    const handleCreateSubmit = useCallback(async (name: string) => {
        if (!creating) return;
        try {
            await createFileOrFolder({
                projectId,
                name,
                type: creating.type,
                parentId: creating.parentId,
                content: creating.type === 'file' ? '' : undefined,
            });
        } catch (e) { console.error(e); }
        setCreating(null);
    }, [creating, createFileOrFolder, projectId]);

    // ── Rename submit ──
    const handleRenameSubmit = useCallback(async (name: string) => {
        if (!renaming || name === renaming.name) { setRenaming(null); return; }
        try {
            await renameFileOrFolder({ id: renaming.id, name, type: renaming.type });
        } catch (e) { console.error(e); }
        setRenaming(null);
    }, [renaming, renameFileOrFolder]);

    // ── Delete confirm ──
    const handleDeleteConfirm = useCallback(async () => {
        if (!deletePending) return;
        try {
            await deleteFileOrFolder({ id: deletePending.id });
            if (activeFileId === deletePending.id) closeTab(deletePending.id);
            if (selectedItem?._id === deletePending.id) setSelectedItem(null);
        } catch (e) { console.error(e); }
        setDeletePending(null);
    }, [deletePending, deleteFileOrFolder, activeFileId, selectedItem, closeTab]);

    // ── Keyboard on root panel ──
    const handleRootKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); startCreate('file'); }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); startCreate('folder'); }
    }, [startCreate]);

    return (
        <>
            <DeleteDialog
                item={deletePending}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeletePending(null)}
            />

            <div
                className="flex flex-col h-full w-full min-w-0 overflow-hidden"
                style={{ backgroundColor: '#161b22', borderRight: '1px solid #30363d' }}
                onKeyDown={handleRootKeyDown}
                tabIndex={-1}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ backgroundColor: '#161b22' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: '#8b949e' }}>
                        {projectName}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => startCreate('file')}
                                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                    <PlusIcon className="size-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">New File (N)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => startCreate('folder')}
                                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                    <FolderPlusIcon className="size-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">New Folder</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                    <RefreshCwIcon className="size-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Refresh (live)</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {/* ── File tree ── */}
                <ScrollArea className="flex-1">
                    <div className="py-0.5 pr-1" role="tree">

                        {/* Root-level create input */}
                        {creating && creating.parentId === undefined && (
                            <CreateInput
                                type={creating.type}
                                depth={0}
                                onSubmit={handleCreateSubmit}
                                onCancel={() => setCreating(null)}
                            />
                        )}

                        {rootFiles === undefined && (
                            <div className="px-4 py-2 text-xs text-muted-foreground/60">Loading…</div>
                        )}

                        {rootFiles?.length === 0 && !creating && (
                            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                                <p className="text-xs text-muted-foreground/60">No files yet</p>
                                <button
                                    onClick={() => startCreate('file')}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Create your first file
                                </button>
                            </div>
                        )}

                        {rootFiles?.map(item => (
                            <FileTreeNode
                                key={item._id}
                                item={item as FileItem}
                                depth={0}
                                projectId={projectId}
                                activeFileId={activeFileId}
                                selectedId={selectedItem?._id ?? null}
                                onSelect={handleSelect}
                                onContextAction={handleContextAction}
                                creating={creating}
                                onCreateSubmit={handleCreateSubmit}
                                onCreateCancel={() => setCreating(null)}
                                renaming={renaming}
                                onRenameSubmit={handleRenameSubmit}
                                onRenameCancel={() => setRenaming(null)}
                            />
                        ))}
                    </div>
                </ScrollArea>

                {/* ── Status bar ── */}
                <div className="px-3 py-1 border-t shrink-0" style={{ borderColor: '#30363d', backgroundColor: '#161b22' }}>
                    <p className="text-[10px] truncate" style={{ color: '#6e7681' }}>
                        {rootFiles
                            ? `${rootFiles.length} item${rootFiles.length !== 1 ? 's' : ''} · Right-click for actions`
                            : '…'}
                    </p>
                </div>
            </div>
        </>


    );
};
