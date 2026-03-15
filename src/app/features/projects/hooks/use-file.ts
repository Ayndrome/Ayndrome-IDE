import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

/** Fetch a single file by its ID */
export const useGetFile = (fileId: Id<"files"> | null) => {
    return useQuery(api.files.getFile, fileId ? { fileId } : "skip");
};

/** Fetch the ancestor path of a file for breadcrumb navigation */
export const useGetFilePath = (projectId: Id<"projects"> | null, fileId: Id<"files"> | null) => {
    return useQuery(
        api.files.getFilePath,
        projectId && fileId ? { projectId, fileId } : "skip"
    );
};

/** Fetch direct children of a folder (or root if parentId omitted) */
export const useGetFolderFiles = (projectId: Id<"projects">, parentId?: Id<"files">) => {
    return useQuery(api.files.getFolderFiles, { projectId, parentId });
};

export const useCreateFileOrFolder = () => useMutation(api.files.createFileOrFolder);
export const useDeleteFileOrFolder = () => useMutation(api.files.deleteFileOrFolder);
export const useUpdateFileContent = () => useMutation(api.files.updateFileContent);
export const useRenameFileOrFolder = () => useMutation(api.files.renameFileOrFolder);