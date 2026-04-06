// // src/app/api/files/watch/route.ts — complete rewrite

// import { NextRequest, NextResponse } from "next/server";
// import { ConvexHttpClient } from "convex/browser";
// import { api } from "@/convex/_generated/api";
// // import type { WatchEvent } from "@/src/server/workspace/workspace-watcher";

// // Use CONVEX_URL — the admin client doesn't need user auth
// // Internal mutations skip verfiyAuth so they work with this client
// const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// export async function POST(req: NextRequest) {
//     const secret = req.headers.get("x-internal-secret");
//     const expected = process.env.INTERNAL_SECRET;

//     if (!expected || secret !== expected) {
//         return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//     }

//     try {
//         const { events, convexWorkspaceId, projectId } = await req.json() as {
//             events: WatchEvent[];
//             convexWorkspaceId: string;
//             projectId: string;
//         };

//         if (!events?.length || !convexWorkspaceId || !projectId) {
//             return NextResponse.json(
//                 { error: "events, convexWorkspaceId, projectId required" },
//                 { status: 400 }
//             );
//         }

//         // Validate IDs look like real Convex IDs (not placeholder strings)
//         if (
//             projectId === "your_project_id_here" ||
//             projectId.length < 10 ||
//             convexWorkspaceId.length < 10
//         ) {
//             return NextResponse.json(
//                 { error: "Invalid projectId or convexWorkspaceId" },
//                 { status: 400 }
//             );
//         }

//         let applied = 0;
//         let skipped = 0;

//         for (const event of events) {
//             try {
//                 if (event.eventType === "add" || event.eventType === "addDir") {
//                     await convex.mutation(api.files.internalCreateFile, {
//                         workspaceId: convexWorkspaceId as any,
//                         projectId: projectId as any,
//                         relativePath: event.relativePath,
//                         name: event.name,
//                         type: event.isDirectory ? "folder" : "file",
//                         // null → undefined so Convex v.optional(v.string()) accepts it
//                         parentPath: event.parentPath ?? undefined,
//                     });
//                     applied++;
//                 }

//                 if (event.eventType === "unlink" || event.eventType === "unlinkDir") {
//                     await convex.mutation(api.files.internalDeleteFile, {
//                         workspaceId: convexWorkspaceId as any,
//                         relativePath: event.relativePath,
//                     });
//                     applied++;
//                 }

//             } catch (err: any) {
//                 // "Already exists" on insert = fine (UI already created it)
//                 if (err.message?.includes("Already exists")) {
//                     skipped++;
//                 } else {
//                     console.error(
//                         `[API/files/watch] Failed on ${event.eventType}:${event.relativePath}:`,
//                         err.message
//                     );
//                 }
//             }
//         }

//         return NextResponse.json({ applied, skipped });

//     } catch (err: any) {
//         console.error("[API/files/watch] Error:", err.message);
//         return NextResponse.json({ error: err.message }, { status: 500 });
//     }
// }