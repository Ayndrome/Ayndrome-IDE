// convex/chatThreads.ts — fix workspaceId type to Id<"workspaces">

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verfiyAuth } from "./auth";

export const getAllThreads = query({
    args: { workspaceId: v.id("workspaces") },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        return await ctx.db
            .query("chatThreads")
            .withIndex("by_workspace", q => q.eq("workspaceId", args.workspaceId))
            .collect();
    },
});

export const upsertThread = mutation({
    args: {
        threadId: v.string(),
        workspaceId: v.id("workspaces"),
        title: v.string(),
        data: v.string(),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        const existing = await ctx.db
            .query("chatThreads")
            .withIndex("by_thread", q =>
                q.eq("userId", profile.subject)
                    .eq("threadId", args.threadId)
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                data: args.data,
                title: args.title,
                updatedAt: Date.now(),
            });
        } else {
            await ctx.db.insert("chatThreads", {
                userId: profile.subject,
                workspaceId: args.workspaceId,
                threadId: args.threadId,
                title: args.title,
                data: args.data,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    },
});

export const deleteThread = mutation({
    args: { threadId: v.string() },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const existing = await ctx.db
            .query("chatThreads")
            .withIndex("by_thread", q =>
                q.eq("userId", profile.subject)
                    .eq("threadId", args.threadId)
            )
            .first();
        if (existing) await ctx.db.delete(existing._id);
    },
});