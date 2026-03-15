import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verfiyAuth } from "./auth";


export const getAllThreads = query({
    args: {},
    handler: async (ctx) => {
        const identity = await verfiyAuth(ctx);
        if (!identity) return [];
        return await ctx.db
            .query("chatThreads")
            .withIndex("by_user", (q) => q.eq("userId", identity.subject))
            .collect();
    },
});

export const upsertThread = mutation({
    args: { threadId: v.string(), data: v.string() },
    handler: async (ctx, { threadId, data }) => {
        const identity = await verfiyAuth(ctx);
        if (!identity) throw new Error("Not authenticated");

        const existing = await ctx.db
            .query("chatThreads")
            .withIndex("by_thread", (q) =>
                q.eq("userId", identity.subject).eq("threadId", threadId)
            )
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, { data, updatedAt: Date.now() });
        } else {
            await ctx.db.insert("chatThreads", {
                userId: identity.subject,
                threadId,
                data,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    },
});

export const deleteThread = mutation({
    args: { threadId: v.string() },
    handler: async (ctx, { threadId }) => {
        const identity = await verfiyAuth(ctx);
        if (!identity) throw new Error("Not authenticated");

        const existing = await ctx.db
            .query("chatThreads")
            .withIndex("by_thread", (q) =>
                q.eq("userId", identity.subject).eq("threadId", threadId)
            )
            .unique();

        if (existing) await ctx.db.delete(existing._id);
    },
});