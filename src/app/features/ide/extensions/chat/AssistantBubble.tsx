// src/components/chat/AssistantBubble.tsx
// Assistant message with:
//   - Typewriter streaming effect on the last (live) message
//   - react-markdown with syntax highlighting via highlight.js
//   - Collapsible reasoning/thinking block
//   - Copy-to-clipboard on code blocks
//   - Smooth fade-in on each paragraph as it arrives

import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./types/types";
import { useTypewriter } from "./chat-hook";
import { StatusRing } from "./StatusRing";
import {
    ChevronRight, Brain, Copy, Check,
} from "lucide-react";

// ── Code block with copy ──────────────────────────────────────────────────────

// const CodeBlock: React.FC<{
//     inline?: boolean;
//     className?: string;
//     children?: React.ReactNode;
// }> = ({ inline, className, children }) => {
//     const [copied, setCopied] = useState(false);
//     const code = String(children ?? "").replace(/\n$/, "");
//     const lang = (className ?? "").replace("language-", "") || "text";

//     if (inline) {
//         return (
//             <code className={cn(
//                 "px-1.5 py-0.5 rounded-md text-[11.5px] font-mono",
//                 "bg-muted/50 text-foreground/80 border border-border/25"
//             )}>
//                 {code}
//             </code>
//         );
//     }

//     const handleCopy = () => {
//         navigator.clipboard.writeText(code).then(() => {
//             setCopied(true);
//             setTimeout(() => setCopied(false), 1600);
//         });
//     };

//     return (
//         <div className="relative group my-3 rounded-xl overflow-hidden border border-border/25 bg-muted/25">
//             {/* Header bar */}
//             <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/20">
//                 <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">
//                     {lang}
//                 </span>
//                 <button
//                     type="button"
//                     onClick={handleCopy}
//                     className={cn(
//                         "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]",
//                         "text-muted-foreground/40 hover:text-muted-foreground",
//                         "hover:bg-muted/60 transition-all duration-150"
//                     )}
//                 >
//                     {copied
//                         ? <><Check size={10} className="text-emerald-400" /> Copied</>
//                         : <><Copy size={10} /> Copy</>
//                     }
//                 </button>
//             </div>
//             {/* Code */}
//             <pre className="overflow-x-auto px-4 py-3 text-[12px] font-mono leading-relaxed text-foreground/85">
//                 <code>{code}</code>
//             </pre>
//         </div>
//     );
// };


const CodeBlock: React.FC<{
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
    node?: any; // added for react-markdown passing the AST node
}> = ({ inline, className, children, node }) => {
    const [copied, setCopied] = useState(false);
    const code = String(children ?? "").replace(/\n$/, "");

    // Check for language-xxx class
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "text";

    // Since react-markdown v9+ removed the `inline` prop, we infer it:
    // If it has no language class AND no newlines, it's inline.
    const isInline = inline !== undefined
        ? inline
        : !match && !code.includes("\n");

    if (isInline) {
        return (
            <code className={cn(
                "px-1.5 py-0.5 rounded-md text-[11.5px] font-mono",
                "bg-muted/50 text-foreground/80 border border-border/25"
            )}>
                {code}
            </code>
        );
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        });
    };

    return (
        <div className="relative group my-3 rounded-xl overflow-hidden border border-border/25 bg-muted/25">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/20">
                <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                    {lang}
                </span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]",
                        "text-muted-foreground/40 hover:text-muted-foreground",
                        "hover:bg-muted/60 transition-all duration-150"
                    )}
                >
                    {copied
                        ? <><Check size={10} className="text-emerald-400" /> Copied</>
                        : <><Copy size={10} /> Copy</>
                    }
                </button>
            </div>
            {/* Code */}
            <pre className="overflow-x-auto px-4 py-3 text-[12px] font-mono leading-relaxed text-foreground/85">
                <code>{code}</code>
            </pre>
        </div>
    );
};

// ── Markdown component map ────────────────────────────────────────────────────

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
    pre: ({ children }) => <>{children}</>,
    code: CodeBlock as any,
    p: ({ children }) => (
        <p className="mb-2 last:mb-0 leading-relaxed text-[13px] text-foreground/90">
            {children}
        </p>
    ),
    h1: ({ children }) => (
        <h1 className="text-[16px] font-semibold text-foreground mt-4 mb-2 first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-[14px] font-semibold text-foreground mt-3 mb-1.5 first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-[13px] font-semibold text-foreground/90 mt-2.5 mb-1 first:mt-0">
            {children}
        </h3>
    ),
    ul: ({ children }) => (
        <ul className="my-2 pl-4 space-y-1 list-disc list-outside marker:text-muted-foreground/40">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="my-2 pl-4 space-y-1 list-decimal list-outside marker:text-muted-foreground/40">
            {children}
        </ol>
    ),
    li: ({ children }) => (
        <li className="text-[13px] text-foreground/85 leading-relaxed">
            {children}
        </li>
    ),
    blockquote: ({ children }) => (
        <blockquote className={cn(
            "my-2 pl-3 border-l-2 border-border/50",
            "text-muted-foreground/70 italic text-[12.5px]"
        )}>
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-4 border-border/20" />,
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
        >
            {children}
        </a>
    ),
    strong: ({ children }) => (
        <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="italic text-foreground/80">{children}</em>
    ),
    table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-border/25">
            <table className="w-full text-[12px]">{children}</table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-muted/40 border-b border-border/25">{children}</thead>
    ),
    tr: ({ children }) => (
        <tr className="border-b border-border/15 last:border-0">{children}</tr>
    ),
    th: ({ children }) => (
        <th className="px-3 py-2 text-left font-medium text-foreground/70 text-[11px] uppercase tracking-wider">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="px-3 py-2 text-foreground/75">{children}</td>
    ),
};

// ── Reasoning block ───────────────────────────────────────────────────────────

const ReasoningBlock: React.FC<{
    reasoning: string;
    isStreaming: boolean;
}> = ({ reasoning, isStreaming }) => {
    const isDone = !isStreaming || reasoning.length > 0;
    const [open, setOpen] = useState(isStreaming); // open while streaming, close when done

    useEffect(() => {
        // Auto-close when streaming ends
        if (!isStreaming) {
            const t = setTimeout(() => setOpen(false), 600);
            return () => clearTimeout(t);
        }
    }, [isStreaming]);

    return (
        <div className={cn(
            "mb-3 rounded-xl border border-border/25",
            "bg-muted/15 overflow-hidden transition-all duration-200"
        )}>
            {/* Header */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-left",
                    "hover:bg-muted/30 transition-colors duration-150 select-none"
                )}
            >
                <Brain size={12} className="text-purple-400/70 flex-shrink-0" />
                <span className="text-[11px] font-medium text-muted-foreground/60 flex-1">
                    Reasoning
                </span>
                {isStreaming && (
                    <StatusRing status="thinking" size={14} className="text-purple-400" />
                )}
                <ChevronRight
                    size={11}
                    className={cn(
                        "text-muted-foreground/30 transition-transform duration-150",
                        open && "rotate-90"
                    )}
                />
            </button>

            {/* Content */}
            <div style={{
                maxHeight: open ? "320px" : 0,
                overflow: "hidden",
                transition: "max-height 220ms cubic-bezier(0.4,0,0.2,1)",
            }}>
                <div className="px-3 pb-3 pt-0.5 border-t border-border/15">
                    <p className={cn(
                        "text-[11.5px] leading-relaxed font-mono",
                        "text-muted-foreground/55 whitespace-pre-wrap",
                        "max-h-72 overflow-y-auto"
                    )}>
                        {reasoning}
                        {isStreaming && (
                            <span className="inline-block w-[2px] h-[13px] bg-purple-400/50 ml-0.5 align-text-bottom animate-pulse" />
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
};

// ── Cursor blink ──────────────────────────────────────────────────────────────

const CURSOR_STYLES = `
@keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
}
.streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 14px;
    background: currentColor;
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: cursor-blink 0.9s ease-in-out infinite;
}
`;
let cursorStylesInjected = false;
function injectCursorStyles() {
    if (cursorStylesInjected || typeof document === "undefined") return;
    const s = document.createElement("style");
    s.textContent = CURSOR_STYLES;
    document.head.appendChild(s);
    cursorStylesInjected = true;
}

// ── AssistantBubble (main export) ─────────────────────────────────────────────

interface AssistantBubbleProps {
    message: ChatMessage & { role: "assistant" };
    isStreaming: boolean; // true = this is the live message being typed
    isGhosted: boolean;
}

export const AssistantBubble: React.FC<AssistantBubbleProps> = ({
    message,
    isStreaming,
    isGhosted,
}) => {
    useEffect(() => { injectCursorStyles(); }, []);

    // Typewriter only active on the live streaming message
    const rawText = message.displayContent ?? "";
    const displayedText = useTypewriter(
        isStreaming ? rawText : rawText,
        isStreaming ? 3 : 9999 // instant replay for committed messages
    );

    const hasReasoning = !!message.reasoning?.trim();
    const isEmpty = !rawText && !hasReasoning;

    if (isEmpty) {
        // Show a pulse while waiting for first tokens
        return (
            <div className="flex items-center gap-2 py-2 px-1">
                <StatusRing status="thinking" size={16} />
                <span className="text-[12px] text-muted-foreground/40 font-mono">
                    Thinking
                    <span className="thinking-dots">...</span>
                </span>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col gap-0 max-w-full",
            isGhosted && "opacity-40"
        )}>
            {/* Reasoning */}
            {hasReasoning && (
                <ReasoningBlock
                    reasoning={message.reasoning!.trim()}
                    isStreaming={isStreaming && !rawText}
                />
            )}

            {/* Main content */}
            {displayedText && (
                <div className="relative">
                    <ReactMarkdown components={MD_COMPONENTS}>
                        {displayedText}
                    </ReactMarkdown>

                    {/* Blinking cursor at end of live stream */}
                    {isStreaming && (
                        <span
                            className="streaming-cursor text-foreground/60"
                            aria-hidden="true"
                        />
                    )}
                </div>
            )}
        </div>
    );
};