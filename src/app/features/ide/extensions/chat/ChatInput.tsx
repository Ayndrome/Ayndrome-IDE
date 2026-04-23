// // ## Phase 7 complete — here's the honest grade:
// // ```
// // Security (Phase 7)
// //   API auth (Clerk JWT)        8/10  — needs Redis rate limiter for multi-server
// //   Rate limiting               6/10  — in-memory, lost on restart, single server only
// //   Path traversal guard        9/10  — comprehensive, covers all known patterns
// //   Payload limits              9/10  — covers file size + message size
// //   Thread corruption recovery  8/10  — safe parse with fallback
// //   AbortController cleanup     7/10  — improved, needs WeakRef for long sessions

// // Task Decomposition (Phase 7)
// //   Complexity classifier       7/10  — heuristic, misses edge cases
// //   Plan generation             8/10  — Haiku is fast + cheap, structured output solid
// //   Step tracking               7/10  — heuristic step matching, not deterministic
// //   Plan bubble UI              9/10  — feature-complete, clean UX
// //   Plan persistence            8/10  — stored in Convex with thread
// //   Mode toggle                 9/10  — clean UX, per-session

// // Overall Phase 7 grade: 7.8/10

// // Gaps to 10/10:
// //   - Rate limiter needs Upstash Redis for multi-server/serverless
// //   - Step matching is heuristic — agent should explicitly report step number
// //   - Plan revision not supported — agent can't update the plan mid-execution
// //   - No plan skip: agent can't mark steps irrelevant after seeing more context
// //   - Complexity classifier has no ML — just regex patterns
// //   - Clerk SDK adds ~200ms cold start — consider edge auth middleware instead



// src/components/chat/ChatInput.tsx
// Phase 12: @ mention picker + updated bottom pills styling

import React, {
    useRef, useState, useCallback,
    KeyboardEvent, useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { StagingSelection } from "./types/types";
import { useChatMode, useCurrentThread } from "./chat-hook";
import { useMentionPicker } from "./hooks/use-mention-picker";
import type { MentionItem } from "./hooks/use-mention-picker";
import { MentionPicker } from "./MentionPicker";
import {
    ArrowUp, Square, X, File, Code2,
    Folder, ChevronDown, Paperclip, ListChecksIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";
import { PROVIDERS } from "@/src/lib/model-provider/provider-registry";
import { C } from "@/src/app/features/ide/components/SessionSidebar";
import { FileIcon, FolderIcon, DefaultFolderOpenedIcon } from "@react-symbols/icons/utils";


// ── Mode selector ─────────────────────────────────────────────────────────────
// (unchanged from original — keeping full component)

const MODE_META = {
    normal: { label: "Chat", description: "Conversational answers", color: "text-zinc-400" },
    gather: { label: "Gather", description: "Read-only file access", color: "text-zinc-400" },
    agent: { label: "Agent", description: "Edits files and runs tools", color: "text-zinc-400" },
} as const;

const ModeSelector: React.FC = () => {
    const { chatMode, setChatMode } = useChatMode();
    const { planMode, setPlanMode } = useChatStore();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const meta = MODE_META[chatMode];

    return (
        <div ref={ref} className="relative flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium",
                    "border border-border/40 bg-muted/30 hover:bg-muted/60",
                    "transition-all duration-150 select-none",
                    meta.color
                )}
            >
                {meta.label}
                <ChevronDown
                    size={10}
                    className={cn(
                        "transition-transform duration-150",
                        open && "rotate-180"
                    )}
                />
            </button>

            {open && (
                <div className={cn(
                    "absolute bottom-full left-0 mb-1.5 w-48 z-50",
                    "rounded-lg border border-border/50 bg-popover shadow-xl shadow-black/20",
                    "overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
                )}>
                    {(Object.keys(MODE_META) as Array<keyof typeof MODE_META>).map(mode => {
                        const m = MODE_META[mode];
                        return (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => { setChatMode(mode); setOpen(false); }}
                                className={cn(
                                    "w-full flex flex-col items-start px-3 py-2.5 text-left",
                                    "hover:bg-muted/60 transition-colors duration-100",
                                    chatMode === mode && "bg-muted/40",
                                )}
                            >
                                <span className={cn("text-[12px] font-semibold", m.color)}>
                                    {m.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                    {m.description}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Plan mode pill */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => setPlanMode(!planMode)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors duration-150"
                        style={{
                            backgroundColor: planMode ? "#1e2e22" : "transparent",
                            color: planMode ? "#59a869" : "#6f737a",
                            border: planMode
                                ? "1px solid #2e4a34"
                                : "1px solid transparent",
                        }}
                    >
                        <ListChecksIcon size={11} />
                        <span>Plan</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                    {planMode ? "Plan mode on" : "Quick mode"}
                </TooltipContent>
            </Tooltip>
        </div>
    );
};

// ── Attachment chip ───────────────────────────────────────────────────────────

const AttachmentChip: React.FC<{
    selection: StagingSelection;
    onRemove: () => void;
}> = ({ selection, onRemove }) => {
    const Icon =
        selection.type === "File" ? File
            : selection.type === "CodeSelection" ? Code2
                : Folder;

    const label =
        selection.type === "File"
            ? selection.filePath.split("/").pop() ?? selection.filePath
            : selection.type === "CodeSelection"
                ? `${selection.filePath.split("/").pop()} (${selection.range[0]}-${selection.range[1]})`
                : selection.folderPath.split("/").filter(Boolean).pop() ?? selection.folderPath;

    return (
        <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md",
            "bg-muted/40 border border-border/30",
            "text-[11px] text-muted-foreground font-mono max-w-[180px]"
        )}>

            {/* <Icon size={10} className="flex-shrink-0 text-muted-foreground/60" /> */}
            <div className="flex items-center gap-1.5">
                <FileIcon fileName={label} autoAssign className="size-4" />
                {label}
            </div>
            <button type="button" onClick={onRemove}
                className="flex-shrink-0 hover:text-foreground transition-colors">
                <X size={9} />
            </button>
        </div>
    );
};

// ── Submit / Stop ─────────────────────────────────────────────────────────────

const SubmitButton: React.FC<{ disabled: boolean; onClick: () => void }> = ({
    disabled, onClick,
}) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
            "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
            "transition-all duration-150",
            disabled
                ? "bg-muted/40 text-muted-foreground/30 cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-80 cursor-pointer"
        )}
    >
        <ArrowUp size={14} strokeWidth={2.5} />
    </button>
);

const StopButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
            "bg-foreground text-background hover:opacity-80 transition-all duration-150"
        )}
    >
        <Square size={11} strokeWidth={3} />
    </button>
);

// ── ChatInput (main export) ───────────────────────────────────────────────────

interface ChatInputProps {
    threadId: string;
    isStreaming: boolean;
    onSubmit: (text: string) => void;
    onAbort: () => void;
    className?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    threadId,
    isStreaming,
    onSubmit,
    onAbort,
    className,
}) => {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const thread = useChatStore(s => s.threads[threadId]);
    const stagingSelections = thread?.state.stagingSelections ?? [];
    const removeStagingSelection = useChatStore(s => s.removeStagingSelection);
    const addStagingSelection = useChatStore(s => s.addStagingSelection);

    const providerStore = useProviderStore();
    const activeModel = providerStore.getEffectiveModel(threadId);
    const activeProv = PROVIDERS.find(p => p.name === activeModel.provider);
    const activeModelDef = activeProv?.models.find(m => m.id === activeModel.modelId);


    // ── @ mention picker ──────────────────────────────────────────────────────
    const mention = useMentionPicker();

    // Auto-resize textarea
    const resize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);

    useEffect(() => { resize(); }, [text, resize]);

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming) return;
        onSubmit(trimmed);
        setText("");
        mention.close();
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    }, [text, isStreaming, onSubmit, mention]);

    // ── Handle @ mention selection ────────────────────────────────────────────

    const handleMentionSelect = useCallback((item: MentionItem) => {
        // Replace the @query in the textarea with @filename
        const trigger = mention.state.trigger;
        const before = text.slice(0, trigger);
        const after = text.slice(
            trigger + 1 + mention.state.query.length
        );
        const newText = `${before}@${item.fileName} ${after}`;
        setText(newText);
        mention.close();

        // Add file as staging selection so content is sent to agent
        addStagingSelection({
            type: "File",
            filePath: item.relativePath,
        } as any);

        // Refocus textarea
        setTimeout(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            const pos = before.length + item.fileName.length + 2;
            el.setSelectionRange(pos, pos);
        }, 0);
    }, [text, mention, addStagingSelection]);

    // ── Keyboard handling ─────────────────────────────────────────────────────

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Let mention picker intercept navigation keys
        const handled = mention.onKeyDown(e, handleMentionSelect);
        if (handled) return;

        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape" && isStreaming) {
            onAbort();
        }
    }, [mention, handleMentionSelect, handleSubmit, isStreaming, onAbort]);

    // ── Text change — detect @ trigger ────────────────────────────────────────

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart ?? val.length;
        setText(val);
        mention.onTextChange(val, cursor);
    }, [mention]);

    const isEmpty = text.trim().length === 0;

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative flex flex-col rounded-xl border border-border/50",
                "bg-card/60 backdrop-blur-sm shadow-sm",
                "transition-all duration-200",
                "focus-within:border-border focus-within:shadow-md focus-within:shadow-black/5 min-w-0",
                className
            )}
        >
            {/* ── @ mention picker ── */}
            <MentionPicker
                state={mention.state}
                onSelect={handleMentionSelect}
                onClose={mention.close}
            />

            {/* ── Attachment chips ── */}
            {stagingSelections.length > 0 && (
                <div className="flex flex-nowrap gap-1.5 px-3 pt-2.5 overflow-x-auto scrollbar-none">
                    {stagingSelections.map((sel, i) => (
                        <AttachmentChip
                            key={i}
                            selection={sel}
                            onRemove={() => removeStagingSelection(i)}
                        />
                    ))}
                </div>
            )}

            {/* ── Textarea ── */}
            <textarea
                ref={textareaRef}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything, @ to mention files…"
                rows={1}
                className={cn(
                    "w-full resize-none bg-transparent px-3 pt-3 pb-2",
                    "text-[13px] text-foreground placeholder:text-muted-foreground/50",
                    "outline-none border-none ring-0 min-w-0",
                    "min-h-[44px] max-h-[200px]",
                    "font-sans leading-relaxed"
                )}
            />

            {/* ── Bottom row ── */}
            <div className="flex items-center justify-between px-3 pb-2.5 gap-2 min-w-0 overflow-hidden">
                {/* Left side — clips on narrow widths, never wraps */}
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    <ModeSelector />
                    <button
                        onClick={() => {/* open per-thread model picker — future */ }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors min-w-0 overflow-hidden"
                        style={{
                            color: C.faint,
                            backgroundColor: "transparent",
                            border: `1px solid transparent`,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = C.text;
                            e.currentTarget.style.backgroundColor = C.hover;
                            e.currentTarget.style.borderColor = C.border;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = C.faint;
                            e.currentTarget.style.backgroundColor = "transparent";
                            e.currentTarget.style.borderColor = "transparent";
                        }}
                        title={`${activeProv?.label} · ${activeModelDef?.label ?? activeModel.modelId}`}
                    >
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] block">
                            {activeProv?.label} · {activeModelDef?.label ?? activeModel.modelId}
                        </span>
                    </button>
                    <button
                        type="button"
                        className="flex-shrink-0 p-1 rounded-md hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        title="Attach file"
                    >
                        <Paperclip size={12} />
                    </button>
                    {/* @ shortcut hint — hidden when panel is very narrow */}
                    <span
                        className="text-[11px] select-none flex-shrink-0 hidden sm:block"
                        style={{ color: "#6f737a" }}
                    >
                        @ files
                    </span>
                </div>
                {/* Right side — never shrinks */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground/30 font-mono select-none">
                        {text.length > 0 ? `${text.length}` : ""}
                    </span>
                    {isStreaming
                        ? <StopButton onClick={onAbort} />
                        : <SubmitButton disabled={isEmpty} onClick={handleSubmit} />
                    }
                </div>
            </div>
        </div>
    );
};