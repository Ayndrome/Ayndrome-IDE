// import { create } from "zustand";
// import { Id } from "@/convex/_generated/dataModel";

// type ViewMode = "code" | "preview" | "split";

// interface IDEState {
//     // ── Project context ─────────────────────────────────────
//     projectId: Id<"projects"> | null;
//     projectName: string;

//     // ── Layout ──────────────────────────────────────────────
//     viewMode: ViewMode;

//     // ── Run state ───────────────────────────────────────────
//     isRunning: boolean;

//     // ── Actions ─────────────────────────────────────────────
//     setProject: (id: Id<"projects">, name: string) => void;
//     setViewMode: (mode: ViewMode) => void;
//     setRunning: (running: boolean) => void;
//     handleRun: () => void;
//     handleStop: () => void;
//     reset: () => void;
// }

// export const useIDEStore = create<IDEState>((set) => ({
//     projectId: null,
//     projectName: "",
//     viewMode: "code",
//     isRunning: false,

//     setProject: (id, name) => set({ projectId: id, projectName: name }),
//     setViewMode: (viewMode) => set({ viewMode }),
//     setRunning: (isRunning) => set({ isRunning }),
//     handleRun: () => set({ isRunning: true }),
//     handleStop: () => set({ isRunning: false }),
//     reset: () => set({ projectId: null, projectName: "", viewMode: "split", isRunning: false }),
// }));


// src/store/ide-store.ts
// Added: bottomPanel state to toggle terminal/output/none

import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";

type ViewMode = "code" | "preview" | "split";
type BottomPanel = "terminal" | "output" | "none";

interface IDEState {
    // ── Project context ────────────────────────────────────────────────
    projectId: Id<"projects"> | null;
    projectName: string;
    workspaceId: string;   // ← added: Convex project _id cast to string

    // ── Layout ─────────────────────────────────────────────────────────
    viewMode: ViewMode;

    // ── Bottom panel (terminal) ────────────────────────────────────────
    bottomPanel: BottomPanel;
    bottomPanelHeight: number;       // px, user-resizable

    // ── Run state ──────────────────────────────────────────────────────
    isRunning: boolean;

    // ── Actions ────────────────────────────────────────────────────────
    setProject: (id: Id<"projects">, name: string) => void;
    setViewMode: (mode: ViewMode) => void;
    setBottomPanel: (panel: BottomPanel) => void;
    toggleTerminal: () => void;
    setBottomPanelHeight: (height: number) => void;
    setRunning: (running: boolean) => void;
    handleRun: () => void;
    handleStop: () => void;
    reset: () => void;
}

export const useIDEStore = create<IDEState>((set, get) => ({
    projectId: null,
    projectName: "",
    workspaceId: "",
    viewMode: "code",
    bottomPanel: "none",
    bottomPanelHeight: 240,
    isRunning: false,

    setProject: (id, name) => set({
        projectId: id,
        projectName: name,
        workspaceId: id as unknown as string,
    }),

    setViewMode: (viewMode) => set({ viewMode }),
    setBottomPanel: (bottomPanel) => set({ bottomPanel }),
    setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),

    toggleTerminal: () => {
        const { bottomPanel } = get();
        set({ bottomPanel: bottomPanel === "terminal" ? "none" : "terminal" });
    },

    setRunning: (isRunning) => set({ isRunning }),
    handleRun: () => set({ isRunning: true }),
    handleStop: () => set({ isRunning: false }),

    reset: () => set({
        projectId: null,
        projectName: "",
        workspaceId: "",
        viewMode: "code",
        bottomPanel: "none",
        bottomPanelHeight: 240,
        isRunning: false,
    }),
}));