// import { defineSchema, defineTable } from "convex/server";
// import { v } from "convex/values";

// export default defineSchema({

//     projects: defineTable({
//         name: v.string(),
//         userId: v.string(),
//         updatedAt: v.optional(v.number()),
//         importStatus: v.optional(v.union(
//             v.literal("processing"),
//             v.literal("completed"),
//             v.literal("failed")
//         )),

//         exportStatus: v.optional(v.union(
//             v.literal("processing"),
//             v.literal("completed"),
//             v.literal("failed")
//         )),

//         exportUrl: v.optional(v.string()),



//     }).index("by_userId", ["userId"]),

//     files: defineTable({
//         name: v.string(),
//         projectId: v.id("projects"),
//         // path: v.string(),
//         content: v.optional(v.string()),
//         storageId: v.optional(v.id("_storage")), // Binary data
//         type: v.union(v.literal("file"), v.literal("folder")),
//         parentId: v.optional(v.id("files")),
//         createdAt: v.number(),
//         updatedAt: v.number(),
//     }).index("by_projectId", ["projectId"])
//         .index("by_parentId", ["parentId"])
//         .index("by_project_parent", ["projectId", "parentId"]),



//     chatThreads: defineTable({
//         userId: v.string(),
//         workspaceId: v.string(),
//         threadId: v.string(),
//         data: v.string(), // serialized ChatThread JSON
//         title: v.string(),
//         messageJson: v.string(),
//         createdAt: v.number(),
//         updatedAt: v.number(),
//     })
//         .index("by_user", ["userId"])
//         .index("by_workspace", ["workspaceId"])
//         .index("by_user_workspace", ["userId", "workspaceId"]),


//     workspaces: defineTable({

//         workspaceId: v.string(),
//         userId: v.string(),
//         name: v.string(),
//         language: v.string(),
//         gitRemoteUrl: v.string(),
//         gitBranch: v.string(),
//         diskPath: v.string(),
//         containerStatus: v.string(),
//         activeFilePath: v.string(),
//         openTabs: v.array(v.string()),
//         lastActiveAt: v.number(),




//     }).index("by_userId", ["userId"])
//         .index("by_workspaceId", ["workspaceId"])
//         .index("by_user_workspace", ["userId", "workspaceId"])
//         .index("by_user_active", ["userId", "lastActiveAt"]),



//     collaborators: defineTable({
//         id: v.string(),
//         workspaceId: v.id("workspaces"),
//         userId: v.id("users"),
//         role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
//         cursorPosition: v.string(),
//         lastSeenAt: v.number(),
//     }).index("by_workspace", ["workspaceId"])
//         .index("by_user", ["userId"])
//         .index("by_workspace_user", ["workspaceId", "userId"]),

// });







// convex/schema.ts — complete rewrite fixing all 13 issues

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

    // ── Users ─────────────────────────────────────────────────────────────────
    // Synced from your auth provider (Clerk/Auth.js) via auth.ts
    // Required so collaborators can use v.id("users") FK
    users: defineTable({
        // From auth provider
        email: v.string(),
        name: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        // Auth provider subject (e.g. Clerk userId)
        // Used to look up user from JWT claims
        tokenIdentifier: v.string(),
        createdAt: v.number(),
        lastSeenAt: v.number(),
    })
        .index("by_token", ["tokenIdentifier"])
        .index("by_email", ["email"]),

    // ── Projects ──────────────────────────────────────────────────────────────
    // A project is a named collection owned by a user.
    // One project maps to one workspace (one git repo on disk).
    // Kept separate from workspaces so project metadata (name, description)
    // survives even when workspace/container is deleted.
    projects: defineTable({
        userId: v.string(),               // auth tokenIdentifier
        name: v.string(),
        description: v.optional(v.string()),

        // Primary language for display (badge in UI)
        // e.g. "typescript", "python", "rust"
        // Stored as display label not enum — languages evolve
        primaryLanguage: v.optional(v.string()),

        // Import/export status for large repo operations
        importStatus: v.optional(v.union(
            v.literal("pending"),
            v.literal("cloning"),
            v.literal("completed"),
            v.literal("failed"),
        )),
        importError: v.optional(v.string()),

        // Link to workspace — null until first open
        // (project can exist before workspace is provisioned)
        workspaceId: v.optional(v.id("workspaces")),

        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_userId", ["userId"])
        .index("by_userId_updated", ["userId", "updatedAt"]),

    // ── Workspaces ────────────────────────────────────────────────────────────
    // A workspace is the runtime environment for a project.
    // Ties together: the project, the disk path, the container, git state.
    //
    // What lives HERE (small, structured metadata):
    //   - which container is running
    //   - git remote / branch
    //   - which file is open, which tabs
    //   - last active time for idle container shutdown
    //
    // What does NOT live here:
    //   - file contents  → on disk / git
    //   - node_modules   → on disk (ephemeral)
    //   - build artifacts → on disk (ephemeral)
    workspaces: defineTable({
        // Owner
        userId: v.string(),

        // Back-reference to project
        projectId: v.id("projects"),

        // Human name (copied from project, denormalized for fast queries)
        name: v.string(),

        // Git configuration
        gitRemoteUrl: v.optional(v.string()),      // null = local-only, no remote yet
        gitBranch: v.string(),                     // default "main"
        lastCommitSha: v.optional(v.string()),     // for display in UI
        lastCommitMessage: v.optional(v.string()),

        // Disk path on the laptop server
        // e.g. /home/yourname/web-ide-workspaces/workspace-abc
        diskPath: v.string(),

        // Docker container lifecycle
        containerStatus: v.union(
            v.literal("not_created"),   // first open, container doesn't exist yet
            v.literal("starting"),      // docker start in progress
            v.literal("running"),       // container is up and accepting exec
            v.literal("stopping"),      // docker stop in progress
            v.literal("stopped"),       // container exists but not running
            v.literal("error"),         // container failed to start
        ),
        containerId: v.optional(v.string()),  // Docker container ID (short hash)

        // Editor state — restored when workspace is re-opened
        activeFilePath: v.optional(v.string()),   // optional: no file open on fresh workspace
        openTabs: v.array(v.string()),            // ordered list of open file paths

        // For optional snapshot backup (S3/R2 tar.gz key)
        // null = no snapshot taken yet
        snapshotStorageKey: v.optional(v.string()),
        lastSnapshotAt: v.optional(v.number()),

        // Timestamps
        createdAt: v.number(),
        lastActiveAt: v.number(),
    })
        .index("by_userId", ["userId"])
        .index("by_projectId", ["projectId"])
        .index("by_userId_active", ["userId", "lastActiveAt"])
        .index("by_containerStatus", ["containerStatus"]),

    // ── Chat threads ──────────────────────────────────────────────────────────
    // Each thread belongs to one workspace.
    // data = full serialized ChatThread JSON (includes all messages).
    // We do NOT store messageJson separately — that was duplicate.
    chatThreads: defineTable({
        userId: v.string(),
        workspaceId: v.id("workspaces"),
        threadId: v.string(),           // client-generated UUID

        // Auto-generated from first user message
        title: v.string(),

        // Full serialized ChatThread JSON
        // Includes messages, state, stagingSelections etc.
        // See ChatThread type in types.ts
        data: v.string(),

        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_workspace", ["workspaceId"])
        .index("by_thread", ["userId", "threadId"])
        .index("by_workspace_updated", ["workspaceId", "updatedAt"]),

    // ── Files ─────────────────────────────────────────────────────────────────
    // IMPORTANT: In the disk-based architecture, file CONTENT lives on disk.
    // This table stores ONLY the file tree structure (metadata).
    // It is used to render the sidebar file tree fast without reading disk.
    // Content is fetched via /api/files when a file is opened for editing.
    //
    // On every file create/rename/delete, update this table too.
    // On workspace open, sync this table from actual disk (git ls-files).
    files: defineTable({
        projectId: v.id("projects"),
        workspaceId: v.id("workspaces"),

        // File path relative to workspace root
        // e.g. "src/components/Button.tsx"
        relativePath: v.string(),

        // Display name (last segment of path)
        name: v.string(),

        type: v.union(v.literal("file"), v.literal("folder")),

        // Parent folder's relativePath, null for root items
        parentPath: v.optional(v.string()),

        // File metadata (no content)
        sizeBytes: v.optional(v.number()),
        mimeType: v.optional(v.string()),

        // Git status for decorations in file tree
        gitStatus: v.optional(v.union(
            v.literal("modified"),
            v.literal("added"),
            v.literal("deleted"),
            v.literal("untracked"),
            v.literal("clean"),
        )),

        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_workspace", ["workspaceId"])
        .index("by_project", ["projectId"])
        .index("by_workspace_path", ["workspaceId", "relativePath"])
        .index("by_workspace_parent", ["workspaceId", "parentPath"]),

    // ── Collaborators ─────────────────────────────────────────────────────────
    // Who has access to which workspace.
    // For future real-time cursor sharing.
    collaborators: defineTable({
        workspaceId: v.id("workspaces"),
        userId: v.string(),              // tokenIdentifier (not v.id("users") — avoids join complexity)
        role: v.union(
            v.literal("owner"),
            v.literal("editor"),
            v.literal("viewer"),
        ),
        // JSON-serialized cursor: { filePath, line, column }
        cursorPosition: v.optional(v.string()),
        lastSeenAt: v.number(),
    })
        .index("by_workspace", ["workspaceId"])
        .index("by_user", ["userId"])
        .index("by_workspace_user", ["workspaceId", "userId"]),
}); 