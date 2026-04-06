
import { useEffect, useCallback } from "react";
import { useEditorStore } from "@/src/store/editor-store";
import { useIDEStore } from "@/src/store/ide-store";

export function useSaveShortcut() {
    const { activeTab, markSaved } = useEditorStore();
    const { workspaceId } = useIDEStore();

    const save = useCallback(async () => {
        const tab = activeTab();
        if (!tab || !tab.isDirty) return;
        if (!workspaceId) return;

        try {
            const res = await fetch("/api/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    path: tab.relativePath,
                    content: tab.content,
                    action: "write",
                }),
            });

            if (res.ok) {
                markSaved(tab.relativePath, tab.content);
            } else {
                console.error("[Save] Failed:", await res.text());
            }
        } catch (err) {
            console.error("[Save] Error:", err);
        }
    }, [activeTab, markSaved, workspaceId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Intercept Ctrl+S (Windows/Linux) and Cmd+S (Mac)
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();   // ← stops browser save dialog
                e.stopPropagation();
                save();
            }
        };

        // useCapture: true — fires before browser default handling
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [save]);

    return { save };
}