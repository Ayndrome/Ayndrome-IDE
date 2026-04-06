// 'use client';

// import { cn } from "@/lib/utils";
// import { useCallback, useState } from "react";
// import { Id } from "@/convex/_generated/dataModel";
// import { useQuery } from "convex/react";
// import { api } from "@/convex/_generated/api";
// import {
//     useCreateFileOrFolder,
//     useDeleteFileOrFolder,
//     useRenameFileOrFolder,
// } from "@/src/app/features/projects/hooks/use-file";
// import { useEditorStore } from "@/src/store/editor-store";
// import { CreateInput } from "@/src/app/features/ide/utils/create-input";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
// import {
//     ContextMenu,
//     ContextMenuContent,
//     ContextMenuItem,
//     ContextMenuSeparator,
//     ContextMenuShortcut,
//     ContextMenuTrigger,
// } from "@/components/ui/context-menu";
// import {
//     AlertDialog,
//     AlertDialogAction,
//     AlertDialogCancel,
//     AlertDialogContent,
//     AlertDialogDescription,
//     AlertDialogFooter,
//     AlertDialogHeader,
//     AlertDialogTitle,
// } from "@/components/ui/alert-dialog";
// import { FileIcon, FolderIcon, DefaultFolderOpenedIcon } from "@react-symbols/icons/utils";
// import { PlusIcon, FolderPlusIcon, RefreshCwIcon, ChevronRight, ChevronDown } from "lucide-react";

// interface FileItem {
//     _id: Id<"files">;
//     name: string;
//     type: "file" | "folder";
//     parentId?: Id<"files">;
//     projectId: Id<"projects">;
//     content?: string;
// }

// interface CreatingState {
//     parentId?: Id<"files">;
//     type: "file" | "folder";
//     depth: number;
// }

// interface RenamingState {
//     id: Id<"files">;
//     name: string;
//     type: "file" | "folder";
//     depth: number;
// }

// interface DeletePendingState {
//     id: Id<"files">;
//     name: string;
//     hasContent: boolean;
// }

// // ── Delete Confirm Dialog ─────────────────────────────────────────────────────

// interface DeleteDialogProps {
//     item: DeletePendingState | null;
//     onConfirm: () => void;
//     onCancel: () => void;
// }

// const DeleteDialog = ({ item, onConfirm, onCancel }: DeleteDialogProps) => (
//     <AlertDialog open={!!item} onOpenChange={(o) => { if (!o) onCancel(); }}>
//         <AlertDialogContent size="sm">
//             <AlertDialogHeader>
//                 <AlertDialogTitle>Delete "{item?.name}"?</AlertDialogTitle>
//                 <AlertDialogDescription>
//                     {item?.hasContent
//                         ? "This file has content. Deleting it is permanent and cannot be undone."
//                         : "This will permanently delete the item."}
//                 </AlertDialogDescription>
//             </AlertDialogHeader>
//             <AlertDialogFooter>
//                 <AlertDialogCancel size="sm" onClick={onCancel}>Cancel</AlertDialogCancel>
//                 <AlertDialogAction size="sm" variant="destructive" onClick={onConfirm}>
//                     Delete
//                 </AlertDialogAction>
//             </AlertDialogFooter>
//         </AlertDialogContent>
//     </AlertDialog>
// );


// // ── Recursive File Tree Node ───────────────────────────────────────────────────

// interface FileTreeNodeProps {
//     item: FileItem;
//     depth: number;
//     projectId: Id<"projects">;
//     activeFileId: Id<"files"> | null;
//     selectedId: Id<"files"> | null;
//     onSelect: (item: FileItem) => void;
//     onContextAction: (action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut', item: FileItem, depth: number) => void;
//     creating: CreatingState | null;
//     onCreateSubmit: (name: string) => void;
//     onCreateCancel: () => void;
//     renaming: RenamingState | null;
//     onRenameSubmit: (name: string) => void;
//     onRenameCancel: () => void;
// }


// const FileTreeNode = ({
//     item, depth, projectId, activeFileId, selectedId,
//     onSelect, onContextAction,
//     creating, onCreateSubmit, onCreateCancel,
//     renaming, onRenameSubmit, onRenameCancel,
// }: FileTreeNodeProps) => {
//     const [open, setOpen] = useState(false);
//     const isFolder = item.type === "folder";
//     const isActive = item._id === activeFileId;
//     const isSelected = item._id === selectedId;
//     const isRenaming = renaming?.id === item._id;

//     const children = useQuery(
//         api.files.getFolderFiles,
//         isFolder && open ? { projectId, parentId: item._id } : "skip"
//     );

//     const showCreateUnder = creating?.parentId === item._id && open;

//     const handleClick = useCallback(() => {
//         onSelect(item);
//         if (isFolder) setOpen(o => !o);
//     }, [item, isFolder, onSelect]);

//     const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
//         e.stopPropagation();
//         if (e.key === 'Enter' || e.key === ' ') handleClick();
//         if (e.key === 'F2') onContextAction('rename', item, depth);
//         if ((e.key === 'Delete' || e.key === 'Backspace') && e.currentTarget === e.target) {
//             onContextAction('delete', item, depth);
//         }
//         if (isFolder) {
//             if (e.key === 'ArrowRight' && !open) setOpen(true);
//             if (e.key === 'ArrowLeft' && open) setOpen(false);
//         }
//     }, [handleClick, item, depth, isFolder, open, onContextAction]);

//     const indentPx = depth * 12 + 4;

//     return (
//         <div role="treeitem" aria-expanded={isFolder ? open : undefined} aria-selected={isSelected}>
//             <ContextMenu>
//                 <ContextMenuTrigger asChild>
//                     {isRenaming ? (
//                         <div>
//                             <CreateInput
//                                 type={item.type}
//                                 depth={depth}
//                                 defaultName={item.name}
//                                 onSubmit={onRenameSubmit}
//                                 onCancel={onRenameCancel}
//                             />
//                         </div>
//                     ) : (
//                         <div
//                             tabIndex={0}
//                             onClick={handleClick}
//                             onKeyDown={handleKeyDown}
//                             style={{
//                                 paddingLeft: `${indentPx}px`,
//                                 backgroundColor: isActive
//                                     ? '#2f3b4a'
//                                     : isSelected
//                                         ? '#1f2428'
//                                         : 'transparent',
//                                 color: isActive ? '#e6edf3' : '#cdd9e5',
//                             }}
//                             className={cn(
//                                 "group/node flex items-center gap-1 pr-2 py-[3px] cursor-pointer",
//                                 "text-xs select-none outline-none transition-colors",
//                                 "hover:bg-[#1c2128]",
//                                 isActive && "font-medium",
//                             )}
//                         >
//                             {/* Expand chevron */}
//                             <span className="shrink-0 size-4 flex items-center justify-center">
//                                 {isFolder ? (
//                                     open
//                                         ? <ChevronDown className="size-3 text-muted-foreground/70" />
//                                         : <ChevronRight className="size-3 text-muted-foreground/70" />
//                                 ) : null}
//                             </span>

//                             {/* VS Code icon */}
//                             <span className="shrink-0 size-4 flex items-center justify-center">
//                                 {isFolder
//                                     ? open
//                                         ? <DefaultFolderOpenedIcon className="size-4" />
//                                         : <FolderIcon folderName={item.name} className="size-4" />
//                                     : <FileIcon fileName={item.name} autoAssign className="size-4" />
//                                 }
//                             </span>

//                             {/* Label */}
//                             <span className="flex-1 min-w-0 truncate ml-0.5">{item.name}</span>
//                         </div>
//                     )}
//                 </ContextMenuTrigger>

//                 <ContextMenuContent className="w-52">
//                     {isFolder && (
//                         <>
//                             <ContextMenuItem onSelect={() => { setOpen(true); onContextAction('new-file', item, depth); }}>
//                                 New File
//                                 <ContextMenuShortcut>N</ContextMenuShortcut>
//                             </ContextMenuItem>
//                             <ContextMenuItem onSelect={() => { setOpen(true); onContextAction('new-folder', item, depth); }}>
//                                 New Folder
//                                 <ContextMenuShortcut>F</ContextMenuShortcut>
//                             </ContextMenuItem>
//                             <ContextMenuSeparator />
//                         </>
//                     )}
//                     <ContextMenuItem onSelect={() => onContextAction('rename', item, depth)}>
//                         Rename
//                         <ContextMenuShortcut>F2</ContextMenuShortcut>
//                     </ContextMenuItem>
//                     <ContextMenuItem onSelect={() => onContextAction('copy', item, depth)}>
//                         Copy
//                         <ContextMenuShortcut>⌘C</ContextMenuShortcut>
//                     </ContextMenuItem>
//                     <ContextMenuItem onSelect={() => onContextAction('cut', item, depth)}>
//                         Cut
//                         <ContextMenuShortcut>⌘X</ContextMenuShortcut>
//                     </ContextMenuItem>
//                     <ContextMenuSeparator />
//                     <ContextMenuItem
//                         onSelect={() => onContextAction('delete', item, depth)}
//                         className="text-destructive focus:text-destructive focus:bg-destructive/10"
//                     >
//                         Delete
//                         <ContextMenuShortcut>⌫</ContextMenuShortcut>
//                     </ContextMenuItem>
//                 </ContextMenuContent>
//             </ContextMenu>

//             {/* Children + inline create */}
//             {isFolder && open && (
//                 <div>
//                     {showCreateUnder && (
//                         <CreateInput
//                             type={creating!.type}
//                             depth={creating!.depth}
//                             onSubmit={onCreateSubmit}
//                             onCancel={onCreateCancel}
//                         />
//                     )}
//                     {children === undefined && (
//                         <div
//                             style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
//                             className="text-[10px] text-muted-foreground/50 py-1"
//                         >
//                             Loading…
//                         </div>
//                     )}
//                     {children?.map(child => (
//                         <FileTreeNode
//                             key={child._id}
//                             item={child as FileItem}
//                             depth={depth + 1}
//                             projectId={projectId}
//                             activeFileId={activeFileId}
//                             selectedId={selectedId}
//                             onSelect={onSelect}
//                             onContextAction={onContextAction}
//                             creating={creating}
//                             onCreateSubmit={onCreateSubmit}
//                             onCreateCancel={onCreateCancel}
//                             renaming={renaming}
//                             onRenameSubmit={onRenameSubmit}
//                             onRenameCancel={onRenameCancel}
//                         />
//                     ))}
//                     {children?.length === 0 && !showCreateUnder && (
//                         <div
//                             style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
//                             className="text-[10px] text-muted-foreground/40 italic py-1"
//                         >
//                             empty
//                         </div>
//                     )}
//                 </div>
//             )}
//         </div>
//     );
// };


// // ── Main FileExplorer ──────────────────────────────────────────────────────────

// interface FileExplorerProps {
//     projectId: Id<"projects">;
//     projectName: string;
// }

// export const FileExplorer = ({ projectId, projectName }: FileExplorerProps) => {
//     const { openFile, activeFileId, closeTab } = useEditorStore();
//     const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
//     const [creating, setCreating] = useState<CreatingState | null>(null);
//     const [renaming, setRenaming] = useState<RenamingState | null>(null);
//     const [deletePending, setDeletePending] = useState<DeletePendingState | null>(null);

//     const rootFiles = useQuery(api.files.getFolderFiles, { projectId, parentId: undefined });
//     const createFileOrFolder = useCreateFileOrFolder();
//     const deleteFileOrFolder = useDeleteFileOrFolder();
//     const renameFileOrFolder = useRenameFileOrFolder();

//     const handleSelect = useCallback((item: FileItem) => {
//         setSelectedItem(item);
//         if (item.type === 'file') {
//             openFile(item._id, projectId, item.name, item.content ?? '');
//         }
//     }, [openFile, projectId]);

//     // ── Smart create: put create input inside the selected folder,
//     //   or inside the parent of the selected file, or at root ──
//     const getCreateParent = useCallback((overrideItem?: FileItem): { parentId?: Id<"files">; depth: number } => {
//         const target = overrideItem ?? selectedItem;
//         if (!target) return { parentId: undefined, depth: 0 };
//         if (target.type === 'folder') return { parentId: target._id, depth: 1 };
//         // file selected → create alongside it (in its parent)
//         return { parentId: target.parentId, depth: target.parentId ? 1 : 0 };
//     }, [selectedItem]);

//     const startCreate = useCallback((type: "file" | "folder", overrideItem?: FileItem) => {
//         const { parentId, depth } = getCreateParent(overrideItem);
//         setCreating({ parentId, type, depth });
//         setRenaming(null);
//     }, [getCreateParent]);

//     // ── Context menu actions ──
//     const handleContextAction = useCallback((
//         action: 'new-file' | 'new-folder' | 'rename' | 'delete' | 'copy' | 'cut',
//         item: FileItem,
//         depth: number
//     ) => {
//         setSelectedItem(item);
//         switch (action) {
//             case 'new-file':
//                 setCreating({ parentId: item._id, type: 'file', depth: depth + 1 });
//                 break;
//             case 'new-folder':
//                 setCreating({ parentId: item._id, type: 'folder', depth: depth + 1 });
//                 break;
//             case 'rename':
//                 setRenaming({ id: item._id, name: item.name, type: item.type, depth });
//                 setCreating(null);
//                 break;
//             case 'delete':
//                 setDeletePending({
//                     id: item._id,
//                     name: item.name,
//                     hasContent: !!item.content && item.content.length > 0,
//                 });
//                 break;
//             case 'copy':
//                 navigator.clipboard.writeText(item.name).catch(() => { });
//                 break;
//             case 'cut':
//                 // TODO: implement cut with paste
//                 break;
//         }
//     }, []);

//     // ── Create submit ──
//     const handleCreateSubmit = useCallback(async (name: string) => {
//         if (!creating) return;
//         try {
//             await createFileOrFolder({
//                 projectId,
//                 name,
//                 type: creating.type,
//                 parentId: creating.parentId,
//                 content: creating.type === 'file' ? '' : undefined,
//             });
//         } catch (e) { console.error(e); }
//         setCreating(null);
//     }, [creating, createFileOrFolder, projectId]);

//     // ── Rename submit ──
//     const handleRenameSubmit = useCallback(async (name: string) => {
//         if (!renaming || name === renaming.name) { setRenaming(null); return; }
//         try {
//             await renameFileOrFolder({ id: renaming.id, name, type: renaming.type });
//         } catch (e) { console.error(e); }
//         setRenaming(null);
//     }, [renaming, renameFileOrFolder]);

//     // ── Delete confirm ──
//     const handleDeleteConfirm = useCallback(async () => {
//         if (!deletePending) return;
//         try {
//             await deleteFileOrFolder({ id: deletePending.id });
//             if (activeFileId === deletePending.id) closeTab(deletePending.id);
//             if (selectedItem?._id === deletePending.id) setSelectedItem(null);
//         } catch (e) { console.error(e); }
//         setDeletePending(null);
//     }, [deletePending, deleteFileOrFolder, activeFileId, selectedItem, closeTab]);

//     // ── Keyboard on root panel ──
//     const handleRootKeyDown = useCallback((e: React.KeyboardEvent) => {
//         if (e.target !== e.currentTarget) return;
//         if (e.key === 'n' || e.key === 'N') { e.preventDefault(); startCreate('file'); }
//         if (e.key === 'f' || e.key === 'F') { e.preventDefault(); startCreate('folder'); }
//     }, [startCreate]);

//     return (
//         <>
//             <DeleteDialog
//                 item={deletePending}
//                 onConfirm={handleDeleteConfirm}
//                 onCancel={() => setDeletePending(null)}
//             />

//             <div
//                 className="flex flex-col h-full w-full min-w-0 overflow-hidden"
//                 style={{ backgroundColor: '#161b22', borderRight: '1px solid #30363d' }}
//                 onKeyDown={handleRootKeyDown}
//                 tabIndex={-1}
//             >
//                 {/* ── Header ── */}
//                 <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ backgroundColor: '#161b22' }}>
//                     <span className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: '#8b949e' }}>
//                         {projectName}
//                     </span>
//                     <div className="flex items-center gap-0.5">
//                         <Tooltip>
//                             <TooltipTrigger asChild>
//                                 <button
//                                     onClick={() => startCreate('file')}
//                                     className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
//                                 >
//                                     <PlusIcon className="size-3.5" />
//                                 </button>
//                             </TooltipTrigger>
//                             <TooltipContent side="bottom">New File (N)</TooltipContent>
//                         </Tooltip>
//                         <Tooltip>
//                             <TooltipTrigger asChild>
//                                 <button
//                                     onClick={() => startCreate('folder')}
//                                     className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
//                                 >
//                                     <FolderPlusIcon className="size-3.5" />
//                                 </button>
//                             </TooltipTrigger>
//                             <TooltipContent side="bottom">New Folder</TooltipContent>
//                         </Tooltip>
//                         <Tooltip>
//                             <TooltipTrigger asChild>
//                                 <button
//                                     className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
//                                 >
//                                     <RefreshCwIcon className="size-3.5" />
//                                 </button>
//                             </TooltipTrigger>
//                             <TooltipContent side="bottom">Refresh (live)</TooltipContent>
//                         </Tooltip>
//                     </div>
//                 </div>

//                 {/* ── File tree ── */}
//                 <ScrollArea className="flex-1">
//                     <div className="py-0.5 pr-1" role="tree">

//                         {/* Root-level create input */}
//                         {creating && creating.parentId === undefined && (
//                             <CreateInput
//                                 type={creating.type}
//                                 depth={0}
//                                 onSubmit={handleCreateSubmit}
//                                 onCancel={() => setCreating(null)}
//                             />
//                         )}

//                         {rootFiles === undefined && (
//                             <div className="px-4 py-2 text-xs text-muted-foreground/60">Loading…</div>
//                         )}

//                         {rootFiles?.length === 0 && !creating && (
//                             <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
//                                 <p className="text-xs text-muted-foreground/60">No files yet</p>
//                                 <button
//                                     onClick={() => startCreate('file')}
//                                     className="text-xs text-primary hover:underline"
//                                 >
//                                     Create your first file
//                                 </button>
//                             </div>
//                         )}

//                         {rootFiles?.map(item => (
//                             <FileTreeNode
//                                 key={item._id}
//                                 item={item as FileItem}
//                                 depth={0}
//                                 projectId={projectId}
//                                 activeFileId={activeFileId}
//                                 selectedId={selectedItem?._id ?? null}
//                                 onSelect={handleSelect}
//                                 onContextAction={handleContextAction}
//                                 creating={creating}
//                                 onCreateSubmit={handleCreateSubmit}
//                                 onCreateCancel={() => setCreating(null)}
//                                 renaming={renaming}
//                                 onRenameSubmit={handleRenameSubmit}
//                                 onRenameCancel={() => setRenaming(null)}
//                             />
//                         ))}
//                     </div>
//                 </ScrollArea>

//                 {/* ── Status bar ── */}
//                 <div className="px-3 py-1 border-t shrink-0" style={{ borderColor: '#30363d', backgroundColor: '#161b22' }}>
//                     <p className="text-[10px] truncate" style={{ color: '#6e7681' }}>
//                         {rootFiles
//                             ? `${rootFiles.length} item${rootFiles.length !== 1 ? 's' : ''} · Right-click for actions`
//                             : '…'}
//                     </p>
//                 </div>
//             </div>
//         </>


//     );
// };


// src/app/features/ide/components/FileExplorer.tsx
// Migrated to new schema.
// File tree reads from Convex (metadata only).
// File content reads from disk via /api/files.
// All CRUD operations sync both Convex + disk.

'use client';

import { cn } from "@/lib/utils";
import { useCallback, useState, useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
    useGetFolderContents,
    useCreateFileOrFolder,
    useDeleteFileOrFolder,
    useRenameFileOrFolder,
    useSyncFromDisk,
} from "@/src/app/features/projects/hooks/use-file";
import { useEditorStore } from "@/src/store/editor-store";
import { CreateInput } from "@/src/app/features/ide/utils/create-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileIcon, FolderIcon, DefaultFolderOpenedIcon } from "@react-symbols/icons/utils";
import { PlusIcon, FolderPlusIcon, RefreshCwIcon, ChevronRight, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileItem {
    _id: Id<"files">;
    name: string;
    type: "file" | "folder";
    relativePath: string;
    parentPath?: string;
    workspaceId: Id<"workspaces">;
    projectId: Id<"projects">;
    sizeBytes?: number;
    gitStatus?: string;
}

interface CreatingState {
    parentPath?: string;
    type: "file" | "folder";
    depth: number;
}

interface RenamingState {
    item: FileItem;
    depth: number;
}

interface DeletePendingState {
    item: FileItem;
}

// ── Disk API helpers ──────────────────────────────────────────────────────────
// All disk operations go through /api/files

async function diskCreate(
    workspaceId: string,
    relativePath: string,
    isFolder: boolean,
): Promise<void> {
    const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workspaceId,
            path: relativePath,
            action: "create",
            isFolder,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
}

async function diskDelete(
    workspaceId: string,
    relativePath: string,
): Promise<void> {
    const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workspaceId,
            path: relativePath,
            action: "delete",
            recursive: true,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
}

async function diskRename(
    workspaceId: string,
    oldPath: string,
    newPath: string,
): Promise<void> {
    const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workspaceId,
            path: oldPath,
            newPath: newPath,
            action: "rename",
        }),
    });
    if (!res.ok) throw new Error(await res.text());
}

async function diskReadContent(
    workspaceId: string,
    relativePath: string,
): Promise<string> {
    const params = new URLSearchParams({ workspaceId, path: relativePath });
    const res = await fetch(`/api/files?${params}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content ?? "";
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

const DeleteDialog: React.FC<{
    item: DeletePendingState | null;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ item, onConfirm, onCancel }) => (
    <AlertDialog open={!!item} onOpenChange={o => { if (!o) onCancel(); }}>
        <AlertDialogContent size="sm">
            <AlertDialogHeader>
                <AlertDialogTitle>Delete "{item?.item.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                    This permanently deletes the {item?.item.type} from disk and cannot be undone.
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

// ── File tree node ────────────────────────────────────────────────────────────

interface FileTreeNodeProps {
    item: FileItem;
    depth: number;
    workspaceId: Id<"workspaces">;
    projectId: Id<"projects">;
    activeFilePath: string | null;
    selectedPath: string | null;
    onSelect: (item: FileItem) => void;
    onContextAction: (action: string, item: FileItem, depth: number) => void;
    creating: CreatingState | null;
    onCreateSubmit: (name: string) => void;
    onCreateCancel: () => void;
    renaming: RenamingState | null;
    onRenameSubmit: (name: string) => void;
    onRenameCancel: () => void;
}

// Replace the entire FileTreeNode component in FileExplorer.tsx

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
    item, depth, workspaceId, projectId,
    activeFilePath, selectedPath,
    onSelect, onContextAction,
    creating, onCreateSubmit, onCreateCancel,
    renaming, onRenameSubmit, onRenameCancel,
}) => {
    const [open, setOpen] = useState(false);
    const isFolder = item.type === "folder";
    const isActive = item.relativePath === activeFilePath;
    const isSelected = item.relativePath === selectedPath;
    const isRenaming = renaming?.item.relativePath === item.relativePath;

    const children = useGetFolderContents(
        isFolder && open ? workspaceId : null,
        item.relativePath,
    );

    // Show create input INSIDE this folder when:
    // folder is open AND creating.parentPath === this folder's path
    const showCreateInsideFolder =
        isFolder &&
        open &&
        creating?.parentPath === item.relativePath;

    // Show create input AFTER this node (as a sibling) when:
    // this is a FILE and creating.parentPath matches this file's parentPath
    // This handles: right-click file → New File/Folder → input appears alongside
    const showCreateAfterFile =
        !isFolder &&
        creating !== null &&
        creating.parentPath === item.parentPath;

    const handleClick = useCallback(() => {
        onSelect(item);
        if (isFolder) setOpen(o => !o);
    }, [item, isFolder, onSelect]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === " ") handleClick();
        if (e.key === "F2") onContextAction("rename", item, depth);
        if (e.key === "Delete" && e.currentTarget === e.target)
            onContextAction("delete", item, depth);
        if (isFolder) {
            if (e.key === "ArrowRight" && !open) setOpen(true);
            if (e.key === "ArrowLeft" && open) setOpen(false);
        }
    }, [handleClick, item, depth, isFolder, open, onContextAction]);

    const indentPx = depth * 12 + 4;

    return (
        <>
            <div
                role="treeitem"
                aria-expanded={isFolder ? open : undefined}
                aria-selected={isSelected}
            >
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
                                        ? "#313438"
                                        : isSelected
                                            ? "#26282e"
                                            : "transparent",
                                    color: isActive ? "#bcbec4" : "#9d9fa6",
                                }}
                                className={cn(
                                    "group/node flex items-center gap-1 pr-2 py-[3px]",
                                    "text-xs select-none outline-none cursor-pointer",
                                    "transition-colors hover:bg-[#26282e]",
                                    isActive && "font-medium",
                                )}
                            >
                                <span className="shrink-0 size-4 flex items-center justify-center">
                                    {isFolder
                                        ? open
                                            ? <ChevronDown className="size-3 text-muted-foreground/70" />
                                            : <ChevronRight className="size-3 text-muted-foreground/70" />
                                        : null}
                                </span>
                                <span className="shrink-0 size-4 flex items-center justify-center">
                                    {isFolder
                                        ? open
                                            ? <DefaultFolderOpenedIcon className="size-4" />
                                            : <FolderIcon folderName={item.name} className="size-4" />
                                        : <FileIcon fileName={item.name} autoAssign className="size-4" />
                                    }
                                </span>
                                <span className="flex-1 min-w-0 truncate ml-0.5">
                                    {item.name}
                                </span>
                                {item.gitStatus && item.gitStatus !== "clean" && (
                                    <span className={cn(
                                        "size-1.5 rounded-full shrink-0 ml-1",
                                        item.gitStatus === "modified" && "bg-yellow-400",
                                        item.gitStatus === "added" && "bg-green-400",
                                        item.gitStatus === "deleted" && "bg-red-400",
                                        item.gitStatus === "untracked" && "bg-sky-400",
                                    )} />
                                )}
                            </div>
                        )}
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-52">
                        {isFolder && (
                            <>
                                <ContextMenuItem onSelect={() => {
                                    setOpen(true);
                                    onContextAction("new-file", item, depth);
                                }}>
                                    New File <ContextMenuShortcut>N</ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => {
                                    setOpen(true);
                                    onContextAction("new-folder", item, depth);
                                }}>
                                    New Folder <ContextMenuShortcut>F</ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                            </>
                        )}
                        {!isFolder && (
                            <>
                                <ContextMenuItem onSelect={() =>
                                    onContextAction("new-file", item, depth)
                                }>
                                    New File Here
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() =>
                                    onContextAction("new-folder", item, depth)
                                }>
                                    New Folder Here
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                            </>
                        )}
                        <ContextMenuItem onSelect={() =>
                            onContextAction("rename", item, depth)
                        }>
                            Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => {
                            navigator.clipboard.writeText(item.relativePath).catch(() => { });
                        }}>
                            Copy Path
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            onSelect={() => onContextAction("delete", item, depth)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            Delete <ContextMenuShortcut>⌫</ContextMenuShortcut>
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>

                {/* Children inside folder */}
                {isFolder && open && (
                    <div>
                        {/* Create input inside this folder */}
                        {showCreateInsideFolder && (
                            <CreateInput
                                type={creating!.type}
                                depth={depth + 1}
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
                                workspaceId={workspaceId}
                                projectId={projectId}
                                activeFilePath={activeFilePath}
                                selectedPath={selectedPath}
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
                        {children?.length === 0 && !showCreateInsideFolder && (
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

            {/* Create input AFTER a file node (sibling level) */}
            {showCreateAfterFile && (
                <CreateInput
                    type={creating!.type}
                    depth={depth}
                    onSubmit={onCreateSubmit}
                    onCancel={onCreateCancel}
                />
            )}
        </>
    );
};

// ── FileExplorer (main export) ────────────────────────────────────────────────

interface FileExplorerProps {
    projectId: Id<"projects">;
    workspaceId: Id<"workspaces">;
    projectName: string;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
    projectId,
    workspaceId,
    projectName,
}) => {
    const { openFile, activeFilePath, closeTab } = useEditorStore();
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [creating, setCreating] = useState<CreatingState | null>(null);
    const [renaming, setRenaming] = useState<RenamingState | null>(null);
    const [deletePending, setDeletePending] = useState<DeletePendingState | null>(null);

    const rootContents = useGetFolderContents(workspaceId, undefined);
    const createInConvex = useCreateFileOrFolder();
    const deleteInConvex = useDeleteFileOrFolder();
    const renameInConvex = useRenameFileOrFolder();
    const syncFromDisk = useSyncFromDisk();

    // ── Select / open file ────────────────────────────────────────────────────

    const handleSelect = useCallback(async (item: FileItem) => {
        setSelectedPath(item.relativePath);
        if (item.type !== "file") return;

        try {
            // Read content from disk
            const content = await diskReadContent(
                workspaceId as string,
                item.relativePath,
            );
            openFile(item.relativePath, projectId, item.name, content);
        } catch (err) {
            console.error("[FileExplorer] Failed to read file:", err);
        }
    }, [workspaceId, projectId, openFile]);

    // ── Create ────────────────────────────────────────────────────────────────

    const handleCreateSubmit = useCallback(async (name: string) => {
        if (!creating) return;
        const isFolder = creating.type === "folder";
        const relativePath = creating.parentPath
            ? `${creating.parentPath}/${name}`
            : name;

        try {
            // 1. Disk first
            await diskCreate(workspaceId as string, relativePath, isFolder);

            // 2. Convex metadata
            await createInConvex({
                workspaceId,
                projectId,
                relativePath,
                name,
                type: creating.type,
                parentPath: creating.parentPath,
            });
        } catch (err) {
            console.error("[FileExplorer] Create failed:", err);
        }
        setCreating(null);
    }, [creating, workspaceId, projectId, createInConvex]);

    // ── Rename ────────────────────────────────────────────────────────────────

    const handleRenameSubmit = useCallback(async (newName: string) => {
        if (!renaming || newName === renaming.item.name) {
            setRenaming(null);
            return;
        }
        const old = renaming.item.relativePath;
        const parentPart = renaming.item.parentPath
            ? `${renaming.item.parentPath}/`
            : "";
        const newPath = `${parentPart}${newName}`;

        try {
            // 1. Disk
            await diskRename(workspaceId as string, old, newPath);

            // 2. Convex — updates this node + all descendants
            await renameInConvex({
                workspaceId,
                oldRelativePath: old,
                newRelativePath: newPath,
                newName,
            });

            // Close old tab if open, re-open at new path
            if (activeFilePath === old) {
                closeTab(old);
                // Content is now at new path — user can re-click to open
            }
        } catch (err) {
            console.error("[FileExplorer] Rename failed:", err);
        }
        setRenaming(null);
    }, [renaming, workspaceId, renameInConvex, activeFilePath, closeTab]);

    // ── Delete ────────────────────────────────────────────────────────────────

    const handleDeleteConfirm = useCallback(async () => {
        if (!deletePending) return;
        const { item } = deletePending;

        try {
            // 1. Disk (recursive)
            await diskDelete(workspaceId as string, item.relativePath);

            // 2. Convex (recursive via mutation)
            await deleteInConvex({
                workspaceId,
                relativePath: item.relativePath,
            });

            if (activeFilePath === item.relativePath) {
                closeTab(item.relativePath);
            }
            if (selectedPath === item.relativePath) {
                setSelectedPath(null);
            }
        } catch (err) {
            console.error("[FileExplorer] Delete failed:", err);
        }
        setDeletePending(null);
    }, [deletePending, workspaceId, deleteInConvex, activeFilePath, selectedPath, closeTab]);

    // ── Context menu actions ──────────────────────────────────────────────────

    const handleContextAction = useCallback((
        action: string,
        item: FileItem,
        depth: number,
    ) => {
        setSelectedPath(item.relativePath);

        switch (action) {
            case "new-file":
            case "new-folder": {
                const type = action === "new-file" ? "file" : "folder";

                if (item.type === "folder") {
                    // Create inside the clicked folder
                    setCreating({
                        parentPath: item.relativePath,
                        type,
                        depth: depth + 1,
                    });
                } else {
                    // Create alongside the clicked file (in its parent folder)
                    setCreating({
                        parentPath: item.parentPath,  // may be undefined (root)
                        type,
                        depth,
                    });
                }
                break;
            }
            case "rename":
                setRenaming({ item, depth });
                setCreating(null);
                break;
            case "delete":
                setDeletePending({ item });
                break;
        }
    }, []);

    // ── Replace FileTreeNode to fix showCreateUnder for files ─────────────────────
    // A file can't be "opened" so the create input must show at the parent level.
    // We lift the create input rendering: show it AFTER the file node
    // when parentPath matches (not inside a non-openable folder).

    // In FileTreeNode, replace the showCreateUnder logic and its rendering:

    // OLD:
    // const showCreateUnder = creating?.parentPath === item.relativePath && open;

    // NEW — for folders: show inside when open
    // For files: show AFTER the file row (sibling, not child)

    // ── Keyboard on root ──────────────────────────────────────────────────────

    const handleRootKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "n" || e.key === "N") {
            e.preventDefault();
            setCreating({ parentPath: undefined, type: "file", depth: 0 });
        }
        if (e.key === "f" || e.key === "F") {
            e.preventDefault();
            setCreating({ parentPath: undefined, type: "folder", depth: 0 });
        }
    }, []);

    return (
        <>
            <DeleteDialog
                item={deletePending}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeletePending(null)}
            />

            <div
                className="flex flex-col h-full w-full min-w-0 overflow-y-auto"
                style={{ backgroundColor: "#141414", borderRight: "1px solid #3c3f41" }}
                onKeyDown={handleRootKeyDown}
                tabIndex={-1}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-3 py-2 shrink-0"
                    style={{ backgroundColor: "#141414" }}
                >
                    <span
                        className="text-[10px] font-semibold uppercase tracking-widest truncate"
                        style={{ color: "#8b949e" }}
                    >
                        {projectName}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setCreating({
                                        parentPath: undefined, type: "file", depth: 0
                                    })}
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
                                    onClick={() => setCreating({
                                        parentPath: undefined, type: "folder", depth: 0
                                    })}
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
                                    title="Refresh"
                                >
                                    <RefreshCwIcon className="size-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Refresh</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {/* File tree */}
                <ScrollArea className="flex-1">
                    <div className="py-0.5 pr-1" role="tree">

                        {/* Root create input */}
                        {creating && creating.parentPath === undefined && (
                            <CreateInput
                                type={creating.type}
                                depth={0}
                                onSubmit={handleCreateSubmit}
                                onCancel={() => setCreating(null)}
                            />
                        )}

                        {rootContents === undefined && (
                            <div className="px-4 py-2 text-xs text-muted-foreground/60">
                                Loading…
                            </div>
                        )}

                        {rootContents?.length === 0 && !creating && (
                            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                                <p className="text-xs text-muted-foreground/60">
                                    No files yet
                                </p>
                                <button
                                    onClick={() => setCreating({
                                        parentPath: undefined, type: "file", depth: 0
                                    })}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Create your first file
                                </button>
                            </div>
                        )}

                        {rootContents?.map(item => (
                            <FileTreeNode
                                key={item._id}
                                item={item as FileItem}
                                depth={0}
                                workspaceId={workspaceId}
                                projectId={projectId}
                                activeFilePath={activeFilePath}
                                selectedPath={selectedPath}
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

                {/* Status bar */}
                <div
                    className="px-3 py-1 border-t shrink-0"
                    style={{ borderColor: "#3c3f41", backgroundColor: "#1e1f22" }}
                >
                    <p className="text-[10px] truncate" style={{ color: "#6f737a" }}>
                        {rootContents !== undefined
                            ? `${rootContents.length} item${rootContents.length !== 1 ? "s" : ""} · Right-click for actions`
                            : "…"}
                    </p>
                </div>
            </div>
        </>
    );
};