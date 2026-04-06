// import { create } from "zustand";
// import { Id } from "@/convex/_generated/dataModel";
// import { EditorView } from "@codemirror/view";

// export interface OpenTab {
//     fileId: Id<"files">;
//     projectId: Id<"projects">;   // ← scopes tabs so "index.ts" in Project A ≠ Project B
//     fileName: string;
//     filePath: string[];           // breadcrumb segments e.g. ["src", "utils", "index.ts"]
//     isDirty: boolean;
//     content: string;
//     savedContent: string;
// }

// interface EditorState {

//     view: EditorView | null;
//     setView: (view: EditorView) => void;

//     tabs: OpenTab[];
//     activeFileId: Id<"files"> | null;

//     // Derived
//     activeTab: () => OpenTab | null;

//     // Actions
//     openFile: (
//         fileId: Id<"files">,
//         projectId: Id<"projects">,
//         fileName: string,
//         content?: string,
//         filePath?: string[]
//     ) => void;
//     closeTab: (fileId: Id<"files">) => void;
//     setActiveFile: (fileId: Id<"files">) => void;
//     updateContent: (fileId: Id<"files">, content: string) => void;
//     markSaved: (fileId: Id<"files">, savedContent: string) => void;
//     updateFilePath: (fileId: Id<"files">, filePath: string[]) => void;
//     /** Remove all tabs that belong to a given project (called on project switch/close) */
//     resetProject: (projectId: Id<"projects">) => void;
//     reset: () => void;
// }

// export const useEditorStore = create<EditorState>((set, get) => ({
//     tabs: [],
//     activeFileId: null,
//     view: null,
//     setView: (view: EditorView | null) => set({ view }),

//     activeTab: () => {
//         const { tabs, activeFileId } = get();
//         return tabs.find(t => t.fileId === activeFileId) ?? null;
//     },

//     openFile: (fileId, projectId, fileName, content = "", filePath = []) => {
//         // Already open → just activate it
//         const existing = get().tabs.find(t => t.fileId === fileId && t.projectId === projectId);
//         if (!existing) {
//             set(s => ({
//                 tabs: [
//                     ...s.tabs,
//                     { fileId, projectId, fileName, filePath, isDirty: false, content, savedContent: content },
//                 ],
//                 activeFileId: fileId,
//             }));
//         } else {
//             set({ activeFileId: fileId });
//         }
//     },

//     closeTab: (fileId) => {
//         const { tabs, activeFileId } = get();
//         const idx = tabs.findIndex(t => t.fileId === fileId);
//         const remaining = tabs.filter(t => t.fileId !== fileId);
//         const newActive =
//             activeFileId === fileId
//                 ? (remaining[Math.max(0, idx - 1)]?.fileId ?? null)
//                 : activeFileId;
//         set({ tabs: remaining, activeFileId: newActive });
//     },

//     setActiveFile: (fileId) => set({ activeFileId: fileId }),

//     updateContent: (fileId, content) => {
//         set(s => ({
//             tabs: s.tabs.map(t =>
//                 t.fileId === fileId
//                     ? { ...t, content, isDirty: content !== t.savedContent }
//                     : t
//             ),
//         }));
//     },

//     markSaved: (fileId, savedContent) => {
//         set(s => ({
//             tabs: s.tabs.map(t =>
//                 t.fileId === fileId
//                     ? { ...t, savedContent, content: savedContent, isDirty: false }
//                     : t
//             ),
//         }));
//     },

//     updateFilePath: (fileId, filePath) => {
//         set(s => ({
//             tabs: s.tabs.map(t => t.fileId === fileId ? { ...t, filePath } : t),
//         }));
//     },

//     resetProject: (projectId) => {
//         const { tabs, activeFileId } = get();
//         const remaining = tabs.filter(t => t.projectId !== projectId);
//         const newActive = remaining.find(t => t.fileId === activeFileId)
//             ? activeFileId
//             : (remaining[0]?.fileId ?? null);
//         set({ tabs: remaining, activeFileId: newActive });
//     },

//     reset: () => set({ tabs: [], activeFileId: null }),
// }));


// src/store/editor-store.ts — migrated to disk-based paths

import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";
import { EditorView } from "@codemirror/view";

export interface OpenTab {
    relativePath: string;           // "src/components/Button.tsx" — primary key
    projectId: Id<"projects">;
    fileName: string;           // last segment "Button.tsx"
    isDirty: boolean;
    content: string;
    savedContent: string;
}

interface EditorState {
    view: EditorView | null;
    setView: (view: EditorView | null) => void;

    tabs: OpenTab[];
    activeFilePath: string | null;   // relativePath of active tab

    activeTab: () => OpenTab | null;

    openFile: (
        relativePath: string,
        projectId: Id<"projects">,
        fileName: string,
        content?: string,
    ) => void;

    closeTab: (relativePath: string) => void;
    setActiveFile: (relativePath: string) => void;
    updateContent: (relativePath: string, content: string) => void;
    markSaved: (relativePath: string, savedContent: string) => void;
    resetProject: (projectId: Id<"projects">) => void;
    reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
    tabs: [],
    activeFilePath: null,
    view: null,

    setView: (view) => set({ view }),

    activeTab: () => {
        const { tabs, activeFilePath } = get();
        return tabs.find(t => t.relativePath === activeFilePath) ?? null;
    },

    openFile: (relativePath, projectId, fileName, content = "") => {
        const existing = get().tabs.find(
            t => t.relativePath === relativePath && t.projectId === projectId
        );
        if (!existing) {
            set(s => ({
                tabs: [
                    ...s.tabs,
                    {
                        relativePath,
                        projectId,
                        fileName,
                        isDirty: false,
                        content,
                        savedContent: content,
                    },
                ],
                activeFilePath: relativePath,
            }));
        } else {
            set({ activeFilePath: relativePath });
        }
    },

    closeTab: (relativePath) => {
        const { tabs, activeFilePath } = get();
        const idx = tabs.findIndex(t => t.relativePath === relativePath);
        const remaining = tabs.filter(t => t.relativePath !== relativePath);
        const newActive = activeFilePath === relativePath
            ? (remaining[Math.max(0, idx - 1)]?.relativePath ?? null)
            : activeFilePath;
        set({ tabs: remaining, activeFilePath: newActive });
    },

    setActiveFile: (relativePath) => set({ activeFilePath: relativePath }),

    updateContent: (relativePath, content) => {
        set(s => ({
            tabs: s.tabs.map(t =>
                t.relativePath === relativePath
                    ? { ...t, content, isDirty: content !== t.savedContent }
                    : t
            ),
        }));
    },

    markSaved: (relativePath, savedContent) => {
        set(s => ({
            tabs: s.tabs.map(t =>
                t.relativePath === relativePath
                    ? { ...t, savedContent, content: savedContent, isDirty: false }
                    : t
            ),
        }));
    },

    resetProject: (projectId) => {
        const { tabs, activeFilePath } = get();
        const remaining = tabs.filter(t => t.projectId !== projectId);
        const newActive = remaining.find(t => t.relativePath === activeFilePath)
            ? activeFilePath
            : (remaining[0]?.relativePath ?? null);
        set({ tabs: remaining, activeFilePath: newActive });
    },

    reset: () => set({ tabs: [], activeFilePath: null }),
}));