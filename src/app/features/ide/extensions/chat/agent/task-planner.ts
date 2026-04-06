// src/app/features/ide/extensions/chat/agent/task-planner.ts
// Generates a structured execution plan before the agent starts tool calls.
// Two modes:
//   plan mode  → calls Claude once to generate a step-by-step plan, then executes
//   quick mode → skips planning, executes directly (existing behavior)
//
// The plan is a structured JSON object that becomes a special "plan" message
// in the chat thread. Each step's status updates live as the agent executes.

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { PlanStep, AgentPlan } from "../types/plan-types";
import type { WorkspaceSnapshot } from "./workspace-context";
import { getModelInstance } from "@/src/lib/model-provider/model-router";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";

// ── Config ────────────────────────────────────────────────────────────────────

const PLANNING_MODEL = "claude-haiku-4-5-20251001";  // fast + cheap for planning
const MAX_PLAN_STEPS = 12;
const MIN_STEPS_TO_PLAN = 2;   // tasks needing < 2 steps skip planning

// ── Complexity classifier ─────────────────────────────────────────────────────
// Decides if a task needs a plan or can be executed directly.
// Errs on the side of planning for ambiguous cases.

export function classifyTaskComplexity(
    userMessage: string,
): "simple" | "complex" {
    const msg = userMessage.toLowerCase();

    // Single-operation signals → simple
    const simplePatterns = [
        /^(read|show|open|display|what('s| is) in|print|cat)\b/,
        /^(fix|correct) (this|the) (error|bug|typo|issue)/,
        /^(rename|delete|remove) (the |this )?(file|folder)/,
        /^(add|insert) (a )?comment/,
        /^(run|execute) /,
        /^what (does|is|are)\b/,
        /^(show|list) (me )?(the |all )?(files|folders|contents)/,
    ];

    if (simplePatterns.some(p => p.test(msg))) return "simple";

    // Multi-step signals → complex
    const complexPatterns = [
        /\b(build|create|implement|add|set up|configure|integrate)\b/,
        /\b(refactor|migrate|convert|update all|replace all)\b/,
        /\b(feature|system|module|component|service|api|endpoint)\b/,
        /\b(and (then|also)|first.*then|step by step|multiple)\b/,
        /\b(authentication|authorization|database|testing|deployment)\b/,
    ];

    const complexScore = complexPatterns.filter(p => p.test(msg)).length;
    if (complexScore >= 2) return "complex";
    if (msg.split(" ").length > 20) return "complex";

    return "simple";
}

// ── Plan generation ───────────────────────────────────────────────────────────

export async function generatePlan(
    userMessage: string,
    workspaceSnapshot: WorkspaceSnapshot | null,
    signal?: AbortSignal,
): Promise<AgentPlan | null> {
    const contextSummary = workspaceSnapshot
        ? `Project: ${workspaceSnapshot.workspaceName}\n` +
        `Active file: ${workspaceSnapshot.activeFilePath ?? "none"}\n` +
        `Branch: ${workspaceSnapshot.gitBranch ?? "unknown"}`
        : "No workspace context available.";

    const prompt = `You are a planning assistant for a coding agent.
Given the user's request and workspace context, create a concise execution plan.

Workspace context:
${contextSummary}

User request: "${userMessage}"

Respond with ONLY a valid JSON object matching this exact structure:
{
  "title": "short overall task title (max 8 words)",
  "steps": [
    {
      "title": "short step title (max 6 words)",
      "description": "one sentence describing exactly what this step does"
    }
  ]
}

Rules:
- Maximum ${MAX_PLAN_STEPS} steps
- Each step must be atomic — one clear action
- Steps must be in dependency order
- No step should say "verify" or "test" unless the task explicitly requires testing
- Merge steps that would take < 30 seconds into the previous step
- If the task needs only 1 step, return 1 step (don't pad)
- Titles use imperative verbs: "Create", "Update", "Add", "Configure"
- Never include steps for things the agent can't do (UI interaction, browser preview)
- Respond ONLY with the JSON — no preamble, no explanation, no markdown fences`;

    try {
        const providerStore = useProviderStore.getState();
        const globalModel = providerStore.globalModel;
        const credentials = providerStore.credentials[globalModel.provider] ?? {};

        // Use the configured provider but pick the fastest/cheapest model for planning
        const planningModelId = getFastModelForProvider(globalModel.provider);

        const modelInstance = await getModelInstance(
            { provider: globalModel.provider, modelId: planningModelId },
            credentials,
        );

        const result = await generateText({
            model: modelInstance,
            prompt,
            maxOutputTokens: 1000,
            temperature: 0.2,
            abortSignal: signal,
        });

        // Strip markdown fences if model added them despite instructions
        const raw = result.text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const parsed = JSON.parse(raw) as {
            title: string;
            steps: Array<{ title: string; description: string }>;
        };

        // Validate structure
        if (!parsed.title || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
            throw new Error("Invalid plan structure");
        }

        // Too simple — don't bother with a plan UI
        if (parsed.steps.length < MIN_STEPS_TO_PLAN) {
            return null;
        }

        const steps: PlanStep[] = parsed.steps
            .slice(0, MAX_PLAN_STEPS)
            .map((s, i) => ({
                id: crypto.randomUUID(),
                index: i + 1,
                title: s.title ?? `Step ${i + 1}`,
                description: s.description ?? "",
                status: "pending" as const,
            }));

        const plan: AgentPlan = {
            role: "plan",
            id: crypto.randomUUID(),
            threadId: "",   // set by caller
            title: parsed.title,
            steps,
            mode: "plan",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: "executing",
            currentStepIndex: 0,
        };

        console.log(
            `[TaskPlanner] Generated plan: "${plan.title}" ` +
            `(${steps.length} steps)`
        );

        return plan;

    } catch (err: any) {
        console.error("[TaskPlanner] Plan generation failed:", err.message);
        return null;   // fallback to quick mode on parse error
    }
}

// ── Step tracking helpers ─────────────────────────────────────────────────────
// These mutate the plan in place and return the updated plan.
// The store calls onUpdatePlan(plan) after each mutation.

export function markStepStarted(
    plan: AgentPlan,
    stepIndex: number,
    activeTool: string,
): AgentPlan {
    const steps = plan.steps.map((s, i) =>
        i === stepIndex
            ? {
                ...s,
                status: "in_progress" as const,
                startedAt: Date.now(),
                activeTool,
            }
            : s
    );
    return {
        ...plan,
        steps,
        currentStepIndex: stepIndex,
        updatedAt: Date.now(),
    };
}

export function markStepDone(
    plan: AgentPlan,
    stepIndex: number,
    reasoning?: string,
): AgentPlan {
    const steps = plan.steps.map((s, i) =>
        i === stepIndex
            ? {
                ...s,
                status: "done" as const,
                completedAt: Date.now(),
                activeTool: undefined,
                reasoning,
            }
            : s
    );

    // Advance to next pending step
    const nextIndex = steps.findIndex(
        (s, i) => i > stepIndex && s.status === "pending"
    );

    return {
        ...plan,
        steps,
        currentStepIndex: nextIndex >= 0 ? nextIndex : stepIndex,
        updatedAt: Date.now(),
    };
}

export function markStepFailed(
    plan: AgentPlan,
    stepIndex: number,
    errorMessage: string,
): AgentPlan {
    const steps = plan.steps.map((s, i) =>
        i === stepIndex
            ? {
                ...s,
                status: "failed" as const,
                completedAt: Date.now(),
                activeTool: undefined,
                errorMessage,
            }
            : s
    );
    return { ...plan, steps, updatedAt: Date.now() };
}

export function finalizePlan(
    plan: AgentPlan,
    status: "completed" | "failed" | "aborted",
): AgentPlan {
    return { ...plan, status, updatedAt: Date.now() };
}

// ── Step matcher ──────────────────────────────────────────────────────────────
// Heuristically matches an assistant message to a plan step.
// Used to advance the step tracker as the agent narrates its work.

export function matchMessageToStep(
    plan: AgentPlan,
    message: string,
): number | null {
    const msg = message.toLowerCase();

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (step.status !== "pending" && step.status !== "in_progress") continue;

        const stepKeywords = [
            ...step.title.toLowerCase().split(/\s+/),
            ...step.description.toLowerCase().split(/\s+/),
        ].filter(w => w.length > 4);

        const matchCount = stepKeywords.filter(kw => msg.includes(kw)).length;
        if (matchCount >= 2) return i;
    }

    // Default to current step
    const currentIdx = plan.currentStepIndex;
    if (plan.steps[currentIdx]?.status === "in_progress") return currentIdx;

    return null;
}


function getFastModelForProvider(provider: string): string {
    const fastModels: Record<string, string> = {
        anthropic: "claude-haiku-4-5-20251001",
        openai: "gpt-4.1-nano",
        gemini: "gemini-2.0-flash-lite",
        deepseek: "deepseek-chat",
        xai: "grok-2",
        groq: "llama-3.1-8b-instant",
        mistral: "ministral-3b-latest",
        openrouter: "mistralai/devstral-small:free",
        ollama: "llama3.1",
        lmstudio: "default",
        "openai-compatible": "default",
    };
    return fastModels[provider] ?? "default";
}