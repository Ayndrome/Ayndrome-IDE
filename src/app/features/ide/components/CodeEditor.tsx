// 'use client';

// import { useEffect, useRef } from "react";
// import { EditorView } from "@codemirror/view";
// import { EditorState } from "@codemirror/state";
// import { basicSetup } from "codemirror";
// import { javascript } from "@codemirror/lang-javascript";
// import { history } from "@codemirror/commands";
// import { githubDark } from "../extensions/theme";
// import { useEditorStore } from "@/src/store/editor-store";
// import { miniMap } from "./minmap";
// import { indentationMarkers } from "@replit/codemirror-indentation-markers";
// import { suggestions } from "../extensions/autocompletion";
// import { useSaveShortcut } from "../../projects/hooks/use-save-shortcut";
// export const CodeEditor = () => {
//     useSaveShortcut();
//     const editorRef = useRef<HTMLDivElement>(null);
//     const viewRef = useRef<EditorView | null>(null);
//     const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

//     const { activeTab: getActiveTab, updateContent, setView } = useEditorStore();
//     const activeTab = getActiveTab();

//     useEffect(() => {
//         if (!editorRef.current) return;

//         const view = new EditorView({
//             state: EditorState.create({
//                 doc: activeTab?.content ?? "// Select a file to start editing\n",
//                 extensions: [
//                     basicSetup,
//                     javascript({ typescript: true, jsx: true }),
//                     githubDark,
//                     history(),
//                     miniMap(),
//                     indentationMarkers(),

//                     // ✅ All suggestion logic in one call
//                     suggestions({
//                         fileName: activeTab?.fileName ?? "index.ts",
//                         debounceRef,
//                     }),

//                     // Content sync → store
//                     // EditorView.updateListener.of((update) => {
//                     //     if (update.docChanged) {
//                     //         const fileId = getActiveTab()?.fileId;
//                     //         if (fileId) updateContent(fileId, update.state.doc.toString());
//                     //     }
//                     // }),

//                     EditorView.domEventHandlers({
//                         keydown(event, view) {
//                             // console.log("KEY:", event.key, "| Ctrl:", event.ctrlKey, "| Shift:", event.shiftKey);
//                         },
//                     }),
//                 ],
//             }),
//             parent: editorRef.current,
//         });

//         viewRef.current = view;
//         setView(view);

//         return () => {
//             view.destroy();
//             viewRef.current = null;
//         };
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, []);

//     // Sync on external save
//     useEffect(() => {
//         const view = viewRef.current;
//         if (!view || !activeTab) return;
//         const current = view.state.doc.toString();
//         if (current !== activeTab.content) {
//             view.dispatch({
//                 changes: { from: 0, to: current.length, insert: activeTab.content },
//             });
//         }
//     }, [activeTab?.savedContent]);

//     return (
//         <div className="flex flex-col size-full">
//             <div
//                 ref={editorRef}
//                 className="flex-1 overflow-hidden"
//                 style={{ backgroundColor: "#0d1117" }}
//             />
//         </div>
//     );
// };

// src/app/features/ide/components/CodeEditor.tsx
// Phase 8: adds diff decoration extension + view registration

// src/app/features/ide/components/CodeEditor.tsx
// Phase 8 final: adds streaming writer extension

// 'use client';

// import { useEffect, useRef } from "react";
// import { EditorView } from "@codemirror/view";
// import { EditorState } from "@codemirror/state";
// import { basicSetup } from "codemirror";
// import { javascript } from "@codemirror/lang-javascript";
// import { history } from "@codemirror/commands";
// import { githubDark } from "../extensions/theme";
// import { useEditorStore } from "@/src/store/editor-store";
// import { useDiffStore } from "@/src/store/diff-store";
// import { useStreamingWriterStore } from "@/src/store/streaming-writer-store";
// import { miniMap } from "./minmap";
// import { indentationMarkers } from "@replit/codemirror-indentation-markers";
// import { suggestions } from "../extensions/autocompletion";
// import { useSaveShortcut } from "../../projects/hooks/use-save-shortcut";
// import { diffDecorationExtension } from "../extensions/editor/diff-decoration";
// import { streamingWriterExtension } from "../extensions/editor/streaming-writer";

// export const CodeEditor = () => {
//     useSaveShortcut();

//     const editorRef = useRef<HTMLDivElement>(null);
//     const viewRef = useRef<EditorView | null>(null);
//     const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
//     const filePathRef = useRef<string | null>(null);

//     const { activeTab: getActiveTab, updateContent, setView } = useEditorStore();
//     const {
//         registerView: registerDiffView,
//         unregisterView: unregisterDiffView,
//         acceptHunk,
//         rejectHunk,
//     } = useDiffStore();
//     const {
//         registerView: registerStreamView,
//         unregisterView: unregisterStreamView,
//     } = useStreamingWriterStore();

//     const activeTab = getActiveTab();

//     useEffect(() => {
//         if (!editorRef.current) return;

//         const filePath = activeTab?.relativePath ?? null;
//         filePathRef.current = filePath;

//         const view = new EditorView({
//             state: EditorState.create({
//                 doc: activeTab?.content ?? "// Select a file to start editing\n",
//                 extensions: [
//                     basicSetup,
//                     javascript({ typescript: true, jsx: true }),
//                     githubDark,
//                     history(),
//                     miniMap(),
//                     indentationMarkers(),
//                     suggestions({
//                         fileName: activeTab?.fileName ?? "index.ts",
//                         debounceRef,
//                     }),

//                     // ── Phase 8: diff decorations ─────────────────────────────
//                     ...(filePath ? [
//                         diffDecorationExtension(
//                             (hunkId, fp) => acceptHunk(fp, hunkId),
//                             (hunkId, fp) => rejectHunk(fp, hunkId),
//                             filePath,
//                         ),
//                     ] : []),

//                     // ── Phase 8: streaming writer ─────────────────────────────
//                     streamingWriterExtension(),

//                     EditorView.domEventHandlers({
//                         keydown(_event, _view) { },
//                     }),

//                     // Content sync → store (skip during streaming)
//                     EditorView.updateListener.of((update) => {
//                         if (!update.docChanged) return;
//                         const path = filePathRef.current;
//                         if (!path) return;

//                         // Don't sync to store during streaming —
//                         // streaming-writer-store owns the content
//                         const isStreaming = useStreamingWriterStore
//                             .getState()
//                             .isStreaming(path);
//                         if (isStreaming) return;

//                         updateContent(path, update.state.doc.toString());
//                     }),
//                 ],
//             }),
//             parent: editorRef.current,
//         });

//         viewRef.current = view;
//         setView(view);

//         // Register with both stores
//         if (filePath) {
//             registerDiffView(filePath, view);
//             registerStreamView(filePath, view);
//         }

//         return () => {
//             if (filePath) {
//                 unregisterDiffView(filePath);
//                 unregisterStreamView(filePath);
//             }
//             view.destroy();
//             viewRef.current = null;
//         };
//         // Recreate when active file changes
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [activeTab?.relativePath]);

//     // Sync on external save — skip if streaming or diff pending
//     useEffect(() => {
//         const view = viewRef.current;
//         if (!view || !activeTab) return;

//         const fp = activeTab.relativePath;
//         if (useStreamingWriterStore.getState().isStreaming(fp)) return;
//         if (useDiffStore.getState().pendingDiffs[fp]) return;

//         const current = view.state.doc.toString();
//         if (current !== activeTab.content) {
//             view.dispatch({
//                 changes: {
//                     from: 0,
//                     to: current.length,
//                     insert: activeTab.content,
//                 },
//             });
//         }
//     }, [activeTab?.savedContent]);

//     return (
//         <div className="flex flex-col size-full">
//             <div
//                 ref={editorRef}
//                 className="flex-1 overflow-hidden"
//                 style={{ backgroundColor: "#0d1117" }}
//             />
//         </div>
//     );
// };


// src/app/features/ide/components/CodeEditor.tsx
// Phase 11: LSP extension + Ctrl+click file path navigation

'use client';

import { useEffect, useRef, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { history } from "@codemirror/commands";
import { githubDark, githubDarkIndentMarkers } from "../extensions/theme";
import { useEditorStore } from "@/src/store/editor-store";
import { useDiffStore } from "@/src/store/diff-store";
import { useStreamingWriterStore } from "@/src/store/streaming-writer-store";
import { useIDEStore } from "@/src/store/ide-store";
import { miniMap } from "./minmap";
// indentationMarkers now exported from theme.ts as githubDarkIndentMarkers

import { suggestions } from "../extensions/autocompletion";
import { useSaveShortcut } from "../../projects/hooks/use-save-shortcut";
import { diffDecorationExtension } from "../extensions/editor/diff-decoration";
import { streamingWriterExtension } from "../extensions/editor/streaming-writer";
import {
    getLspClient,
    languageFromPath,
    toFileUri,
} from "../extensions/editor/lsp-client";
import { lspExtension } from "../extensions/editor/lsp-extension";
import { ctrlClickExtension } from "../extensions/editor/ctrl-click";
import { oneDark } from '@codemirror/theme-one-dark'

export const CodeEditor = () => {
    useSaveShortcut();

    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const filePathRef = useRef<string | null>(null);

    const { activeTab: getActiveTab, updateContent, setView, openFile } = useEditorStore();
    const {
        registerView: registerDiffView,
        unregisterView: unregisterDiffView,
        acceptHunk, rejectHunk,
    } = useDiffStore();
    const {
        registerView: registerStreamView,
        unregisterView: unregisterStreamView,
    } = useStreamingWriterStore();
    const { workspaceId, projectId } = useIDEStore();

    const activeTab = getActiveTab();

    // ── Navigate to file (go-to-def + Ctrl+click) ────────────────────────────

    const handleNavigate = useCallback(async (
        targetPath: string,
        line: number,
    ) => {
        if (!workspaceId || !projectId) return;

        // Read content from disk
        try {
            const params = new URLSearchParams({
                workspaceId: workspaceId as string,
                path: targetPath,
            });
            const res = await fetch(`/api/files?${params}`);
            if (!res.ok) return;
            const { content } = await res.json();

            openFile(
                targetPath,
                projectId,
                targetPath.split("/").pop() ?? targetPath,
                content ?? "",
            );

            // Jump to line after editor mounts
            setTimeout(() => {
                const view = viewRef.current;
                if (!view || line === 0) return;
                const docLine = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
                view.dispatch({
                    selection: { anchor: docLine.from },
                    scrollIntoView: true,
                });
            }, 150);

        } catch (err) {
            console.error("[CodeEditor] navigate failed:", err);
        }
    }, [workspaceId, projectId, openFile]);

    // ── Mount editor ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (!editorRef.current) return;

        const filePath = activeTab?.relativePath ?? null;
        filePathRef.current = filePath;

        const language = filePath ? languageFromPath(filePath) : null;
        const langExt = filePath?.endsWith(".py")
            ? python()
            : javascript({ typescript: true, jsx: true });

        // LSP client for this file's language
        const lspClient = (language && workspaceId && filePath)
            ? getLspClient(
                workspaceId as string,
                language,
                "file:///workspace",
            )
            : null;

        const extensions = [
            basicSetup,
            // ── Height constraint: prevent CM from growing parent div ─────
            EditorView.theme({
                "&": { height: "100%" },
                ".cm-scroller": { overflow: "auto", height: "100%" },
            }),

            langExt,
            githubDark,
            
            
            history(),
            miniMap(),
            githubDarkIndentMarkers,

            suggestions({
                fileName: activeTab?.fileName ?? "index.ts",
                debounceRef,
            }),

            // ── Diff decorations ──────────────────────────────────────────
            ...(filePath ? [
                diffDecorationExtension(
                    (hunkId, fp) => acceptHunk(fp, hunkId),
                    (hunkId, fp) => rejectHunk(fp, hunkId),
                    filePath,
                ),
            ] : []),

            // ── Streaming writer ──────────────────────────────────────────
            streamingWriterExtension(),

            // ── LSP ───────────────────────────────────────────────────────
            ...(lspClient && filePath ? [
                lspExtension(lspClient, filePath, handleNavigate),
            ] : []),

            // ── Ctrl+click file paths ─────────────────────────────────────
            // ...(workspaceId ? [
            //     ctrlClickExtension(handleNavigate),
            // ] : []),

            EditorView.domEventHandlers({ keydown() { } }),

            // Content sync (skip during streaming)
            EditorView.updateListener.of((update) => {
                if (!update.docChanged) return;
                const path = filePathRef.current;
                if (!path) return;
                const isStreaming = useStreamingWriterStore
                    .getState().isStreaming(path);
                if (isStreaming) return;
                updateContent(path, update.state.doc.toString());
            }),
        ];

        const view = new EditorView({
            state: EditorState.create({
                doc: activeTab?.content ?? "// Select a file to start editing\n",
                extensions,
            }),
            parent: editorRef.current,
        });

        viewRef.current = view;
        setView(view);

        if (filePath) {
            registerDiffView(filePath, view);
            registerStreamView(filePath, view);
        }

        return () => {
            if (filePath) {
                unregisterDiffView(filePath);
                unregisterStreamView(filePath);
            }
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab?.relativePath]);

    // ── Sync on external save ─────────────────────────────────────────────────

    useEffect(() => {
        const view = viewRef.current;
        if (!view || !activeTab) return;
        const fp = activeTab.relativePath;
        if (useStreamingWriterStore.getState().isStreaming(fp)) return;
        if (useDiffStore.getState().pendingDiffs[fp]) return;
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
                style={{ backgroundColor: "#141414" }}
            />
        </div>
    );
};



