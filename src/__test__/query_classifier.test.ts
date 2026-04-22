// src/__tests__/query-classifier.test.ts

import { classifyQuery } from "../app/features/ide/extensions/chat/agent/query-classifier";

describe("classifyQuery", () => {
    test("detects question intent", () => {
        const r = classifyQuery("What does this function do?");
        expect(r.intent).toBe("question");
        expect(r.needsFileTree).toBe(false);
        expect(r.needsPackageJson).toBe(false);
    });

    test("detects new_feature intent", () => {
        const r = classifyQuery("Add a dark mode toggle to the settings page");
        expect(r.intent).toBe("new_feature");
        expect(r.needsFileTree).toBe(true);
        expect(r.needsPackageJson).toBe(true);
    });

    test("detects bug_fix intent", () => {
        const r = classifyQuery("Fix the TypeError in the auth middleware");
        expect(r.intent).toBe("bug_fix");
        expect(r.needsGitDiff).toBe(true);
        expect(r.needsActiveFile).toBe(true);
    });

    test("detects run_command intent", () => {
        const r = classifyQuery("Run the tests");
        expect(r.intent).toBe("run_command");
        expect(r.needsPackageJson).toBe(true);
        expect(r.needsFileTree).toBe(false);
    });

    test("detects refactor intent", () => {
        const r = classifyQuery("Refactor the user service into smaller modules");
        expect(r.intent).toBe("refactor");
        expect(r.maxFileTreeDepth).toBe(2);
    });

    test("simple question has minimal context needs", () => {
        const r = classifyQuery("How does React work?");
        expect(r.needsFileTree).toBe(false);
        expect(r.needsPackageJson).toBe(false);
        expect(r.needsGitDiff).toBe(false);
    });

    test("movie app request = new_feature", () => {
        const r = classifyQuery(
            "Create a movie app. Find the movies according to your preferences by searching for its name."
        );
        expect(r.intent).toBe("new_feature");
        expect(r.needsPackageJson).toBe(true);
    });


    test("confusing query != question", () => {
        const r = classifyQuery("Can you add a login page?");
        expect(r.intent).toBe("new_feature");
        expect(r.needsFileTree).toBe(true);
        expect(r.needsPackageJson).toBe(true);
        expect(r.needsGitDiff).toBe(false);
    })



    test("Refactor can be misleading", () => {
        const r = classifyQuery("Abstract the auth logic out of the header component so we can use it elsewhere");
        expect(r.intent).toBe("refactor");
        expect(r.needsFileTree).toBe(true);
        expect(r.needsPackageJson).toBe(false);
        expect(r.needsGitDiff).toBe(false);
    })

    //     test("Blended query with code", () => {
    //         const r = classifyQuery(`// src/app/features/ide/extensions/chat/components/DiffViewer.tsx
    // // Inline diff viewer rendered inside a ToolCard when write_file is called.
    // // Shows before/after with per-hunk accept/reject buttons.
    // // Cursor-style: red for removed, green for added, line numbers on both sides.

    // 'use client';

    // import React, { useState, useCallback } from "react";
    // import { cn } from "@/lib/utils";
    // import type { FileDiff, DiffHunk, DiffLine } from "./agent/diff-engine";
    // import {
    //     CheckIcon, XIcon, ChevronDownIcon,
    //     ChevronRightIcon, FileCodeIcon,
    //     PlusIcon, MinusIcon,
    // } from "lucide-react";

    // // ── Line number gutter ────────────────────────────────────────────────────────

    // const LineGutter: React.FC<{
    //     oldNum?: number;
    //     newNum?: number;
    // }> = ({ oldNum, newNum }) => (
    //     <div className="flex shrink-0 select-none" style={{ width: "72px" }}>
    //         <span
    //             className="text-right pr-2 text-[10px] font-mono"
    //             style={{ width: "36px", color: "#6e7681" }}
    //         >
    //             {oldNum ?? ""}
    //         </span>
    //         <span
    //             className="text-right pr-2 text-[10px] font-mono"
    //             style={{ width: "36px", color: "#6e7681" }}
    //         >
    //             {newNum ?? ""}
    //         </span>
    //     </div>
    // );

    // // ── Single diff line ──────────────────────────────────────────────────────────

    // const DiffLineRow: React.FC<{ line: DiffLine }> = ({ line }) => {
    //     const isAdded = line.type === "added";
    //     const isRemoved = line.type === "removed";

    //     return (
    //         <div
    //             className="flex items-start group"
    //             style={{
    //                 backgroundColor: isAdded
    //                     ? "rgba(63,185,80,0.08)"
    //                     : isRemoved
    //                         ? "rgba(255,123,114,0.08)"
    //                         : "transparent",
    //                 borderLeft: isAdded
    //                     ? "2px solid #238636"
    //                     : isRemoved
    //                         ? "2px solid #da3633"
    //                         : "2px solid transparent",
    //             }}
    //         >
    //             <LineGutter
    //                 oldNum={line.oldLineNum}
    //                 newNum={line.newLineNum}
    //             />
    // // src/app/features/ide/extensions/chat/components/DiffViewer.tsx
    // // Inline diff viewer rendered inside a ToolCard when write_file is called.
    // // Shows before/after with per-hunk accept/reject buttons.
    // // Cursor-style: red for removed, green for added, line numbers on both sides.

    // 'use client';

    // import React, { useState, useCallback } from "react";
    // import { cn } from "@/lib/utils";
    // import type { FileDiff, DiffHunk, DiffLine } from "./agent/diff-engine";
    // import {
    //     CheckIcon, XIcon, ChevronDownIcon,
    //     ChevronRightIcon, FileCodeIcon,
    //     PlusIcon, MinusIcon,
    // } from "lucide-react";

    // // ── Line number gutter ────────────────────────────────────────────────────────

    // const LineGutter: React.FC<{
    //     oldNum?: number;
    //     newNum?: number;
    // }> = ({ oldNum, newNum }) => (
    //     <div className="flex shrink-0 select-none" style={{ width: "72px" }}>
    //         <span
    //             className="text-right pr-2 text-[10px] font-mono"
    //             style={{ width: "36px", color: "#6e7681" }}
    //         >
    //             {oldNum ?? ""}
    //         </span>
    //         <span
    //             className="text-right pr-2 text-[10px] font-mono"
    //             style={{ width: "36px", color: "#6e7681" }}
    //         >
    //             {newNum ?? ""}
    //         </span>
    //     </div>
    // );

    // // ── Single diff line ──────────────────────────────────────────────────────────

    // const DiffLineRow: React.FC<{ line: DiffLine }> = ({ line }) => {
    //     const isAdded = line.type === "added";
    //     const isRemoved = line.type === "removed";

    //     return (
    //         <div
    //             className="flex items-start group"
    //             style={{
    //                 backgroundColor: isAdded
    //                     ? "rgba(63,185,80,0.08)"
    //                     : isRemoved
    //                         ? "rgba(255,123,114,0.08)"
    //                         : "transparent",
    //                 borderLeft: isAdded
    //                     ? "2px solid #238636"
    //                     : isRemoved
    //                         ? "2px solid #da3633"
    //                         : "2px solid transparent",
    //             }}
    //         >
    //             <LineGutter
    //                 oldNum={line.oldLineNum}
    //                 newNum={line.newLineNum}
    //             />

    //             {/* Sign */}
    //             <span
    //                 className="w-4 shrink-0 text-center text-xs font-mono select-none"
    //                 style={{
    //                     color: isAdded
    //                         ? "#3fb950"
    //                         : isRemoved
    //                             ? "#ff7b72"
    //                             : "transparent",
    //                 }}
    //             >
    //                 {isAdded ? "+" : isRemoved ? "−" : " "}
    //             </span>

    //             {/* Content */}
    //             <span
    //                 className="flex-1 min-w-0 text-xs font-mono px-1 whitespace-pre-wrap break-all"
    //                 style={{
    //                     color: isAdded
    //                         ? "#aff5b4"
    //                         : isRemoved
    //                             ? "#ffc2c2"
    //                             : "#e6edf3",
    //                 }}
    //             >
    //                 {line.content || " "}
    //             </span>
    //         </div>
    //     );
    // };

    // // ── Hunk ──────────────────────────────────────────────────────────────────────

    // const HunkView: React.FC<{
    //     hunk: DiffHunk;
    //     onAccept: (hunkId: string) => void;
    //     onReject: (hunkId: string) => void;
    //     showButtons: boolean;
    // }> = ({ hunk, onAccept, onReject, showButtons }) => {

    //     const isAccepted = hunk.accepted === true;
    //     const isRejected = hunk.accepted === false;
    //     const isDecided = hunk.accepted !== null;

    //     return (
    //         <div
    //             className="rounded overflow-hidden mb-2"
    //             style={{
    //                 border: isAccepted
    //                     ? "1px solid #238636"
    //                     : isRejected
    //                         ? "1px solid #da3633"
    //                         : "1px solid #30363d",
    //             }}
    //         >
    //             {/* Hunk header */}
    //             <div
    //                 className="flex items-center justify-between px-2 py-1"
    //                 style={{
    //                     backgroundColor: isAccepted
    //                         ? "rgba(35,134,54,0.12)"
    //                         : isRejected
    //                             ? "rgba(218,54,51,0.12)"
    //                             : "#161b22",
    //                     borderBottom: "1px solid #21262d",
    //                 }}
    //             >
    //                 <span className="text-[10px] font-mono" style={{ color: "#6e7681" }}>
    //                     @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
    //                 </span>

    //                 {showButtons && !isDecided && (
    //                     <div className="flex items-center gap-1">
    //                         <button
    //                             onClick={() => onAccept(hunk.id)}
    //                             className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
    //                             style={{
    //                                 backgroundColor: "rgba(35,134,54,0.2)",
    //                                 color: "#3fb950",
    //                                 border: "1px solid rgba(35,134,54,0.4)",
    //                             }}
    //                             onMouseEnter={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.35)";
    //                             }}
    //                             onMouseLeave={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.2)";
    //                             }}
    //                         >
    //                             <CheckIcon size={10} />
    //                             Accept
    //                         </button>
    //                         <button
    //                             onClick={() => onReject(hunk.id)}
    //                             className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
    //                             style={{
    //                                 backgroundColor: "rgba(218,54,51,0.2)",
    //                                 color: "#ff7b72",
    //                                 border: "1px solid rgba(218,54,51,0.4)",
    //                             }}
    //                             onMouseEnter={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.35)";
    //                             }}
    //                             onMouseLeave={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.2)";
    //                             }}
    //                         >
    //                             <XIcon size={10} />
    //                             Reject
    //                         </button>
    //                     </div>
    //                 )}

    //                 {isDecided && (
    //                     <span
    //                         className="text-[11px] font-medium px-2 py-0.5 rounded"
    //                         style={{
    //                             color: isAccepted ? "#3fb950" : "#ff7b72",
    //                             backgroundColor: isAccepted
    //                                 ? "rgba(35,134,54,0.15)"
    //                                 : "rgba(218,54,51,0.15)",
    //                         }}
    //                     >
    //                         {isAccepted ? "✓ Accepted" : "✕ Rejected"}
    //                     </span>
    //                 )}
    //             </div>

    //             {/* Lines */}
    //             <div style={{ backgroundColor: "#0d1117" }}>
    //                 {hunk.lines.map((line, i) => (
    //                     <DiffLineRow key={i} line={line} />
    //                 ))}
    //             </div>
    //         </div>
    //     );
    // };

    // // ── Command bar ───────────────────────────────────────────────────────────────

    // const CommandBar: React.FC<{
    //     diff: FileDiff;
    //     onAcceptAll: () => void;
    //     onRejectAll: () => void;
    //     onApply: () => void;
    //     isApplied: boolean;
    // }> = ({ diff, onAcceptAll, onRejectAll, onApply, isApplied }) => {
    //     const decided = diff.hunks.filter(h => h.accepted !== null).length;
    //     const total = diff.hunks.length;
    //     const allDone = decided === total;
    //     const { added, removed } = diff.stats;

    //     return (
    //         <div
    //             className="flex items-center gap-2 px-3 py-2 rounded"
    //             style={{
    //                 backgroundColor: "#161b22",
    //                 border: "1px solid #30363d",
    //                 marginBottom: "8px",
    //             }}
    //         >
    //             {/* Stats */}
    //             <div className="flex items-center gap-2 text-xs">
    //                 {added > 0 && (
    //                     <span className="flex items-center gap-0.5 font-mono"
    //                         style={{ color: "#3fb950" }}>
    //                         <PlusIcon size={10} />
    //                         {added}
    //                     </span>
    //                 )}
    //                 {removed > 0 && (
    //                     <span className="flex items-center gap-0.5 font-mono"
    //                         style={{ color: "#ff7b72" }}>
    //                         <MinusIcon size={10} />
    //                         {removed}
    //                     </span>
    //                 )}
    //                 <span style={{ color: "#6e7681" }}>
    //                     {decided}/{total} hunks reviewed
    //                 </span>
    //             </div>

    //             <div className="flex-1" />

    //             {/* Actions */}
    //             {!isApplied && (
    //                 <>
    //                     <button
    //                         onClick={onRejectAll}
    //                         className="px-2 py-1 rounded text-xs transition-colors"
    //                         style={{
    //                             color: "#ff7b72",
    //                             backgroundColor: "transparent",
    //                             border: "1px solid #30363d",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.borderColor = "#da3633"}
    //                         onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
    //                     >
    //                         Reject all
    //                     </button>
    //                     <button
    //                         onClick={onAcceptAll}
    //                         className="px-2 py-1 rounded text-xs transition-colors"
    //                         style={{
    //                             color: "#3fb950",
    //                             backgroundColor: "transparent",
    //                             border: "1px solid #30363d",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.borderColor = "#238636"}
    //                         onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
    //                     >
    //                         Accept all
    //                     </button>
    //                     <button
    //                         onClick={onApply}
    //                         className="px-3 py-1 rounded text-xs font-medium transition-colors"
    //                         style={{
    //                             color: "#e6edf3",
    //                             backgroundColor: "#1f6feb",
    //                             border: "1px solid #388bfd",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.backgroundColor = "#388bfd"}
    //                         onMouseLeave={e => e.currentTarget.style.backgroundColor = "#1f6feb"}
    //                     >
    //                         Apply
    //                     </button>
    //                 </>
    //             )}

    //             {isApplied && (
    //                 <span className="text-xs font-medium" style={{ color: "#3fb950" }}>
    //                     ✓ Applied to disk
    //                 </span>
    //             )}
    //         </div>
    //     );
    // };

    // // ── Main DiffViewer ───────────────────────────────────────────────────────────

    // interface DiffViewerProps {
    //     diff: FileDiff;
    //     onApply: (updatedDiff: FileDiff) => Promise<void>;
    //     showButtons?: boolean;
    // }

    // export const DiffViewer: React.FC<DiffViewerProps> = ({
    //     diff: initialDiff,
    //     onApply,
    //     showButtons = true,
    // }) => {
    //     const [diff, setDiff] = useState<FileDiff>(initialDiff);
    //     const [isApplied, setIsApplied] = useState(false);
    //     const [collapsed, setCollapsed] = useState(false);
    //     const [applying, setApplying] = useState(false);

    //     const handleAccept = useCallback((hunkId: string) => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h =>
    //                 h.id === hunkId ? { ...h, accepted: true } : h
    //             ),
    //         }));
    //     }, []);

    //     const handleReject = useCallback((hunkId: string) => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h =>
    //                 h.id === hunkId ? { ...h, accepted: false } : h
    //             ),
    //         }));
    //     }, []);

    //     const handleAcceptAll = useCallback(() => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h => ({ ...h, accepted: true })),
    //         }));
    //     }, []);

    //     const handleRejectAll = useCallback(() => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h => ({ ...h, accepted: false })),
    //         }));
    //     }, []);

    //     const handleApply = useCallback(async () => {
    //         setApplying(true);
    //         try {
    //             // Accept undecided hunks before applying
    //             const finalDiff: FileDiff = {
    //                 ...diff,
    //                 hunks: diff.hunks.map(h =>
    //                     h.accepted === null ? { ...h, accepted: true } : h
    //                 ),
    //             };
    //             await onApply(finalDiff);
    //             setDiff(finalDiff);
    //             setIsApplied(true);
    //         } finally {
    //             setApplying(false);
    //         }
    //     }, [diff, onApply]);

    //     // No changes
    //     if (diff.hunks.length === 0) {
    //         return (
    //             <div
    //                 className="flex items-center gap-2 px-3 py-2 rounded text-xs"
    //                 style={{
    //                     backgroundColor: "#161b22",
    //                     border: "1px solid #30363d",
    //                     color: "#6e7681",
    //                 }}
    //             >
    //                 <FileCodeIcon size={12} />
    //                 No changes in {diff.filePath}
    //             </div>
    //         );
    //     }

    //     return (
    //         <div className="w-full">
    //             {/* File header */}
    //             <div
    //                 className="flex items-center gap-2 px-2 py-1.5 rounded-t cursor-pointer"
    //                 style={{
    //                     backgroundColor: "#161b22",
    //                     border: "1px solid #30363d",
    //                     borderBottom: collapsed ? "1px solid #30363d" : "none",
    //                     borderRadius: collapsed ? "6px" : "6px 6px 0 0",
    //                 }}
    //                 onClick={() => setCollapsed(v => !v)}
    //             >
    //                 {collapsed
    //                     ? <ChevronRightIcon size={12} style={{ color: "#6e7681" }} />
    //                     : <ChevronDownIcon size={12} style={{ color: "#6e7681" }} />
    //                 }
    //                 <FileCodeIcon size={12} style={{ color: "#8b949e" }} />
    //                 <span className="text-xs font-mono flex-1" style={{ color: "#e6edf3" }}>
    //                     {diff.filePath}
    //                 </span>
    //                 <span className="text-[11px]" style={{ color: "#6e7681" }}>
    //                     {diff.stats.added > 0 && (
    //                         <span style={{ color: "#3fb950" }}>+{diff.stats.added} </span>
    //                     )}
    //                     {diff.stats.removed > 0 && (
    //                         <span style={{ color: "#ff7b72" }}>−{diff.stats.removed}</span>
    //                     )}
    //                 </span>
    //             </div>

    //             {!collapsed && (
    //                 <div
    //                     className="rounded-b overflow-hidden"
    //                     style={{ border: "1px solid #30363d", borderTop: "none" }}
    //                 >
    //                     {/* Command bar */}
    //                     {showButtons && (
    //                         <div className="p-2" style={{ backgroundColor: "#0d1117" }}>
    //                             <CommandBar
    //                                 diff={diff}
    //                                 onAcceptAll={handleAcceptAll}
    //                                 onRejectAll={handleRejectAll}
    //                                 onApply={handleApply}
    //                                 isApplied={isApplied}
    //                             />
    //                         </div>
    //                     )}

    //                     {/* Hunks */}
    //                     <div
    //                         className="p-2 overflow-x-auto"
    //                         style={{ backgroundColor: "#0d1117" }}
    //                     >
    //                         {diff.hunks.map(hunk => (
    //                             <HunkView
    //                                 key={hunk.id}
    //                                 hunk={hunk}
    //                                 onAccept={handleAccept}
    //                                 onReject={handleReject}
    //                                 showButtons={showButtons && !isApplied}
    //                             />
    //                         ))}
    //                     </div>
    //                 </div>
    //             )}
    //         </div>
    //     );
    // };
    //             {/* Sign */}
    //             <span
    //                 className="w-4 shrink-0 text-center text-xs font-mono select-none"
    //                 style={{
    //                     color: isAdded
    //                         ? "#3fb950"
    //                         : isRemoved
    //                             ? "#ff7b72"
    //                             : "transparent",
    //                 }}
    //             >
    //                 {isAdded ? "+" : isRemoved ? "−" : " "}
    //             </span>

    //             {/* Content */}
    //             <span
    //                 className="flex-1 min-w-0 text-xs font-mono px-1 whitespace-pre-wrap break-all"
    //                 style={{
    //                     color: isAdded
    //                         ? "#aff5b4"
    //                         : isRemoved
    //                             ? "#ffc2c2"
    //                             : "#e6edf3",
    //                 }}
    //             >
    //                 {line.content || " "}
    //             </span>
    //         </div>
    //     );
    // };

    // // ── Hunk ──────────────────────────────────────────────────────────────────────

    // const HunkView: React.FC<{
    //     hunk: DiffHunk;
    //     onAccept: (hunkId: string) => void;
    //     onReject: (hunkId: string) => void;
    //     showButtons: boolean;
    // }> = ({ hunk, onAccept, onReject, showButtons }) => {

    //     const isAccepted = hunk.accepted === true;
    //     const isRejected = hunk.accepted === false;
    //     const isDecided = hunk.accepted !== null;

    //     return (
    //         <div
    //             className="rounded overflow-hidden mb-2"
    //             style={{
    //                 border: isAccepted
    //                     ? "1px solid #238636"
    //                     : isRejected
    //                         ? "1px solid #da3633"
    //                         : "1px solid #30363d",
    //             }}
    //         >
    //             {/* Hunk header */}
    //             <div
    //                 className="flex items-center justify-between px-2 py-1"
    //                 style={{
    //                     backgroundColor: isAccepted
    //                         ? "rgba(35,134,54,0.12)"
    //                         : isRejected
    //                             ? "rgba(218,54,51,0.12)"
    //                             : "#161b22",
    //                     borderBottom: "1px solid #21262d",
    //                 }}
    //             >
    //                 <span className="text-[10px] font-mono" style={{ color: "#6e7681" }}>
    //                     @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
    //                 </span>

    //                 {showButtons && !isDecided && (
    //                     <div className="flex items-center gap-1">
    //                         <button
    //                             onClick={() => onAccept(hunk.id)}
    //                             className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
    //                             style={{
    //                                 backgroundColor: "rgba(35,134,54,0.2)",
    //                                 color: "#3fb950",
    //                                 border: "1px solid rgba(35,134,54,0.4)",
    //                             }}
    //                             onMouseEnter={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.35)";
    //                             }}
    //                             onMouseLeave={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(35,134,54,0.2)";
    //                             }}
    //                         >
    //                             <CheckIcon size={10} />
    //                             Accept
    //                         </button>
    //                         <button
    //                             onClick={() => onReject(hunk.id)}
    //                             className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
    //                             style={{
    //                                 backgroundColor: "rgba(218,54,51,0.2)",
    //                                 color: "#ff7b72",
    //                                 border: "1px solid rgba(218,54,51,0.4)",
    //                             }}
    //                             onMouseEnter={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.35)";
    //                             }}
    //                             onMouseLeave={e => {
    //                                 e.currentTarget.style.backgroundColor = "rgba(218,54,51,0.2)";
    //                             }}
    //                         >
    //                             <XIcon size={10} />
    //                             Reject
    //                         </button>
    //                     </div>
    //                 )}

    //                 {isDecided && (
    //                     <span
    //                         className="text-[11px] font-medium px-2 py-0.5 rounded"
    //                         style={{
    //                             color: isAccepted ? "#3fb950" : "#ff7b72",
    //                             backgroundColor: isAccepted
    //                                 ? "rgba(35,134,54,0.15)"
    //                                 : "rgba(218,54,51,0.15)",
    //                         }}
    //                     >
    //                         {isAccepted ? "✓ Accepted" : "✕ Rejected"}
    //                     </span>
    //                 )}
    //             </div>

    //             {/* Lines */}
    //             <div style={{ backgroundColor: "#0d1117" }}>
    //                 {hunk.lines.map((line, i) => (
    //                     <DiffLineRow key={i} line={line} />
    //                 ))}
    //             </div>
    //         </div>
    //     );
    // };

    // // ── Command bar ───────────────────────────────────────────────────────────────

    // const CommandBar: React.FC<{
    //     diff: FileDiff;
    //     onAcceptAll: () => void;
    //     onRejectAll: () => void;
    //     onApply: () => void;
    //     isApplied: boolean;
    // }> = ({ diff, onAcceptAll, onRejectAll, onApply, isApplied }) => {
    //     const decided = diff.hunks.filter(h => h.accepted !== null).length;
    //     const total = diff.hunks.length;
    //     const allDone = decided === total;
    //     const { added, removed } = diff.stats;

    //     return (
    //         <div
    //             className="flex items-center gap-2 px-3 py-2 rounded"
    //             style={{
    //                 backgroundColor: "#161b22",
    //                 border: "1px solid #30363d",
    //                 marginBottom: "8px",
    //             }}
    //         >
    //             {/* Stats */}
    //             <div className="flex items-center gap-2 text-xs">
    //                 {added > 0 && (
    //                     <span className="flex items-center gap-0.5 font-mono"
    //                         style={{ color: "#3fb950" }}>
    //                         <PlusIcon size={10} />
    //                         {added}
    //                     </span>
    //                 )}
    //                 {removed > 0 && (
    //                     <span className="flex items-center gap-0.5 font-mono"
    //                         style={{ color: "#ff7b72" }}>
    //                         <MinusIcon size={10} />
    //                         {removed}
    //                     </span>
    //                 )}
    //                 <span style={{ color: "#6e7681" }}>
    //                     {decided}/{total} hunks reviewed
    //                 </span>
    //             </div>

    //             <div className="flex-1" />

    //             {/* Actions */}
    //             {!isApplied && (
    //                 <>
    //                     <button
    //                         onClick={onRejectAll}
    //                         className="px-2 py-1 rounded text-xs transition-colors"
    //                         style={{
    //                             color: "#ff7b72",
    //                             backgroundColor: "transparent",
    //                             border: "1px solid #30363d",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.borderColor = "#da3633"}
    //                         onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
    //                     >
    //                         Reject all
    //                     </button>
    //                     <button
    //                         onClick={onAcceptAll}
    //                         className="px-2 py-1 rounded text-xs transition-colors"
    //                         style={{
    //                             color: "#3fb950",
    //                             backgroundColor: "transparent",
    //                             border: "1px solid #30363d",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.borderColor = "#238636"}
    //                         onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
    //                     >
    //                         Accept all
    //                     </button>
    //                     <button
    //                         onClick={onApply}
    //                         className="px-3 py-1 rounded text-xs font-medium transition-colors"
    //                         style={{
    //                             color: "#e6edf3",
    //                             backgroundColor: "#1f6feb",
    //                             border: "1px solid #388bfd",
    //                         }}
    //                         onMouseEnter={e => e.currentTarget.style.backgroundColor = "#388bfd"}
    //                         onMouseLeave={e => e.currentTarget.style.backgroundColor = "#1f6feb"}
    //                     >
    //                         Apply
    //                     </button>
    //                 </>
    //             )}

    //             {isApplied && (
    //                 <span className="text-xs font-medium" style={{ color: "#3fb950" }}>
    //                     ✓ Applied to disk
    //                 </span>
    //             )}
    //         </div>
    //     );
    // };

    // // ── Main DiffViewer ───────────────────────────────────────────────────────────

    // interface DiffViewerProps {
    //     diff: FileDiff;
    //     onApply: (updatedDiff: FileDiff) => Promise<void>;
    //     showButtons?: boolean;
    // }

    // export const DiffViewer: React.FC<DiffViewerProps> = ({
    //     diff: initialDiff,
    //     onApply,
    //     showButtons = true,
    // }) => {
    //     const [diff, setDiff] = useState<FileDiff>(initialDiff);
    //     const [isApplied, setIsApplied] = useState(false);
    //     const [collapsed, setCollapsed] = useState(false);
    //     const [applying, setApplying] = useState(false);

    //     const handleAccept = useCallback((hunkId: string) => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h =>
    //                 h.id === hunkId ? { ...h, accepted: true } : h
    //             ),
    //         }));
    //     }, []);

    //     const handleReject = useCallback((hunkId: string) => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h =>
    //                 h.id === hunkId ? { ...h, accepted: false } : h
    //             ),
    //         }));
    //     }, []);

    //     const handleAcceptAll = useCallback(() => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h => ({ ...h, accepted: true })),
    //         }));
    //     }, []);

    //     const handleRejectAll = useCallback(() => {
    //         setDiff(prev => ({
    //             ...prev,
    //             hunks: prev.hunks.map(h => ({ ...h, accepted: false })),
    //         }));
    //     }, []);

    //     const handleApply = useCallback(async () => {
    //         setApplying(true);
    //         try {
    //             // Accept undecided hunks before applying
    //             const finalDiff: FileDiff = {
    //                 ...diff,
    //                 hunks: diff.hunks.map(h =>
    //                     h.accepted === null ? { ...h, accepted: true } : h
    //                 ),
    //             };
    //             await onApply(finalDiff);
    //             setDiff(finalDiff);
    //             setIsApplied(true);
    //         } finally {
    //             setApplying(false);
    //         }
    //     }, [diff, onApply]);

    //     // No changes
    //     if (diff.hunks.length === 0) {
    //         return (
    //             <div
    //                 className="flex items-center gap-2 px-3 py-2 rounded text-xs"
    //                 style={{
    //                     backgroundColor: "#161b22",
    //                     border: "1px solid #30363d",
    //                     color: "#6e7681",
    //                 }}
    //             >
    //                 <FileCodeIcon size={12} />
    //                 No changes in {diff.filePath}
    //             </div>
    //         );
    //     }

    //     return (
    //         <div className="w-full">
    //             {/* File header */}
    //             <div
    //                 className="flex items-center gap-2 px-2 py-1.5 rounded-t cursor-pointer"
    //                 style={{
    //                     backgroundColor: "#161b22",
    //                     border: "1px solid #30363d",
    //                     borderBottom: collapsed ? "1px solid #30363d" : "none",
    //                     borderRadius: collapsed ? "6px" : "6px 6px 0 0",
    //                 }}
    //                 onClick={() => setCollapsed(v => !v)}
    //             >
    //                 {collapsed
    //                     ? <ChevronRightIcon size={12} style={{ color: "#6e7681" }} />
    //                     : <ChevronDownIcon size={12} style={{ color: "#6e7681" }} />
    //                 }
    //                 <FileCodeIcon size={12} style={{ color: "#8b949e" }} />
    //                 <span className="text-xs font-mono flex-1" style={{ color: "#e6edf3" }}>
    //                     {diff.filePath}
    //                 </span>
    //                 <span className="text-[11px]" style={{ color: "#6e7681" }}>
    //                     {diff.stats.added > 0 && (
    //                         <span style={{ color: "#3fb950" }}>+{diff.stats.added} </span>
    //                     )}
    //                     {diff.stats.removed > 0 && (
    //                         <span style={{ color: "#ff7b72" }}>−{diff.stats.removed}</span>
    //                     )}
    //                 </span>
    //             </div>

    //             {!collapsed && (
    //                 <div
    //                     className="rounded-b overflow-hidden"
    //                     style={{ border: "1px solid #30363d", borderTop: "none" }}
    //                 >
    //                     {/* Command bar */}
    //                     {showButtons && (
    //                         <div className="p-2" style={{ backgroundColor: "#0d1117" }}>
    //                             <CommandBar
    //                                 diff={diff}
    //                                 onAcceptAll={handleAcceptAll}
    //                                 onRejectAll={handleRejectAll}
    //                                 onApply={handleApply}
    //                                 isApplied={isApplied}
    //                             />
    //                         </div>
    //                     )}

    //                     {/* Hunks */}
    //                     <div
    //                         className="p-2 overflow-x-auto"
    //                         style={{ backgroundColor: "#0d1117" }}
    //                     >
    //                         {diff.hunks.map(hunk => (
    //                             <HunkView
    //                                 key={hunk.id}
    //                                 hunk={hunk}
    //                                 onAccept={handleAccept}
    //                                 onReject={handleReject}
    //                                 showButtons={showButtons && !isApplied}
    //                             />
    //                         ))}
    //                     </div>
    //                 </div>
    //             )}
    //         </div>
    //     );
    // }; Why its not working check what is the issue with this code and fix the error`)
    //         expect(r.intent).toBe("bug_fix")
    //         expect(r.needsFileTree).toBe(true);
    //         expect(r.needsPackageJson).toBe(false);
    //         expect(r.needsGitDiff).toBe(true);
    //     });


    //     test("should classify of long prompt with code as refactor", () => {

    //         const r = classifyQuery(`
    //             // src/app/features/ide/extensions/chat/agent/query-classifier.ts
    // // Classifies user query intent WITHOUT calling an LLM.
    // // Weighted multi-label scoring — runs in <1ms, costs zero tokens.
    // // Used by the context gate to decide what to inject into the system prompt.

    // // ── Intent types ──────────────────────────────────────────────────────────────

    // export type QueryIntent =
    //     | "new_feature"      // build something new
    //     | "bug_fix"          // fix an existing problem
    //     | "question"         // asking about code / explaining
    //     | "refactor"         // restructure existing code
    //     | "run_command"      // run/build/test/install
    //     | "file_operation"   // create/delete/rename files
    //     | "ui_change"        // styling, layout, visual tweaks
    //     | "unknown";

    // export type ContextNeeds = {
    //     intent: QueryIntent;           // primary (highest-scoring) intent
    //     secondaryIntent?: QueryIntent; // second intent if multi-intent detected
    //     confidence: number;            // 0-1, how confident we are in the primary
    //     needsFileTree: boolean;
    //     needsPackageJson: boolean;
    //     needsActiveFile: boolean;
    //     needsGitDiff: boolean;
    //     maxFileTreeDepth: 1 | 2 | 3;
    //     reasoning: string;
    // };

    // // ── Weighted pattern rules ────────────────────────────────────────────────────
    // // Each rule has a weight. Multiple matching rules accumulate score.
    // // Higher weight = stronger signal for that intent.

    // type PatternRule = {
    //     pattern: RegExp;
    //     weight: number;
    //     /** If true, only match when pattern is near the BEGINNING of the query */
    //     anchorStart?: boolean;
    // };

    // const INTENT_RULES: Record<QueryIntent, PatternRule[]> = {

    //     question: [
    //         // Strong signals — sentence structure that implies a question
    //         { pattern: /^(what|how|why|when|where|who|which)\b/i, weight: 3, anchorStart: true },
    //         { pattern: /^(explain|describe|tell me|show me|walk me through)\b/i, weight: 3, anchorStart: true },
    //         { pattern: /\?$/, weight: 2 },
    //         // Weaker — could be question or instruction
    //         { pattern: /^(does|is|are|was|were|will|would|should|can|could)\b/i, weight: 2, anchorStart: true },
    //         { pattern: /\b(understand|meaning|difference between|what does|what is)\b/i, weight: 1.5 },
    //         { pattern: /\b(purpose|overview|how does .+ work)\b/i, weight: 1.5 },
    //     ],

    //     run_command: [
    //         { pattern: /\b(run|execute)\b/i, weight: 2 },
    //         { pattern: /\b(npm|yarn|pnpm|npx|pip|cargo|go run|make|docker)\b/i, weight: 3 },
    //         { pattern: /\b(install|uninstall)\b.{0,20}\b(package|dep|lib|module)\b/i, weight: 3 },
    //         { pattern: /\b(build|compile|bundle)\b/i, weight: 2 },
    //         { pattern: /\b(dev server|start server|stop server|restart)\b/i, weight: 3 },
    //         { pattern: /\b(lint|format|prettier|eslint)\b/i, weight: 2 },
    //         { pattern: /\b(deploy|push|publish)\b/i, weight: 2 },
    //         { pattern: /\b(kill|terminate|stop process|restart process)\b/i, weight: 3 },
    //         { pattern: /\bport\s+\d{2,5}\b/i, weight: 2 },
    //         { pattern: /\b(pm2|forever|daemon|systemctl|service)\b/i, weight: 2.5 },
    //         { pattern: /\bpid\b/i, weight: 2 },
    //     ],

    //     bug_fix: [
    //         { pattern: /\b(fix|debug|resolve|patch|hotfix)\b/i, weight: 2.5 },
    //         { pattern: /\b(error|bug|issue|problem|broken|failing|not working|crash)\b/i, weight: 2 },
    //         { pattern: /\b(exception|undefined is not|null reference|cannot read)\b/i, weight: 3 },
    //         { pattern: /\b(TypeError|ReferenceError|SyntaxError|RuntimeError)\b/i, weight: 3 },
    //         { pattern: /\b(stack trace|stacktrace|traceback)\b/i, weight: 2.5 },
    //         { pattern: /\b(doesn't work|isn't working|won't|stopped working)\b/i, weight: 2 },
    //         { pattern: /\b(wrong|incorrect|unexpected|should be)\b/i, weight: 1 },
    //         { pattern: /\b(regression|flaky|intermittent)\b/i, weight: 2 },
    //         { pattern: /\b(blank|white screen|freeze|hang|not respond|disappear)\b/i, weight: 2.5 },
    //         { pattern: /\b(when I (click|submit|save|press|type))\b/i, weight: 2 },
    //         { pattern: /\b(after|when).{0,20}(breaks?|crashes?|fails?|stops?)\b/i, weight: 2.5 },
    //         // Case 4: colloquial destruction
    //         { pattern: /\b(nuked?|destroyed?|messed up|broke|ruined|wrecked)\b/i, weight: 2.5 },
    //         { pattern: /\b(put it back|undo|revert|restore|go back to)\b/i, weight: 2.5 },
    //         // Case 2: noun/verb collision fix — build+broken = bug
    //         { pattern: /\bbuild\b.{0,30}\b(broken|failed|error|broken)\b/i, weight: 3 },
    //         { pattern: /\bpipeline\b.{0,20}\b(failed|broke|error)\b/i, weight: 3 },
    //     ],

    //     refactor: [
    //         { pattern: /\b(refactor|restructure|reorganize|rewrite)\b/i, weight: 3 },
    //         { pattern: /\b(rename|move to|extract|split|merge|consolidate)\b/i, weight: 2 },
    //         { pattern: /\b(clean up|simplify|DRY|deduplicate|reduce duplication)\b/i, weight: 2.5 },
    //         { pattern: /\b(improve|optimize|make .+ (better|faster|cleaner))\b/i, weight: 1.5 },
    //         { pattern: /\b(too (long|complex|nested|messy))\b/i, weight: 2 },
    //         { pattern: /\b(convert .+ to|migrate|upgrade)\b/i, weight: 2 },
    //         { pattern: /\b(abstract|decouple|disentangle|generalize)\b/i, weight: 3 },
    //         { pattern: /\b(lift|hoist|elevate)\b.{0,15}\b(out|up)\b/i, weight: 2.5 },
    //         { pattern: /\bdon'?t repeat\b/i, weight: 3 },
    //         { pattern: /\b(base class|abstract class|interface|inherit from|extend)\b/i, weight: 2.5 },
    //         { pattern: /\bmake.{0,20}(reusable|generic|shared|common)\b/i, weight: 2.5 },
    //         // Case 7: extraction by proxy
    //         { pattern: /\btake.{0,20}out of\b/i, weight: 2.5 },
    //         { pattern: /\bput.{0,20}in.{0,10}(its own|a separate|a new)\b/i, weight: 2.5 },
    //         { pattern: /\b(isolate|separate out|pull out|move out)\b/i, weight: 2.5 },
    //         // Case 6: structural creation = refactor not feature
    //         { pattern: /\b(abstract|base|generic).{0,15}class\b/i, weight: 3 },
    //         { pattern: /\bso (we|they) (can reuse|don'?t (repeat|duplicate))\b/i, weight: 3 },
    //     ],

    //     file_operation: [
    //         { pattern: /\b(create|make|add)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
    //         { pattern: /\b(delete|remove)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
    //         { pattern: /\b(rename|move)\b.{0,15}\b(file|folder|directory)\b/i, weight: 3 },
    //         { pattern: /\b(copy|duplicate)\b.{0,15}\b(file|folder)\b/i, weight: 2 },
    //         { pattern: /\b(new file|new folder|mkdir)\b/i, weight: 2.5 },
    //     ],

    //     ui_change: [
    //         { pattern: /\b(style|styling|css|tailwind|color|font|layout|margin|padding)\b/i, weight: 2 },
    //         { pattern: /\b(responsive|mobile|desktop|viewport|breakpoint)\b/i, weight: 2 },
    //         { pattern: /\b(center|align|flex|grid|position|z-index)\b/i, weight: 1.5 },
    //         { pattern: /\b(button|modal|navbar|sidebar|header|footer|card|form)\b.{0,20}\b(look|appear|style|design|ui)\b/i, weight: 2.5 },
    //         { pattern: /\b(dark mode|light mode|theme|animation|hover|transition)\b/i, weight: 2 },
    //         { pattern: /\b(icon|image|logo|background|border|shadow|radius)\b/i, weight: 1 },
    //         { pattern: /\b(make it|should be)\b.{0,20}\b(bigger|smaller|centered|visible|hidden|sticky)\b/i, weight: 2.5 },
    //     ],

    //     new_feature: [
    //         { pattern: /\b(add|build|create|implement|make|write|generate)\b/i, weight: 1.5 },
    //         { pattern: /\b(set up|configure|integrate|connect|wire up)\b/i, weight: 2 },
    //         { pattern: /\b(feature|functionality|capability|support for)\b/i, weight: 2 },
    //         { pattern: /\b(page|screen|view|component|module|service|hook|endpoint|route)\b/i, weight: 1 },
    //         { pattern: /\b(authentication|authorization|login|signup|payment|search|filter|sort)\b/i, weight: 2 },
    //         { pattern: /\b(api|database|db|schema|migration|model|controller)\b/i, weight: 1.5 },
    //         { pattern: /\b(app|application|website|web app|dashboard|admin)\b/i, weight: 1.5 },
    //     ],

    //     unknown: [],
    // };

    // // ── Negation dampener ─────────────────────────────────────────────────────────
    // // "Don't run tests" should NOT score high for run_command.
    // // If the query contains negation near a keyword, dampen that intent.

    // const NEGATION_PATTERNS = [
    //     /\b(don'?t|do not|never|without|no need to|skip|stop|avoid|instead of)\b/i,
    // ];

    // // ── Scoring engine ────────────────────────────────────────────────────────────

    // function scoreIntents(msg: string): Record<QueryIntent, number> {
    //     const scores: Record<QueryIntent, number> = {
    //         new_feature: 0,
    //         bug_fix: 0,
    //         question: 0,
    //         refactor: 0,
    //         run_command: 0,
    //         file_operation: 0,
    //         ui_change: 0,
    //         unknown: 0,
    //     };

    //     const hasNegation = NEGATION_PATTERNS.some(p => p.test(msg));
    //     const firstClause = msg.split(/[.,;!]\s/)[0] ?? msg; // first sentence/clause

    //     for (const [intent, rules] of Object.entries(INTENT_RULES) as [QueryIntent, PatternRule[]][]) {
    //         for (const rule of rules) {
    //             const target = rule.anchorStart ? firstClause : msg;
    //             if (rule.pattern.test(target)) {
    //                 let w = rule.weight;

    //                 // If negation detected and this keyword is near the negation, dampen
    //                 if (hasNegation && intent !== "question") {
    //                     // Check if negation appears near this pattern's match
    //                     const match = rule.pattern.exec(msg);
    //                     if (match) {
    //                         const matchPos = match.index;
    //                         for (const np of NEGATION_PATTERNS) {
    //                             const negMatch = np.exec(msg);
    //                             if (negMatch && Math.abs(negMatch.index - matchPos) < 30) {
    //                                 w *= 0.2; // heavy dampening
    //                                 break;
    //                             }
    //                         }
    //                     }
    //                 }

    //                 scores[intent] += w;
    //             }
    //         }
    //     }

    //     // ── Heuristic adjustments ─────────────────────────────────────────────────

    //     // If "question" scores high but another intent also scores high,
    //     // the user is probably asking to DO something, not just asking about it.
    //     // e.g., "Can you add a login page?" → question + new_feature → new_feature wins
    //     const nonQuestionMax = Math.max(
    //         scores.new_feature, scores.bug_fix, scores.refactor,
    //         scores.run_command, scores.file_operation, scores.ui_change,
    //     );
    //     if (scores.question > 0 && nonQuestionMax >= scores.question * 0.6) {
    //         scores.question *= 0.4;
    //     }

    //     // "add error handling" → new_feature, not bug_fix
    //     // If both new_feature and bug_fix score, check for creation verbs
    //     if (scores.bug_fix > 0 && scores.new_feature > 0) {
    //         if (/\b(add|implement|create|build|write)\b/i.test(firstClause)) {
    //             scores.bug_fix *= 0.5;
    //         }
    //     }

    //     // Short messages with a question mark are almost always questions
    //     if (msg.endsWith("?") && msg.length < 60 && scores.question > 0) {
    //         scores.question *= 1.5;
    //     }

    //     return scores;
    // }

    // // ── Public classifier ─────────────────────────────────────────────────────────

    // export function classifyQuery(userMessage: string): ContextNeeds {
    //     const msg = userMessage.trim();

    //     // Edge case: very short or empty
    //     if (msg.length < 3) {
    //         return {
    //             intent: "unknown",
    //             confidence: 0,
    //             needsFileTree: true,
    //             needsPackageJson: true,
    //             needsActiveFile: false,
    //             needsGitDiff: false,
    //             maxFileTreeDepth: 1,
    //             reasoning: "Message too short to classify",
    //         };
    //     }

    //     const scores = scoreIntents(msg);

    //     // Sort intents by score descending
    //     const sorted = (Object.entries(scores) as [QueryIntent, number][])
    //         .filter(([intent]) => intent !== "unknown")
    //         .sort((a, b) => b[1] - a[1]);

    //     const [primaryIntent, primaryScore] = sorted[0] ?? ["unknown", 0];
    //     const [secondaryIntent, secondaryScore] = sorted[1] ?? ["unknown", 0];
    //     const totalScore = sorted.reduce((acc, [, s]) => acc + s, 0);

    //     // Confidence: how dominant is the primary intent?
    //     const confidence = totalScore > 0
    //         ? Math.min(primaryScore / totalScore, 1)
    //         : 0;

    //     // Multi-intent detection: if secondary is >50% of primary, it's meaningful
    //     const hasSecondary = secondaryScore > primaryScore * 0.5 && secondaryScore > 1;

    //     const intent = primaryScore > 0 ? primaryIntent : "unknown";

    //     // ── Map intent → context needs ────────────────────────────────────────────
    //     // IMPORTANT: spread-copy to avoid mutating the shared constant
    //     const needs = { ...CONTEXT_NEEDS_MAP[intent] };

    //     // If confidence is low, be generous with context
    //     if (confidence < 0.4) {
    //         needs.needsFileTree = true;
    //         needs.needsPackageJson = true;
    //         needs.maxFileTreeDepth = 2;
    //     }

    //     return {
    //         ...needs,
    //         intent,
    //         secondaryIntent: hasSecondary ? secondaryIntent : undefined,
    //         confidence: Math.round(confidence * 100) / 100,

    //     };
    // }

    // // ── Context needs per intent ──────────────────────────────────────────────────

    // const CONTEXT_NEEDS_MAP: Record<QueryIntent, Omit<ContextNeeds, "intent" | "secondaryIntent" | "confidence" | "reasoning">> = {
    //     question: {
    //         needsFileTree: false,
    //         needsPackageJson: false,
    //         needsActiveFile: false,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 1,
    //     },
    //     run_command: {
    //         needsFileTree: false,
    //         needsPackageJson: true,
    //         needsActiveFile: false,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 1,
    //     },
    //     bug_fix: {
    //         needsFileTree: true,
    //         needsPackageJson: false,
    //         needsActiveFile: true,
    //         needsGitDiff: true,
    //         maxFileTreeDepth: 1,
    //     },
    //     refactor: {
    //         needsFileTree: true,
    //         needsPackageJson: false,
    //         needsActiveFile: true,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 2,
    //     },
    //     file_operation: {
    //         needsFileTree: true,
    //         needsPackageJson: false,
    //         needsActiveFile: false,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 1,
    //     },
    //     ui_change: {
    //         needsFileTree: true,
    //         needsPackageJson: false,
    //         needsActiveFile: true,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 1,
    //     },
    //     new_feature: {
    //         needsFileTree: true,
    //         needsPackageJson: true,
    //         needsActiveFile: false,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 2,
    //     },
    //     unknown: {
    //         needsFileTree: true,
    //         needsPackageJson: true,
    //         needsActiveFile: true,
    //         needsGitDiff: false,
    //         maxFileTreeDepth: 2,
    //     },
    // };

    // // ── Token estimator ───────────────────────────────────────────────────────────

    // export function estimateTokens(text: string): number {
    //     // ~3.5 chars per token for code-heavy content
    //     return Math.ceil(text.length / 3.5);
    // }   Write the addtional fixes in this source code and provide me the full revamped working code so i can paste it?
    //         `);

    //     });



});