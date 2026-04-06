// import { useMutation, useQuery } from "convex/react";
// import { api } from "@/convex/_generated/api";
// import { Id } from "@/convex/_generated/dataModel";

// /** Fetch a single file by its ID */
// export const useGetFile = (fileId: Id<"files"> | null) => {
//     return useQuery(api.files.getFile, fileId ? { fileId } : "skip");
// };

// /** Fetch the ancestor path of a file for breadcrumb navigation */
// export const useGetFilePath = (projectId: Id<"projects"> | null, fileId: Id<"files"> | null) => {
//     return useQuery(
//         api.files.getFilePath,
//         projectId && fileId ? { projectId, fileId } : "skip"
//     );
// };

// /** Fetch direct children of a folder (or root if parentId omitted) */
// export const useGetFolderFiles = (projectId: Id<"projects">, parentId?: Id<"files">) => {
//     return useQuery(api.files.getFolderFiles, { projectId, parentId });
// };

// export const useCreateFileOrFolder = () => useMutation(api.files.createFileOrFolder);
// export const useDeleteFileOrFolder = () => useMutation(api.files.deleteFileOrFolder);
// export const useUpdateFileContent = () => useMutation(api.files.updateFileContent);
// export const useRenameFileOrFolder = () => useMutation(api.files.renameFileOrFolder);

// src/app/features/projects/hooks/use-file.ts
// Migrated to new schema — workspaceId replaces projectId for file ops.
// Content hooks removed — content lives on disk, not Convex.

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

// ── Read queries ──────────────────────────────────────────────────────────────

/** Direct children of a folder (or workspace root if parentPath omitted) */
export const useGetFolderContents = (
    workspaceId: Id<"workspaces"> | null,
    parentPath?: string,
) => {
    return useQuery(
        api.files.getFolderContents,
        workspaceId ? { workspaceId, parentPath } : "skip"
    );
};

/** Single file by its relative path */
export const useGetFileByPath = (
    workspaceId: Id<"workspaces"> | null,
    relativePath: string | null,
) => {
    return useQuery(
        api.files.getByPath,
        workspaceId && relativePath
            ? { workspaceId, relativePath }
            : "skip"
    );
};

/** All files in workspace (for search, tree) */
export const useGetAllFiles = (workspaceId: Id<"workspaces"> | null) => {
    return useQuery(
        api.files.getAllFiles,
        workspaceId ? { workspaceId } : "skip"
    );
};

// ── Write mutations ───────────────────────────────────────────────────────────

export const useCreateFileOrFolder = () =>
    useMutation(api.files.createFileOrFolder);

export const useDeleteFileOrFolder = () =>
    useMutation(api.files.deleteFileOrFolder);

export const useRenameFileOrFolder = () =>
    useMutation(api.files.renameFileOrFolder);

export const useSyncFromDisk = () =>
    useMutation(api.files.syncFromDisk);

export const useUpdateMeta = () =>
    useMutation(api.files.updateMeta);

// ── Workspace hooks ───────────────────────────────────────────────────────────

export const useGetWorkspaceByProject = (projectId: Id<"projects"> | null) =>
    useQuery(
        api.workspaces.getByProject,
        projectId ? { projectId } : "skip"
    );

export const useProvisionWorkspace = () =>
    useMutation(api.workspaces.provision);

export const useSaveEditorState = () =>
    useMutation(api.workspaces.saveEditorState);