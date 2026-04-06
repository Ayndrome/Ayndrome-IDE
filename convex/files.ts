// import { v } from "convex/values";
// import { mutation, query } from "./_generated/server";
// import { verfiyAuth } from "./auth";
// import { Doc, Id } from "./_generated/dataModel";

// export const getFolderFiles = query({
//     args: { projectId: v.id("projects"), parentId: v.optional(v.id("files")) },
//     handler: async (ctx, args) => {

//         const identity = await verfiyAuth(ctx);

//         if (!identity) {
//             throw new Error("Unauthorized");
//         }

//         const project = await ctx.db.get("projects", args.projectId);

//         if (!project) {
//             throw new Error("Project not found");
//         }

//         const files = await ctx.db.query("files")
//             .withIndex("by_project_parent", (q) => q.eq("projectId", args.projectId).eq("parentId", args.parentId)).collect();

//         // sort the files and folders alphabetically
//         files.sort((a, b) => {
//             if (a.type === 'folder' && b.type === 'file') return -1;
//             if (a.type == 'file' && b.type === 'folder') return 1;
//             return a.name.localeCompare(b.name);
//         });

//         return files;
//     },
// });


// /** Get a single file document by its ID */
// export const getFile = query({
//     args: { fileId: v.id("files") },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);
//         if (!identity) throw new Error("Unauthorized");
//         return await ctx.db.get(args.fileId);
//     },
// });


// /** Return the full ancestor path of a file as an array of names, e.g. ["src", "utils", "index.ts"] */
// export const getFilePath = query({
//     args: { projectId: v.id("projects"), fileId: v.id("files") },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);
//         if (!identity) throw new Error("Unauthorized");

//         const path: string[] = [];
//         let currentId: Id<"files"> | undefined = args.fileId;

//         // Walk up from the file to the root, collecting names
//         while (currentId) {
//             const node: Doc<"files"> | null = await ctx.db.get(currentId);
//             if (!node || node.projectId !== args.projectId) break;
//             path.unshift(node.name);
//             currentId = node.parentId ?? undefined;
//         }

//         return path; // e.g. ["src", "utils", "index.ts"]
//     },
// });



// export const createFileOrFolder = mutation({
//     args: {
//         projectId: v.id("projects"),
//         name: v.string(),
//         type: v.union(v.literal("file"), v.literal("folder")),
//         parentId: v.optional(v.id("files")),
//         content: v.optional(v.string()),
//     },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);

//         if (!identity) {
//             throw new Error("Unauthorized");
//         }

//         const project = await ctx.db.get("projects", args.projectId);

//         if (!project) {
//             throw new Error("Project not found");
//         }

//         // check if the a file with same name already exists in the same parent folder
//         const existingFile = await ctx.db.query("files")
//             .withIndex("by_project_parent", (q) => q.eq("projectId", args.projectId).eq("parentId", args.parentId))
//             .filter((q) => q.eq(q.field("name"), args.name))
//             .first();

//         if (existingFile && args.type === existingFile.type && args.parentId === existingFile.parentId) {
//             throw new Error("File already exists");
//         }

//         const file = await ctx.db.insert("files", {
//             name: args.name,
//             projectId: args.projectId,
//             type: args.type,
//             parentId: args.parentId,
//             content: args.content,
//             createdAt: Date.now(),
//             updatedAt: Date.now(),
//         });

//         return file;
//     },
// });


// export const renameFileOrFolder = mutation({
//     args: {
//         id: v.id("files"),
//         name: v.string(),
//         type: v.union(v.literal("file"), v.literal("folder")),
//     },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);

//         if (!identity) {
//             throw new Error("Unauthorized");
//         }

//         const file = await ctx.db.get("files", args.id);

//         if (!file) {
//             throw new Error("File not found");
//         }

//         // check if the a file with new renamed name already exists in the same parent folder
//         const existingFile = await ctx.db.query("files")
//             .withIndex("by_project_parent", (q) => q.eq("projectId", file.projectId).eq("parentId", file.parentId))
//             .filter((q) => q.eq(q.field("name"), args.name))
//             .first();

//         if (existingFile && args.type === existingFile.type && existingFile._id !== args.id) {
//             throw new Error("File already exists");
//         }

//         await ctx.db.patch(args.id, {
//             name: args.name,
//             type: args.type,
//             updatedAt: Date.now(),
//         });

//         return file;
//     },
// });


// export const deleteFileOrFolder = mutation({
//     args: {
//         id: v.id("files"),
//     },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);

//         if (!identity) {
//             throw new Error("Unauthorized");
//         }

//         // recursively delete all the files and folders

//         const recursiveDelete = async (fileId: Id<'files'>) => {

//             const item = await ctx.db.get("files", fileId);

//             if (!item) {
//                 return;
//             }

//             if (item.type === 'file') {
//                 await ctx.db.delete(fileId);
//                 return;
//             }

//             const children = await ctx.db.query("files")
//                 .withIndex("by_parentId", (q) => q.eq("parentId", fileId)).collect();

//             for (const child of children) {
//                 await recursiveDelete(child._id);
//             }

//             await ctx.db.delete(fileId);
//         };

//         await recursiveDelete(args.id);


//     },
// });


// export const updateFileContent = mutation({
//     args: {
//         id: v.id("files"),
//         content: v.string(),
//     },
//     handler: async (ctx, args) => {
//         const identity = await verfiyAuth(ctx);

//         if (!identity) {
//             throw new Error("Unauthorized");
//         }

//         const file = await ctx.db.get("files", args.id);

//         if (!file) {
//             throw new Error("File not found");
//         }

//         await ctx.db.patch(args.id, {
//             content: args.content,
//             updatedAt: Date.now(),
//         });

//         return file;
//     },
// });


// convex/files.ts — complete rewrite
// New schema: relativePath, parentPath, workspaceId, NO content field.
// File content lives on disk only, read/written via /api/files route.
// This table is purely the file tree metadata for sidebar rendering.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verfiyAuth } from "./auth";
import { Id } from "./_generated/dataModel";

// ── Get direct children of a folder (or root) ─────────────────────────────────
// parentPath = undefined → root level files/folders
// parentPath = "src"     → direct children of src/

export const getFolderContents = query({
    args: {
        workspaceId: v.id("workspaces"),
        parentPath: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        const items = await ctx.db
            .query("files")
            .withIndex("by_workspace_parent", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("parentPath", args.parentPath)
            )
            .collect();

        // Folders first, then alphabetical
        items.sort((a, b) => {
            if (a.type !== b.type)
                return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return items;
    },
});

// ── Get single file by relativePath ───────────────────────────────────────────

export const getByPath = query({
    args: {
        workspaceId: v.id("workspaces"),
        relativePath: v.string(),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        return await ctx.db
            .query("files")
            .withIndex("by_workspace_path", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("relativePath", args.relativePath)
            )
            .first();
    },
});

// ── Get all files in workspace (for search, tree sync) ────────────────────────

export const getAllFiles = query({
    args: { workspaceId: v.id("workspaces") },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        return await ctx.db
            .query("files")
            .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
            .collect();
    },
});

// ── Create file or folder ──────────────────────────────────────────────────────
// relativePath must be unique within a workspace.
// parentPath is derived from relativePath automatically.

export const createFileOrFolder = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        projectId: v.id("projects"),
        relativePath: v.string(),
        name: v.string(),
        type: v.union(v.literal("file"), v.literal("folder")),
        parentPath: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        // Check uniqueness
        const existing = await ctx.db
            .query("files")
            .withIndex("by_workspace_path", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("relativePath", args.relativePath)
            )
            .first();

        if (existing) throw new Error(`Already exists: ${args.relativePath}`);

        return await ctx.db.insert("files", {
            workspaceId: args.workspaceId,
            projectId: args.projectId,
            relativePath: args.relativePath,
            name: args.name,
            type: args.type,
            parentPath: args.parentPath,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

// ── Rename file or folder ──────────────────────────────────────────────────────
// Updates this node + all descendants (path prefix update).

export const renameFileOrFolder = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        oldRelativePath: v.string(),
        newRelativePath: v.string(),
        newName: v.string(),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        // Find target node
        const target = await ctx.db
            .query("files")
            .withIndex("by_workspace_path", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("relativePath", args.oldRelativePath)
            )
            .first();

        if (!target) throw new Error(`Not found: ${args.oldRelativePath}`);

        // Update the node itself
        await ctx.db.patch(target._id, {
            relativePath: args.newRelativePath,
            name: args.newName,
            parentPath: _parentPath(args.newRelativePath),
            updatedAt: Date.now(),
        });

        // If folder — update all descendants' relativePaths
        if (target.type === "folder") {
            const all = await ctx.db
                .query("files")
                .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
                .collect();

            const prefix = args.oldRelativePath + "/";
            for (const item of all) {
                if (item.relativePath.startsWith(prefix)) {
                    const newPath = args.newRelativePath + "/" +
                        item.relativePath.slice(prefix.length);
                    await ctx.db.patch(item._id, {
                        relativePath: newPath,
                        parentPath: _parentPath(newPath),
                        updatedAt: Date.now(),
                    });
                }
            }
        }

        return target._id;
    },
});

// ── Delete file or folder (recursive) ────────────────────────────────────────

export const deleteFileOrFolder = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        relativePath: v.string(),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        const all = await ctx.db
            .query("files")
            .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
            .collect();

        // Delete target + all descendants
        const prefix = args.relativePath + "/";
        for (const item of all) {
            if (
                item.relativePath === args.relativePath ||
                item.relativePath.startsWith(prefix)
            ) {
                await ctx.db.delete(item._id);
            }
        }
    },
});

// ── Update metadata (size, gitStatus) ────────────────────────────────────────

export const updateMeta = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        relativePath: v.string(),
        sizeBytes: v.optional(v.number()),
        gitStatus: v.optional(v.union(
            v.literal("modified"),
            v.literal("added"),
            v.literal("deleted"),
            v.literal("untracked"),
            v.literal("clean"),
        )),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        const item = await ctx.db
            .query("files")
            .withIndex("by_workspace_path", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("relativePath", args.relativePath)
            )
            .first();

        if (!item) return; // file may have been deleted — safe to ignore

        await ctx.db.patch(item._id, {
            sizeBytes: args.sizeBytes,
            gitStatus: args.gitStatus,
            updatedAt: Date.now(),
        });
    },
});

// ── Sync entire file tree from disk ──────────────────────────────────────────
// Called on workspace open to reconcile Convex with actual disk state.
// Adds missing entries, removes deleted ones.

export const syncFromDisk = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        projectId: v.id("projects"),
        diskEntries: v.array(v.object({
            relativePath: v.string(),
            name: v.string(),
            type: v.union(v.literal("file"), v.literal("folder")),
            parentPath: v.optional(v.string()),
            sizeBytes: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        // Build set of disk paths
        const diskPaths = new Set(args.diskEntries.map(e => e.relativePath));

        // Get all existing Convex entries for this workspace
        const existing = await ctx.db
            .query("files")
            .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
            .collect();

        const existingByPath = new Map(existing.map(e => [e.relativePath, e]));

        // Delete Convex entries that no longer exist on disk
        for (const item of existing) {
            if (!diskPaths.has(item.relativePath)) {
                await ctx.db.delete(item._id);
            }
        }

        // Insert disk entries that don't exist in Convex
        for (const entry of args.diskEntries) {
            if (!existingByPath.has(entry.relativePath)) {
                await ctx.db.insert("files", {
                    workspaceId: args.workspaceId,
                    projectId: args.projectId,
                    relativePath: entry.relativePath,
                    name: entry.name,
                    type: entry.type,
                    parentPath: entry.parentPath,
                    sizeBytes: entry.sizeBytes,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }
        }

        return { synced: args.diskEntries.length };
    },
});

// ── Helper ────────────────────────────────────────────────────────────────────

function _parentPath(relativePath: string): string | undefined {
    const parts = relativePath.split("/");
    if (parts.length <= 1) return undefined;
    return parts.slice(0, -1).join("/");
}


// convex/files.ts — update internalCreateFile args to accept null

export const internalCreateFile = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        projectId: v.id("projects"),
        relativePath: v.string(),
        name: v.string(),
        type: v.union(v.literal("file"), v.literal("folder")),
        parentPath: v.optional(v.string()),  // undefined only, not null
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("files")
            .withIndex("by_workspace_path", q =>
                q.eq("workspaceId", args.workspaceId)
                    .eq("relativePath", args.relativePath)
            )
            .first();

        if (existing) return existing._id;

        return await ctx.db.insert("files", {
            workspaceId: args.workspaceId,
            projectId: args.projectId,
            relativePath: args.relativePath,
            name: args.name,
            type: args.type,
            parentPath: args.parentPath,  // undefined is fine here
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

export const internalDeleteFile = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        relativePath: v.string(),
    },
    handler: async (ctx, args) => {
        const all = await ctx.db
            .query("files")
            .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
            .collect();

        const prefix = args.relativePath + "/";
        for (const item of all) {
            if (
                item.relativePath === args.relativePath ||
                item.relativePath.startsWith(prefix)
            ) {
                await ctx.db.delete(item._id);
            }
        }
    },
});