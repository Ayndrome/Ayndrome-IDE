// convex/workspaces.ts
// Workspace lifecycle — provision, get, update container status.
// Called from /api/workspace/route.ts after sandbox-manager creates the container.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verfiyAuth } from "./auth";

// ── Get workspace by project ──────────────────────────────────────────────────

export const getByProject = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const ws = await ctx.db
            .query("workspaces")
            .withIndex("by_projectId", q => q.eq("projectId", args.projectId))
            .first();
        if (!ws) return null;
        if (ws.userId !== profile.subject) throw new Error("Unauthorized");
        return ws;
    },
});

// ── Get workspace by its own _id ──────────────────────────────────────────────

export const getById = query({
    args: { workspaceId: v.id("workspaces") },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const ws = await ctx.db.get(args.workspaceId);
        if (!ws) return null;
        if (ws.userId !== profile.subject) throw new Error("Unauthorized");
        return ws;
    },
});

// ── Provision — create or return existing workspace ───────────────────────────
// Idempotent — safe to call every time a project is opened.

export const provision = mutation({
    args: {
        projectId: v.id("projects"),
        name: v.string(),
        diskPath: v.string(),
        gitBranch: v.optional(v.string()),
        gitRemoteUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);

        // Return existing workspace if already provisioned
        const existing = await ctx.db
            .query("workspaces")
            .withIndex("by_projectId", q => q.eq("projectId", args.projectId))
            .first();

        if (existing) {
            // Update lastActiveAt + diskPath (may have changed)
            await ctx.db.patch(existing._id, {
                lastActiveAt: Date.now(),
                diskPath: args.diskPath,
                containerStatus: "running",
            });
            return existing._id;
        }

        // Create new workspace record
        const workspaceId = await ctx.db.insert("workspaces", {
            userId: profile.subject,
            projectId: args.projectId,
            name: args.name,
            diskPath: args.diskPath,
            gitBranch: args.gitBranch ?? "main",
            gitRemoteUrl: args.gitRemoteUrl,
            containerStatus: "running",
            openTabs: [],
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
        });

        // Back-link project → workspace
        await ctx.db.patch(args.projectId, { workspaceId });

        return workspaceId;
    },
});

// ── Update container status ───────────────────────────────────────────────────

export const updateStatus = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        containerStatus: v.union(
            v.literal("not_created"),
            v.literal("starting"),
            v.literal("running"),
            v.literal("stopping"),
            v.literal("stopped"),
            v.literal("error"),
        ),
        containerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const ws = await ctx.db.get(args.workspaceId);
        if (!ws || ws.userId !== profile.subject) throw new Error("Unauthorized");

        await ctx.db.patch(args.workspaceId, {
            containerStatus: args.containerStatus,
            containerId: args.containerId,
            lastActiveAt: Date.now(),
        });
    },
});

// ── Save editor state (open tabs + active file) ───────────────────────────────

export const saveEditorState = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        openTabs: v.array(v.string()),
        activeFilePath: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const ws = await ctx.db.get(args.workspaceId);
        if (!ws || ws.userId !== profile.subject) throw new Error("Unauthorized");

        await ctx.db.patch(args.workspaceId, {
            openTabs: args.openTabs,
            activeFilePath: args.activeFilePath,
            lastActiveAt: Date.now(),
        });
    },
});

// ── Update git state after commit/push ────────────────────────────────────────

export const updateGitState = mutation({
    args: {
        workspaceId: v.id("workspaces"),
        lastCommitSha: v.optional(v.string()),
        lastCommitMessage: v.optional(v.string()),
        gitBranch: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const profile = await verfiyAuth(ctx);
        const ws = await ctx.db.get(args.workspaceId);
        if (!ws || ws.userId !== profile.subject) throw new Error("Unauthorized");

        await ctx.db.patch(args.workspaceId, {
            lastCommitSha: args.lastCommitSha,
            lastCommitMessage: args.lastCommitMessage,
            gitBranch: args.gitBranch ?? ws.gitBranch,
        });
    },
});