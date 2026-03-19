// src/components/chat/ToolCard.tsx
// Collapsible tool call card — covers all 8 tool states across all tool types.
// Design: glass card with left accent border that changes color by state.
// States: invalid_params | tool_request | running_now | tool_error |
//         success | rejected | interrupted_tool

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    ChevronRight,
    FileText, FilePlus, FileX, Search,
    FolderOpen, Terminal, AlertTriangle,
    Ban, CheckCircle2, Clock, Copy, Check,
} from "lucide-react";
import { WebToolName } from "./types/types";
import { StatusRing } from "./StatusRing";

// ── State-derived visual tokens ───────────────────────────────────────────────

type ToolState =
    | "pending"    // tool_request waiting for approval
    | "running"    // running_now
    | "success"    // success
    | "error"      // tool_error
    | "rejected"   // rejected
    | "invalid"    // invalid_params
    | "interrupted"; // interrupted_tool

const STATE_TOKENS: Record<ToolState, {
    accent: string;
    icon: React.ReactNode;
    labelSuffix?: string;
    ring: "idle" | "thinking" | "streaming" | "tool" | "awaiting" | "error";
}> = {
    pending: { accent: "border-amber-500/40 bg-amber-500/3", icon: <Clock size={11} className="text-amber-400" />, ring: "awaiting" },
    running: { accent: "border-sky-500/40 bg-sky-500/3", icon: null, ring: "tool" },
    success: { accent: "border-emerald-500/25 bg-emerald-500/3", icon: <CheckCircle2 size={11} className="text-emerald-400" />, ring: "idle" },
    error: { accent: "border-red-500/35 bg-red-500/3", icon: <AlertTriangle size={11} className="text-red-400" />, ring: "error" },
    rejected: { accent: "border-zinc-500/25 bg-zinc-500/3", icon: <Ban size={11} className="text-zinc-500" />, ring: "idle" },
    invalid: { accent: "border-red-500/35 bg-red-500/3", icon: <AlertTriangle size={11} className="text-red-400" />, ring: "error" },
    interrupted: { accent: "border-zinc-500/25 bg-zinc-500/3", icon: <Ban size={11} className="text-zinc-500" />, ring: "idle" },
};

// ── Tool display metadata ─────────────────────────────────────────────────────

type ToolMeta = {
    icon: React.ReactNode;
    verbNow: string;    // "Reading"
    verbDone: string;   // "Read"
    verbPropose: string;// "Read file"
};

const TOOL_META: Record<string, ToolMeta> = {
    read_file: { icon: <FileText size={11} />, verbNow: "Reading", verbDone: "Read", verbPropose: "Read file" },
    write_file: { icon: <FilePlus size={11} />, verbNow: "Writing", verbDone: "Wrote", verbPropose: "Write file" },
    create_file: { icon: <FilePlus size={11} />, verbNow: "Creating", verbDone: "Created", verbPropose: "Create file" },
    delete_file: { icon: <FileX size={11} />, verbNow: "Deleting", verbDone: "Deleted", verbPropose: "Delete file" },
    search_files: { icon: <Search size={11} />, verbNow: "Searching", verbDone: "Searched", verbPropose: "Search files" },
    search_in_file: { icon: <Search size={11} />, verbNow: "Searching in", verbDone: "Searched in", verbPropose: "Search in file" },
    list_directory: { icon: <FolderOpen size={11} />, verbNow: "Listing", verbDone: "Listed", verbPropose: "List directory" },
    run_terminal: { icon: <Terminal size={11} />, verbNow: "Running", verbDone: "Ran terminal", verbPropose: "Run terminal" },
};

// ── Filename extractor ────────────────────────────────────────────────────────

function extractLabel(toolName: WebToolName, rawParams: Record<string, any>): string {
    const p = rawParams ?? {};
    if (p.filePath) return p.filePath.split("/").pop() ?? p.filePath;
    if (p.dirPath) return p.dirPath.split("/").filter(Boolean).pop() ?? p.dirPath;
    if (p.query) return `"${String(p.query).slice(0, 28)}${p.query.length > 28 ? "…" : ""}"`;
    if (p.command) return `$ ${String(p.command).slice(0, 32)}${p.command.length > 32 ? "…" : ""}`;
    return toolName.replace(/_/g, " ");
}

// ── Copy button ───────────────────────────────────────────────────────────────

const CopyBtn: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                });
            }}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            title="Copy"
        >
            {copied
                ? <Check size={10} className="text-emerald-400" />
                : <Copy size={10} />
            }
        </button>
    );
};

// ── Collapsible content panel ─────────────────────────────────────────────────

const ExpandPanel: React.FC<{
    open: boolean;
    children: React.ReactNode;
}> = ({ open, children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!ref.current) return;
        if (open) {
            // Use scrollHeight for animation target
            setHeight(ref.current.scrollHeight);
        } else {
            // First set explicit height to allow transition from current
            setHeight(ref.current.scrollHeight);
            // Then next frame collapse
            requestAnimationFrame(() => setHeight(0));
        }
    }, [open]);

    // When content changes (streaming text grows), update height
    useEffect(() => {
        if (!open || !ref.current) return;
        const ro = new ResizeObserver(() => {
            if (ref.current) setHeight(ref.current.scrollHeight);
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [open]);

    return (
        <div
            style={{
                height: open ? height || "auto" : 0,
                overflow: "hidden",
                transition: "height 220ms cubic-bezier(0.4,0,0.2,1)",
            }}
        >
            <div ref={ref}>
                {children}
            </div>
        </div>
    );
};

// ── Tool result content ───────────────────────────────────────────────────────

const ToolResultContent: React.FC<{
    toolName: WebToolName;
    result: any;
    rawParams: Record<string, any>;
}> = ({ toolName, result, rawParams }) => {
    if (!result) return null;

    // write_file — show lint errors if any
    if (toolName === "write_file" && result.lintErrors?.length) {
        return (
            <div className="space-y-1">
                {result.lintErrors.map((e: any, i: number) => (
                    <div key={i} className="flex gap-2 text-[11px] font-mono">
                        <span className="text-amber-400/70 flex-shrink-0">L{e.startLine}</span>
                        <span className="text-muted-foreground/70">{e.message}</span>
                    </div>
                ))}
            </div>
        );
    }

    // read_file — show content snippet
    if (toolName === "read_file" && typeof result.content === "string") {
        const lines = result.content.split("\n").slice(0, 24);
        const truncated = result.content.split("\n").length > 24;
        return (
            <div className="relative">
                <pre className={cn(
                    "text-[11px] font-mono leading-relaxed",
                    "text-muted-foreground/70 whitespace-pre-wrap break-all",
                    "max-h-48 overflow-y-auto"
                )}>
                    {lines.join("\n")}
                    {truncated && (
                        <span className="text-muted-foreground/40 italic">
                            {"\n"}…{result.totalLines - 24} more lines
                        </span>
                    )}
                </pre>
                <CopyBtn text={result.content} />
            </div>
        );
    }

    // search_files — file list
    if (toolName === "search_files" && Array.isArray(result.filePaths)) {
        return (
            <ul className="space-y-1">
                {result.filePaths.map((fp: string, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/70">
                        <FileText size={9} className="flex-shrink-0 text-muted-foreground/40" />
                        <span className="truncate">{fp}</span>
                    </li>
                ))}
                {result.hasMore && (
                    <li className="text-[10px] text-muted-foreground/40 italic">More results available…</li>
                )}
            </ul>
        );
    }

    // search_in_file — matching lines
    if (toolName === "search_in_file" && Array.isArray(result.matchingLines)) {
        return (
            <div className="space-y-0.5">
                {result.matchingLines.slice(0, 12).map((line: number) => (
                    <div key={line} className="text-[11px] font-mono text-muted-foreground/60">
                        Line {line}
                    </div>
                ))}
            </div>
        );
    }

    // list_directory
    if (toolName === "list_directory" && Array.isArray(result.entries)) {
        return (
            <ul className="space-y-1">
                {result.entries.map((e: any, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/70">
                        {e.isDirectory
                            ? <FolderOpen size={9} className="flex-shrink-0 text-sky-400/60" />
                            : <FileText size={9} className="flex-shrink-0 text-muted-foreground/40" />
                        }
                        <span>{e.name}{e.isDirectory ? "/" : ""}</span>
                    </li>
                ))}
            </ul>
        );
    }

    // run_terminal — command output
    if (toolName === "run_terminal" && result.output != null) {
        return (
            <div className="relative">
                <pre className={cn(
                    "text-[11px] font-mono leading-relaxed",
                    "text-emerald-400/70 whitespace-pre-wrap break-all",
                    "max-h-40 overflow-y-auto",
                    result.exitCode !== 0 && result.exitCode != null && "text-red-400/70"
                )}>
                    {result.output || "(no output)"}
                </pre>
                {result.timedOut && (
                    <span className="text-[10px] text-amber-400/60 font-mono mt-1 block">
                        [timed out]
                    </span>
                )}
                {result.exitCode != null && result.exitCode !== 0 && (
                    <span className="text-[10px] text-red-400/60 font-mono mt-1 block">
                        Exit {result.exitCode}
                    </span>
                )}
                <CopyBtn text={result.output ?? ""} />
            </div>
        );
    }

    // Generic JSON fallback
    const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return (
        <pre className="text-[11px] font-mono text-muted-foreground/60 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
            {str.slice(0, 800)}
            {str.length > 800 && "\n…"}
        </pre>
    );
};

// ── ToolCard (main export) ────────────────────────────────────────────────────

export interface ToolCardProps {
    toolName: WebToolName;
    toolState: ToolState;
    rawParams: Record<string, any>;
    result?: any;
    errorMessage?: string;
    mcpServerName?: string;
    // For interrupted_tool — no params/result
    isInterrupted?: boolean;
}

export const ToolCard: React.FC<ToolCardProps> = ({
    toolName,
    toolState,
    rawParams,
    result,
    errorMessage,
    mcpServerName,
    isInterrupted,
}) => {
    const tokens = STATE_TOKENS[toolState];
    const meta = TOOL_META[toolName];
    const label = extractLabel(toolName, rawParams);

    // Auto-open while running; user can toggle after
    const [open, setOpen] = useState(toolState === "running" || toolState === "success");
    const [userToggled, setUserToggled] = useState(false);

    // When transitioning running → success, keep open unless user closed manually
    useEffect(() => {
        if (toolState === "running" && !userToggled) setOpen(true);
        if (toolState === "success" && !userToggled) setOpen(true);
    }, [toolState, userToggled]);

    const hasContent =
        (toolState === "success" && result != null) ||
        (toolState === "error" && errorMessage) ||
        (toolState === "invalid" && errorMessage);

    const verb =
        toolState === "running" ? meta?.verbNow :
            toolState === "success" ? meta?.verbDone :
                toolState === "pending" ? meta?.verbPropose :
                    toolState === "rejected" ? meta?.verbPropose :
                        meta?.verbPropose ?? toolName.replace(/_/g, " ");

    return (
        <div className={cn(
            "rounded-lg border-l-2 border border-border/25",
            "transition-all duration-200",
            tokens.accent,
            isInterrupted && "opacity-50"
        )}>
            {/* ── Header row ── */}
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2",
                    hasContent && "cursor-pointer select-none",
                    isInterrupted && "line-through"
                )}
                onClick={() => {
                    if (!hasContent) return;
                    setOpen((v) => !v);
                    setUserToggled(true);
                }}
            >
                {/* Chevron */}
                {hasContent && (
                    <ChevronRight
                        size={11}
                        className={cn(
                            "text-muted-foreground/40 flex-shrink-0 transition-transform duration-150",
                            open && "rotate-90"
                        )}
                    />
                )}

                {/* Tool icon */}
                <span className="text-muted-foreground/50 flex-shrink-0">
                    {meta?.icon ?? <FileText size={11} />}
                </span>

                {/* Verb + label */}
                <span className="flex items-center gap-1.5 flex-1 min-w-0 text-[12px]">
                    <span className={cn(
                        "font-medium flex-shrink-0",
                        toolState === "running" && "text-sky-300/90",
                        toolState === "success" && "text-foreground/80",
                        (toolState === "error" || toolState === "invalid") && "text-red-400/80",
                        (toolState === "rejected" || toolState === "interrupted") && "text-muted-foreground/50",
                        toolState === "pending" && "text-amber-300/90",
                    )}>
                        {verb}
                    </span>
                    <span className="font-mono text-muted-foreground/60 truncate text-[11px]">
                        {label}
                    </span>
                    {mcpServerName && (
                        <span className="text-[10px] text-muted-foreground/30 flex-shrink-0 font-mono">
                            via {mcpServerName}
                        </span>
                    )}
                </span>

                {/* Right: status icon or ring */}
                <div className="flex-shrink-0 ml-auto">
                    {toolState === "running" ? (
                        <StatusRing status="tool" size={16} />
                    ) : (
                        tokens.icon
                    )}
                </div>
            </div>

            {/* ── Expandable content ── */}
            {hasContent && (
                <ExpandPanel open={open}>
                    <div className={cn(
                        "px-3 pb-2.5 pt-0.5",
                        "border-t border-border/15"
                    )}>
                        {(toolState === "error" || toolState === "invalid") && errorMessage ? (
                            <pre className="text-[11px] font-mono text-red-400/70 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                {errorMessage}
                            </pre>
                        ) : (
                            <ToolResultContent
                                toolName={toolName}
                                result={result}
                                rawParams={rawParams}
                            />
                        )}
                    </div>
                </ExpandPanel>
            )}
        </div>
    );
};

