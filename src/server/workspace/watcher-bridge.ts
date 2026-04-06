// // src/server/workspace/watcher-bridge.ts
// // Bridges workspace-watcher.ts (server process) to the Convex files table
// // via the internal /api/files/watch route.
// // Holds the workspaceId → convexWorkspaceId + projectId mapping
// // so the watcher knows which Convex records to update.

// import { registerFlushCallback, WatchEvent } from "./workspace-watcher";

// // Map of disk workspaceId → Convex IDs needed for mutations
// type WorkspaceMeta = {
//     convexWorkspaceId: string;
//     projectId: string;
// };

// const workspaceMeta = new Map<string, WorkspaceMeta>();

// const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "dev-secret-change-me";
// const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// // Register this bridge as the flush handler once on server startup
// export function initWatcherBridge(): void {
//     // src/server/workspace/watcher-bridge.ts
//     // Add logging to flush callback

//     registerFlushCallback(async (events: WatchEvent[]) => {
//         console.log(`[WatcherBridge] Flush called with ${events.length} events:`,
//             events.map(e => `${e.eventType}:${e.relativePath}`)
//         );

//         if (events.length === 0) return;

//         const byWorkspace = new Map<string, WatchEvent[]>();
//         for (const event of events) {
//             const list = byWorkspace.get(event.workspaceId) ?? [];
//             list.push(event);
//             byWorkspace.set(event.workspaceId, list);
//         }

//         for (const [workspaceId, wsEvents] of byWorkspace.entries()) {
//             const meta = workspaceMeta.get(workspaceId);
//             if (!meta) {
//                 console.warn(`[WatcherBridge] No meta for workspace: ${workspaceId} — skipping`);
//                 console.warn(`[WatcherBridge] Registered workspaces:`, [...workspaceMeta.keys()]);
//                 continue;
//             }

//             console.log(`[WatcherBridge] Sending ${wsEvents.length} events to /api/files/watch`);

//             try {
//                 const res = await fetch(`${API_BASE}/api/files/watch`, {
//                     method: "POST",
//                     headers: {
//                         "Content-Type": "application/json",
//                         "x-internal-secret": INTERNAL_SECRET,
//                     },
//                     body: JSON.stringify({
//                         events: wsEvents,
//                         convexWorkspaceId: meta.convexWorkspaceId,
//                         projectId: meta.projectId,
//                     }),
//                 });

//                 const body = await res.text();
//                 console.log(`[WatcherBridge] Response: ${res.status} ${body}`);

//                 if (!res.ok) {
//                     console.error(`[WatcherBridge] Flush failed:`, body);
//                 }
//             } catch (err: any) {
//                 console.error(`[WatcherBridge] Network error:`, err.message);
//             }
//         }
//     });
// }

// // Called from /api/workspace route after successful provision
// export function registerWorkspaceMeta(
//     workspaceId: string,   // disk key (= Convex workspace._id)
//     convexWorkspaceId: string,   // same value in this architecture
//     projectId: string,
// ): void {
//     workspaceMeta.set(workspaceId, { convexWorkspaceId, projectId });
//     console.log(`[WatcherBridge] Registered: ${workspaceId}`);
// }

// export function unregisterWorkspaceMeta(workspaceId: string): void {
//     workspaceMeta.delete(workspaceId);
// }