'use client';

import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { history } from "@codemirror/commands";
import { githubDark } from "../extensions/theme";
import { useEditorStore } from "@/src/store/editor-store";
import { miniMap } from "./minmap";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { suggestions } from "../extensions/autocompletion"; // ← single clean import

export const CodeEditor = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const { activeTab: getActiveTab, updateContent, setView } = useEditorStore();
    const activeTab = getActiveTab();

    useEffect(() => {
        if (!editorRef.current) return;

        const view = new EditorView({
            state: EditorState.create({
                doc: activeTab?.content ?? "// Select a file to start editing\n",
                extensions: [
                    basicSetup,
                    javascript({ typescript: true, jsx: true }),
                    githubDark,
                    history(),
                    miniMap(),
                    indentationMarkers(),

                    // ✅ All suggestion logic in one call
                    suggestions({
                        fileName: activeTab?.fileName ?? "index.ts",
                        debounceRef,
                    }),

                    // Content sync → store
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            const fileId = getActiveTab()?.fileId;
                            if (fileId) updateContent(fileId, update.state.doc.toString());
                        }
                    }),

                    EditorView.domEventHandlers({
                        keydown(event, view) {
                            // console.log("KEY:", event.key, "| Ctrl:", event.ctrlKey, "| Shift:", event.shiftKey);
                        },
                    }),
                ],
            }),
            parent: editorRef.current,
        });

        viewRef.current = view;
        setView(view);

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab?.fileId]);

    // Sync on external save
    useEffect(() => {
        const view = viewRef.current;
        if (!view || !activeTab) return;
        const current = view.state.doc.toString();
        if (current !== activeTab.content) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: activeTab.content },
            });
        }
    }, [activeTab?.savedContent]);

    return (
        <div className="flex flex-col size-full">
            <div
                ref={editorRef}
                className="flex-1 overflow-hidden"
                style={{ backgroundColor: "#0d1117" }}
            />
        </div>
    );
};