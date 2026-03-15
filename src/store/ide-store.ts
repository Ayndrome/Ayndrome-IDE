import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";

type ViewMode = "code" | "preview" | "split";

interface IDEState {
    // ── Project context ─────────────────────────────────────
    projectId: Id<"projects"> | null;
    projectName: string;

    // ── Layout ──────────────────────────────────────────────
    viewMode: ViewMode;

    // ── Run state ───────────────────────────────────────────
    isRunning: boolean;

    // ── Actions ─────────────────────────────────────────────
    setProject: (id: Id<"projects">, name: string) => void;
    setViewMode: (mode: ViewMode) => void;
    setRunning: (running: boolean) => void;
    handleRun: () => void;
    handleStop: () => void;
    reset: () => void;
}

export const useIDEStore = create<IDEState>((set) => ({
    projectId: null,
    projectName: "",
    viewMode: "code",
    isRunning: false,

    setProject: (id, name) => set({ projectId: id, projectName: name }),
    setViewMode: (viewMode) => set({ viewMode }),
    setRunning: (isRunning) => set({ isRunning }),
    handleRun: () => set({ isRunning: true }),
    handleStop: () => set({ isRunning: false }),
    reset: () => set({ projectId: null, projectName: "", viewMode: "split", isRunning: false }),
}));
