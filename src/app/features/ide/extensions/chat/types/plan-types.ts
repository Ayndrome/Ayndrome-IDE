// src/app/features/ide/extensions/chat/types/plan-types.ts
// Task decomposition types — the plan is a first-class message in the thread.
// Stored in Convex like any other message so it survives refresh.

export type StepStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

export type PlanStep = {
    id: string;      // stable UUID for this step
    index: number;      // 1-based display number
    title: string;      // short — "Create auth middleware"
    description: string;      // one sentence of what this step does
    status: StepStatus;

    // Runtime fields (populated as step executes)
    startedAt?: number;    // Date.now() when started
    completedAt?: number;    // Date.now() when done/failed
    activeTool?: string;    // current tool name if in_progress
    reasoning?: string;    // agent's reasoning for this step (collapsible)
    errorMessage?: string;    // if failed
};

export type AgentPlan = {
    role: "plan";
    id: string;       // plan message id
    threadId: string;
    title: string;       // overall task title e.g. "Build login system"
    steps: PlanStep[];
    mode: "plan";       // always plan — quick mode has no plan message
    createdAt: number;
    updatedAt: number;

    // Overall plan state
    status: "planning" | "executing" | "completed" | "failed" | "aborted";
    currentStepIndex: number;   // 0-based
};