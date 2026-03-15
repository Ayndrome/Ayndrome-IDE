import { query } from "./_generated/server";
import { v } from "convex/values";
import { verfiyAuth } from "./auth";
import { mutation } from "./_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
    importStatus: v.optional(v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    )),
  },

  handler: async (ctx, args) => {

    const profile = await verfiyAuth(ctx);

    return await ctx.db.insert("projects", {
      name: args.name,
      userId: profile.subject,
      updatedAt: Date.now(),
      importStatus: args.importStatus,
    });
  },
});

export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await verfiyAuth(ctx);

    return await ctx.db.query("projects").withIndex("by_userId", q => q.eq("userId", profile.subject)).take(args.limit);
  }
})

export const get = query({
  args: {},
  handler: async (ctx) => {
    const profile = await verfiyAuth(ctx);

    return await ctx.db.query("projects").withIndex("by_userId", q => q.eq("userId", profile.subject)).collect();
  }
})

export const getById = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const profile = await verfiyAuth(ctx);
    const project = await ctx.db.get(args.id);
    if (!project) return null;
    if (project.userId !== profile.subject) throw new Error("Unauthorized");
    return project;
  },
});
