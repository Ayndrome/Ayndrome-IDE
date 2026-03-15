// src/components/chat/chat-hooks.ts
// Core hooks: typewriter effect, scroll-to-bottom, stream status helpers.

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/src/store/chat-thread-store";
import { ThreadStreamState } from "./types/types";

// ── useTypewriter ─────────────────────────────────────────────────────────────
// Animates text appearing character by character.
// When fullText grows (new chunks), it picks up from where it left off.
// When fullText resets to "" (new message), it resets instantly.

export function useTypewriter(fullText: string, charsPerFrame = 4) {
    const [displayed, setDisplayed] = useState("");
    const indexRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const prevFullRef = useRef("");

    useEffect(() => {
        // Hard reset when text shrinks (new message started)
        if (fullText.length < prevFullRef.current.length) {
            indexRef.current = 0;
            setDisplayed("");
        }
        prevFullRef.current = fullText;

        if (indexRef.current >= fullText.length) return;

        const tick = () => {
            indexRef.current = Math.min(
                indexRef.current + charsPerFrame,
                fullText.length
            );
            setDisplayed(fullText.slice(0, indexRef.current));

            if (indexRef.current < fullText.length) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [fullText, charsPerFrame]);

    // If not streaming anymore, always show full text
    const isComplete = indexRef.current >= fullText.length;
    return isComplete ? fullText : displayed;
}

// ── useScrollToBottom ─────────────────────────────────────────────────────────
// Auto-scrolls a container to the bottom when content grows,
// unless the user has manually scrolled up (respects user intent).

export function useScrollToBottom<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const isAtBottomRef = useRef(true);
    const lastHeightRef = useRef(0);

    const scrollToBottom = useCallback((force = false) => {
        const el = ref.current;
        if (!el) return;
        if (force || isAtBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

    const onScroll = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
        isAtBottomRef.current = distFromBottom < 8;
    }, []);

    // Watch for content growth and auto-scroll
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new ResizeObserver(() => {
            if (el.scrollHeight !== lastHeightRef.current) {
                lastHeightRef.current = el.scrollHeight;
                scrollToBottom();
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [scrollToBottom]);

    return { ref, onScroll, scrollToBottom };
}

// ── useStreamStatus ───────────────────────────────────────────────────────────
// Derives human-readable status label + animation state from raw stream state.

export type StreamStatus =
    | { kind: "idle" }
    | { kind: "thinking"; label: string }
    | { kind: "streaming"; label: string }
    | { kind: "tool"; label: string; toolName: string }
    | { kind: "awaiting"; label: string }
    | { kind: "error"; label: string };

const TOOL_LABELS: Record<string, string> = {
    read_file: "Reading file",
    write_file: "Writing file",
    create_file: "Creating file",
    delete_file: "Deleting file",
    search_files: "Searching files",
    search_in_file: "Searching in file",
    list_directory: "Listing directory",
    run_terminal: "Running terminal",
};

export function useStreamStatus(threadId: string): StreamStatus {
    const streamState = useChatStore((s) => s.streamState[threadId]);

    if (!streamState) return { kind: "idle" };

    switch (streamState.status) {
        case "streaming":
            return streamState.partialText
                ? { kind: "streaming", label: "Generating" }
                : { kind: "thinking", label: "Thinking" };

        case "tool_running":
            return {
                kind: "tool",
                label: TOOL_LABELS[streamState.toolName] ?? "Using tool",
                toolName: streamState.toolName,
            };

        case "awaiting_user":
            return { kind: "awaiting", label: "Waiting for approval" };

        case "error":
            return { kind: "error", label: streamState.message };

        case "idle":
            return { kind: "thinking", label: "Processing" };

        default:
            return { kind: "idle" };
    }
}

// ── useChatMode ───────────────────────────────────────────────────────────────

export function useChatMode() {
    const chatMode = useChatStore((s) => s.chatMode);
    const setChatMode = useChatStore((s) => s.setChatMode);
    return { chatMode, setChatMode };
}

// ── useCurrentThread ──────────────────────────────────────────────────────────

export function useCurrentThread() {
    const currentThreadId = useChatStore((s) => s.currentThreadId);
    const thread = useChatStore((s) => s.threads[currentThreadId]);
    return { thread, threadId: currentThreadId };
}