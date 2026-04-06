// src/components/chat/UserBubble.tsx
// User message: display mode + inline edit mode.
// Attachments shown as chips above the message text.

import React, { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/src/store/chat-thread-store";
import { ChatMessage, StagingSelection } from "./types/types";
import { Pencil, X, File, Code2, Folder, RotateCcw } from "lucide-react";

// ── Attachment chips (read-only, past message) ────────────────────────────────

const AttachmentChips: React.FC<{ attachments: StagingSelection[] }> = ({ attachments }) => {
    if (!attachments.length) return null;
    return (
        <div className="flex flex-wrap gap-1 mb-1.5">
            {attachments.map((sel, i) => {
                const Icon =
                    sel.type === "File" ? File :
                        sel.type === "CodeSelection" ? Code2 : Folder;
                const label =
                    sel.type === "File" ? (sel.filePath.split("/").pop() ?? sel.filePath) :
                        sel.type === "CodeSelection"
                            ? `${sel.filePath.split("/").pop()} (${sel.range[0]}-${sel.range[1]})` :
                            sel.folderPath.split("/").filter(Boolean).pop() ?? sel.folderPath;

                return (
                    <div
                        key={i}
                        className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded",
                            "bg-muted/30 border border-border/25",
                            "text-[10px] font-mono text-muted-foreground/60"
                        )}
                    >
                        <Icon size={9} className="flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{label}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ── Inline edit textarea ──────────────────────────────────────────────────────

interface EditFormProps {
    initialValue: string;
    threadId: string;
    messageIdx: number;
    onClose: () => void;
}

const EditForm: React.FC<EditFormProps> = ({
    initialValue,
    threadId,
    messageIdx,
    onClose,
}) => {
    const [value, setValue] = useState(initialValue);
    const [submitting, setSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const editMessage = useChatStore((s) => s.editUserMessageAndStreamResponse);

    // Auto-resize
    const resize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
    };
    useEffect(() => {
        resize();
        textareaRef.current?.focus();
        // Place cursor at end
        const len = textareaRef.current?.value.length ?? 0;
        textareaRef.current?.setSelectionRange(len, len);
    }, []);

    const handleSubmit = useCallback(async () => {
        const trimmed = value.trim();
        if (!trimmed || submitting) return;
        setSubmitting(true);
        try {
            await editMessage({ userMessage: trimmed, messageIdx, threadId });
            onClose();
        } finally {
            setSubmitting(false);
        }
    }, [value, submitting, editMessage, messageIdx, threadId, onClose]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape") onClose();
    };

    const isEmpty = value.trim().length === 0;

    return (
        <div className={cn(
            "max-w-[88%] rounded-xl border border-border/60",
            "bg-card/80 backdrop-blur-sm shadow-sm",
            "overflow-hidden"
        )}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => { setValue(e.target.value); resize(); }}
                onKeyDown={handleKeyDown}
                rows={1}
                className={cn(
                    "max-w-[88%] resize-none bg-transparent px-3 pt-3 pb-2",
                    "text-[13px] text-foreground placeholder:text-muted-foreground/40",
                    "outline-none border-none ring-0 leading-relaxed",
                    "min-h-[52px] max-h-[280px]"
                )}
            />
            <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                <span className="text-[10px] text-muted-foreground/30 mr-auto font-mono">
                    ↵ send  ⎋ cancel
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium",
                        "text-muted-foreground hover:text-foreground",
                        "hover:bg-muted/50 transition-colors"
                    )}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={isEmpty || submitting}
                    onClick={handleSubmit}
                    className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium",
                        "transition-all duration-150",
                        isEmpty || submitting
                            ? "bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                            : "bg-foreground text-background hover:opacity-80 cursor-pointer"
                    )}
                >
                    {submitting ? "Sending…" : "Send"}
                </button>
            </div>
        </div>
    );
};

// // ── UserBubble (main export) ──────────────────────────────────────────────────

// interface UserBubbleProps {
//     message: ChatMessage & { role: "user" };
//     messageIdx: number;
//     threadId: string;
//     isGhosted: boolean;
// }

// export const UserBubble: React.FC<UserBubbleProps> = ({
//     message,
//     messageIdx,
//     threadId,
//     isGhosted,
// }) => {
//     const [editing, setEditing] = useState(false);
//     const [hovered, setHovered] = useState(false);

//     const attachments = message.attachments ?? message.state?.stagingSelections ?? [];

//     if (editing) {
//         return (
//             <div className="w-full max-w-full ml-auto">
//                 <EditForm
//                     initialValue={message.displayContent}
//                     threadId={threadId}
//                     messageIdx={messageIdx}
//                     onClose={() => setEditing(false)}
//                 />
//             </div>
//         );
//     }

//     return (
//         <div
//             className={cn(
//                 "flex flex-col items-end",
//                 isGhosted && "opacity-40 pointer-events-none"
//             )}
//             onMouseEnter={() => setHovered(true)}
//             onMouseLeave={() => setHovered(false)}
//         >
//             {/* Attachment chips */}
//             <AttachmentChips attachments={attachments} />

//             {/* Bubble + edit button row */}
//             <div className="flex items-end gap-1.5 w-full">
//                 {/* Edit button — appears on hover */}
//                 <button
//                     type="button"
//                     onClick={() => setEditing(true)}
//                     className={cn(
//                         "mb-0.5 p-1.5 rounded-lg flex-shrink-0",
//                         "text-muted-foreground/40 hover:text-muted-foreground",
//                         "hover:bg-muted/50 transition-all duration-150",
//                         hovered ? "opacity-100" : "opacity-0"
//                     )}
//                     title="Edit message"
//                 >
//                     <Pencil size={11} />
//                 </button>

//                 {/* Message bubble */}
//                 <div
//                     className={cn(
//                         "px-3.5 py-2.5 rounded-2xl rounded-br-sm",
//                         "bg-muted/50 border border-border/25",
//                         "text-[13px] text-foreground leading-relaxed",
//                         "whitespace-pre-wrap break-words",
//                         "cursor-pointer hover:bg-muted/70 transition-colors duration-150",
//                         "max-w-[88%]"
//                     )}
//                     onClick={() => setEditing(true)}
//                     title="Click to edit"
//                 >
//                     {message.displayContent}
//                 </div>
//             </div>
//         </div>
//     );
// };
// ── UserBubble (main export) ──────────────────────────────────────────────────


interface UserBubbleProps {
    message: ChatMessage & { role: "user" };
    messageIdx: number;
    threadId: string;
    isGhosted: boolean;
}

export const UserBubble: React.FC<UserBubbleProps> = ({
    message,
    messageIdx,
    threadId,
    isGhosted,
}) => {
    const [editing, setEditing] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const attachments = message.attachments ?? message.state?.stagingSelections ?? [];

    // Configurable character limit
    const CHAR_LIMIT = 400;
    const content = message.displayContent || "";
    const isLong = content.length > CHAR_LIMIT;

    // Slice up to limit, and use regex to avoid cutting a word in half
    const truncatedContent = isLong
        ? content.slice(0, CHAR_LIMIT).replace(/\s+\S*$/, "") + "..."
        : content;

    const textToShow = isLong && !expanded ? truncatedContent : content;

    if (editing) {
        return (
            <div className="w-full max-w-full ml-auto">
                <EditForm
                    initialValue={message.displayContent}
                    threadId={threadId}
                    messageIdx={messageIdx}
                    onClose={() => setEditing(false)}
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex flex-col items-end",
                isGhosted && "opacity-40 pointer-events-none"
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Attachment chips */}
            <AttachmentChips attachments={attachments} />

            {/* Bubble + edit button row */}
            <div className="flex items-end gap-1.5 max-w-[88%]">
                {/* Edit button — appears on hover */}
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={cn(
                        "mb-0.5 p-1.5 rounded-lg flex-shrink-0",
                        "text-muted-foreground/40 hover:text-muted-foreground",
                        "hover:bg-muted/50 transition-all duration-150",
                        hovered ? "opacity-100" : "opacity-0"
                    )}
                    title="Edit message"
                >
                    <Pencil size={11} />
                </button>

                {/* Message bubble */}
                <div
                    className={cn(
                        "px-3.5 py-2.5 rounded-2xl rounded-br-sm",
                        "bg-muted/50 border border-border/25",
                        "text-[13px] text-foreground leading-relaxed",
                        "whitespace-pre-wrap break-words",
                        "cursor-pointer hover:bg-muted/70 transition-colors duration-150",
                        "max-w-[88%]"
                    )}
                    onClick={() => setEditing(true)}
                    title="Click to edit"
                >
                    {textToShow}

                    {/* Expand / Collapse Button */}
                    {isLong && (
                        <button
                            type="button"
                            onClick={(e) => {
                                // Prevent triggering the edit mode when expanding/collapsing
                                e.stopPropagation();
                                setExpanded(!expanded);
                            }}
                            className={cn(
                                "block mt-1.5 text-[11px] font-medium transition-colors",
                                "text-muted-foreground/60 hover:text-foreground/80"
                            )}
                        >
                            {expanded ? "Show less" : "Show more"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};