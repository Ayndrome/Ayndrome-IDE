// src/components/chat/ChatInput.tsx
// The chat input area: textarea, file attachments, mode selector,
// submit/stop button. Replaces VoidChatArea.

import React, {
    useRef,
    useState,
    useCallback,
    KeyboardEvent,
    useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { StagingSelection } from "./types/types";
import { useChatMode, useCurrentThread } from "./chat-hook";
import {
    ArrowUp,
    Square,
    X,
    File,
    Code2,
    Folder,
    ChevronDown,
    Paperclip,
} from "lucide-react";

// ── Mode selector ─────────────────────────────────────────────────────────────

const MODE_META = {
    normal: {
        label: "Chat",
        description: "Conversational answers",
        color: "text-zinc-400",
    },
    gather: {
        label: "Gather",
        description: "Read-only file access",
        color: "text-sky-400",
    },
    agent: {
        label: "Agent",
        description: "Edits files and runs tools",
        color: "text-emerald-400",
    },
} as const;

const ModeSelector: React.FC = () => {
    const { chatMode, setChatMode } = useChatMode();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const meta = MODE_META[chatMode];

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
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
                    {(Object.keys(MODE_META) as Array<keyof typeof MODE_META>).map((mode) => {
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
        </div>
    );
};

// ── Attachment chip ───────────────────────────────────────────────────────────

const AttachmentChip: React.FC<{
    selection: StagingSelection;
    onRemove: () => void;
}> = ({ selection, onRemove }) => {
    const Icon =
        selection.type === "File"
            ? File
            : selection.type === "CodeSelection"
                ? Code2
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
            "text-[11px] text-muted-foreground font-mono",
            "max-w-[180px]"
        )}>
            <Icon size={10} className="flex-shrink-0 text-muted-foreground/60" />
            <span className="truncate">{label}</span>
            <button
                type="button"
                onClick={onRemove}
                className="flex-shrink-0 hover:text-foreground transition-colors"
            >
                <X size={9} />
            </button>
        </div>
    );
};

// ── Submit / Stop buttons ─────────────────────────────────────────────────────

const SubmitButton: React.FC<{
    disabled: boolean;
    onClick: () => void;
}> = ({ disabled, onClick }) => (
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
            "bg-foreground text-background hover:opacity-80",
            "transition-all duration-150 cursor-pointer"
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
    const thread = useChatStore((s) => s.threads[threadId]);
    const stagingSelections = thread?.state.stagingSelections ?? [];
    const removeStagingSelection = useChatStore((s) => s.removeStagingSelection);

    // Auto-resize textarea
    const resize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);

    useEffect(() => { resize(); }, [text, resize]);

    const handleSubmit = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming) return;
        onSubmit(trimmed);
        setText("");
        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [text, isStreaming, onSubmit]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape" && isStreaming) {
            onAbort();
        }
    }, [handleSubmit, isStreaming, onAbort]);

    const isEmpty = text.trim().length === 0;

    return (
        <div className={cn(
            "relative flex flex-col rounded-xl border border-border/50",
            "bg-card/60 backdrop-blur-sm shadow-sm",
            "transition-all duration-200",
            "focus-within:border-border focus-within:shadow-md focus-within:shadow-black/5",
            className
        )}>
            {/* Attachment chips */}
            {stagingSelections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                    {stagingSelections.map((sel, i) => (
                        <AttachmentChip
                            key={i}
                            selection={sel}
                            onRemove={() => removeStagingSelection(i)}
                        />
                    ))}
                </div>
            )}

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                rows={1}
                className={cn(
                    "w-full resize-none bg-transparent px-3 pt-3 pb-2",
                    "text-[13px] text-foreground placeholder:text-muted-foreground/50",
                    "outline-none border-none ring-0",
                    "min-h-[44px] max-h-[200px]",
                    "font-sans leading-relaxed"
                )}
            />

            {/* Bottom row */}
            <div className="flex items-center justify-between px-3 pb-2.5 gap-2">
                {/* Left: mode + attach */}
                <div className="flex items-center gap-2">
                    <ModeSelector />
                    <button
                        type="button"
                        className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150"
                        title="Attach file"
                    >
                        <Paperclip size={12} />
                    </button>
                </div>

                {/* Right: submit/stop */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground/30 font-mono select-none">
                        {text.length > 0 ? `${text.length}` : ""}
                    </span>
                    {isStreaming ? (
                        <StopButton onClick={onAbort} />
                    ) : (
                        <SubmitButton disabled={isEmpty} onClick={handleSubmit} />
                    )}
                </div>
            </div>
        </div>
    );
};