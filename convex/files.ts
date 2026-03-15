import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verfiyAuth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";

export const getFolderFiles = query({
    args: { projectId: v.id("projects"), parentId: v.optional(v.id("files")) },
    handler: async (ctx, args) => {

        const identity = await verfiyAuth(ctx);

        if (!identity) {
            throw new Error("Unauthorized");
        }

        const project = await ctx.db.get("projects", args.projectId);

        if (!project) {
            throw new Error("Project not found");
        }

        const files = await ctx.db.query("files")
            .withIndex("by_project_parent", (q) => q.eq("projectId", args.projectId).eq("parentId", args.parentId)).collect();

        // sort the files and folders alphabetically
        files.sort((a, b) => {
            if (a.type === 'folder' && b.type === 'file') return -1;
            if (a.type == 'file' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });

        return files;
    },
});


/** Get a single file document by its ID */
export const getFile = query({
    args: { fileId: v.id("files") },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);
        if (!identity) throw new Error("Unauthorized");
        return await ctx.db.get(args.fileId);
    },
});


/** Return the full ancestor path of a file as an array of names, e.g. ["src", "utils", "index.ts"] */
export const getFilePath = query({
    args: { projectId: v.id("projects"), fileId: v.id("files") },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);
        if (!identity) throw new Error("Unauthorized");

        const path: string[] = [];
        let currentId: Id<"files"> | undefined = args.fileId;

        // Walk up from the file to the root, collecting names
        while (currentId) {
            const node: Doc<"files"> | null = await ctx.db.get(currentId);
            if (!node || node.projectId !== args.projectId) break;
            path.unshift(node.name);
            currentId = node.parentId ?? undefined;
        }

        return path; // e.g. ["src", "utils", "index.ts"]
    },
});



export const createFileOrFolder = mutation({
    args: {
        projectId: v.id("projects"),
        name: v.string(),
        type: v.union(v.literal("file"), v.literal("folder")),
        parentId: v.optional(v.id("files")),
        content: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);

        if (!identity) {
            throw new Error("Unauthorized");
        }

        const project = await ctx.db.get("projects", args.projectId);

        if (!project) {
            throw new Error("Project not found");
        }

        // check if the a file with same name already exists in the same parent folder
        const existingFile = await ctx.db.query("files")
            .withIndex("by_project_parent", (q) => q.eq("projectId", args.projectId).eq("parentId", args.parentId))
            .filter((q) => q.eq(q.field("name"), args.name))
            .first();

        if (existingFile && args.type === existingFile.type && args.parentId === existingFile.parentId) {
            throw new Error("File already exists");
        }

        const file = await ctx.db.insert("files", {
            name: args.name,
            projectId: args.projectId,
            type: args.type,
            parentId: args.parentId,
            content: args.content,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return file;
    },
});


export const renameFileOrFolder = mutation({
    args: {
        id: v.id("files"),
        name: v.string(),
        type: v.union(v.literal("file"), v.literal("folder")),
    },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);

        if (!identity) {
            throw new Error("Unauthorized");
        }

        const file = await ctx.db.get("files", args.id);

        if (!file) {
            throw new Error("File not found");
        }

        // check if the a file with new renamed name already exists in the same parent folder
        const existingFile = await ctx.db.query("files")
            .withIndex("by_project_parent", (q) => q.eq("projectId", file.projectId).eq("parentId", file.parentId))
            .filter((q) => q.eq(q.field("name"), args.name))
            .first();

        if (existingFile && args.type === existingFile.type && existingFile._id !== args.id) {
            throw new Error("File already exists");
        }

        await ctx.db.patch(args.id, {
            name: args.name,
            type: args.type,
            updatedAt: Date.now(),
        });

        return file;
    },
});


export const deleteFileOrFolder = mutation({
    args: {
        id: v.id("files"),
    },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);

        if (!identity) {
            throw new Error("Unauthorized");
        }

        // recursively delete all the files and folders

        const recursiveDelete = async (fileId: Id<'files'>) => {

            const item = await ctx.db.get("files", fileId);

            if (!item) {
                return;
            }

            if (item.type === 'file') {
                await ctx.db.delete(fileId);
                return;
            }

            const children = await ctx.db.query("files")
                .withIndex("by_parentId", (q) => q.eq("parentId", fileId)).collect();

            for (const child of children) {
                await recursiveDelete(child._id);
            }

            await ctx.db.delete(fileId);
        };

        await recursiveDelete(args.id);


    },
});


export const updateFileContent = mutation({
    args: {
        id: v.id("files"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await verfiyAuth(ctx);

        if (!identity) {
            throw new Error("Unauthorized");
        }

        const file = await ctx.db.get("files", args.id);

        if (!file) {
            throw new Error("File not found");
        }

        await ctx.db.patch(args.id, {
            content: args.content,
            updatedAt: Date.now(),
        });

        return file;
    },
});