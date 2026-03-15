'use client';

import { useEffect } from "react";

type ShortcutMap = {
    key: string;
    meta?: boolean;   // Cmd on Mac
    ctrl?: boolean;   // Ctrl for both, will auto-handle
    shift?: boolean;
    handler: () => void;
};

/**
 * Registers global keyboard shortcuts that work on both Mac (⌘) and Windows/Linux (Ctrl).
 * Pass `meta: true` and it will trigger on ⌘ (Mac) OR Ctrl (Win/Linux).
 */
export const useKeyboardShortcuts = (shortcuts: ShortcutMap[]) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't fire inside text inputs (unless explicitly desired)
            const tag = (e.target as HTMLElement).tagName;
            const isInInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
            if (isInInput) return;

            for (const shortcut of shortcuts) {
                const metaMatch = shortcut.meta ? (e.metaKey || e.ctrlKey) : true;
                const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;
                const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
                const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

                if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
                    e.preventDefault();
                    shortcut.handler();
                    break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [shortcuts]);
};
