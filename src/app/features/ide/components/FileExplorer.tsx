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