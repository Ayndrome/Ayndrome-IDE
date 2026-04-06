// src/app/features/ide/extensions/chat/components/PlanBubble.tsx
// Renders the agent's execution plan as an inline chat message.
// Updates live as the agent executes each step.
// Each step shows: status icon, title, tool running, time taken, reasoning.

'use client';

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentPlan, PlanStep, StepStatus } from "./types/plan-types";
import {
    CheckIcon, XIcon, CircleDotIcon, ClockIcon,
    ChevronDownIcon, ChevronRightIcon, ZapIcon,
    ListChecksIcon, Loader2Icon,
} from "lucide-react";

// ── Status icon ───────────────────────────────────────────────────────────────

const StatusIcon: React.FC<{ status: StepStatus; isActive: boolean }> = ({
    status, isActive,
}) => {
    if (status === "done") {
        return (
            <span className="flex items-center justify-center size-5 rounded-full bg-green-500/20">
                <CheckIcon size={11} className="text-green-400" />
            </span>
        );
    }
    if (status === "failed") {
        return (
            <span className="flex items-center justify-center size-5 rounded-full bg-red-500/20">
                <XIcon size={11} className="text-red-400" />
            </span>
        );
    }
    if (status === "in_progress") {
        return (
            <span className="flex items-center justify-center size-5 rounded-full bg-blue-500/20">
                <Loader2Icon size={11} className="text-blue-400 animate-spin" />
            </span>
        );
    }
    if (status === "skipped") {
        return (
            <span className="flex items-center justify-center size-5 rounded-full"
                style={{ backgroundColor: "#21262d" }}>
                <span className="size-1.5 rounded-full bg-[#6e7681]" />
            </span>
        );
    }
    // pending
    return (
        <span className="flex items-center justify-center size-5 rounded-full"
            style={{ backgroundColor: "#21262d" }}>
            <span className="size-1.5 rounded-full bg-[#6e7681]" />
        </span>
    );
};

// ── Time display ──────────────────────────────────────────────────────────────

function formatDuration(startedAt?: number, completedAt?: number): string | null {
    if (!startedAt) return null;
    const end = completedAt ?? Date.now();
    const ms = end - startedAt;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── Single step row ───────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: PlanStep; isLast: boolean }> = ({
    step, isLast,
}) => {
    const [expanded, setExpanded] = useState(false);
    const duration = formatDuration(step.startedAt, step.completedAt);
    const hasReasoning = !!step.reasoning;
    const isActive = step.status === "in_progress";

    return (
        <div className="flex gap-2.5">
            {/* Connector line */}
            <div className="flex flex-col items-center shrink-0">
                <StatusIcon status={step.status} isActive={isActive} />
                {!isLast && (
                    <div
                        className="w-px flex-1 mt-1"
                        style={{
                            backgroundColor: step.status === "done"
                                ? "#238636"
                                : "#30363d",
                            minHeight: "16px",
                        }}
                    />
                )}
            </div>

            {/* Content */}
            <div className={cn(
                "flex-1 pb-3 min-w-0",
                isLast && "pb-0",
            )}>
                {/* Title row */}
                <div className="flex items-center gap-2 min-w-0">
                    <span
                        className={cn(
                            "text-xs font-medium truncate",
                            step.status === "done" && "text-[#3fb950]",
                            step.status === "failed" && "text-[#ff7b72]",
                            step.status === "in_progress" && "text-[#79c0ff]",
                            step.status === "pending" && "text-[#8b949e]",
                            step.status === "skipped" && "text-[#6e7681] line-through",
                        )}
                    >
                        {step.index}. {step.title}
                    </span>

                    {/* Active tool badge */}
                    {isActive && step.activeTool && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0"
                            style={{
                                backgroundColor: "#1f3a5f",
                                color: "#58a6ff",
                                border: "1px solid #1f4280",
                            }}
                        >
                            {step.activeTool}
                        </span>
                    )}

                    {/* Duration */}
                    {duration && step.status !== "pending" && (
                        <span className="flex items-center gap-0.5 text-[10px] shrink-0"
                            style={{ color: "#6e7681" }}>
                            <ClockIcon size={9} />
                            {duration}
                        </span>
                    )}

                    {/* Reasoning toggle */}
                    {hasReasoning && (
                        <button
                            onClick={() => setExpanded(v => !v)}
                            className="shrink-0 flex items-center gap-0.5 text-[10px]"
                            style={{ color: "#6e7681" }}
                        >
                            {expanded
                                ? <ChevronDownIcon size={10} />
                                : <ChevronRightIcon size={10} />
                            }
                            reasoning
                        </button>
                    )}
                </div>

                {/* Description */}
                <p className="text-[11px] mt-0.5" style={{ color: "#6e7681" }}>
                    {step.description}
                </p>

                {/* Error message */}
                {step.status === "failed" && step.errorMessage && (
                    <p className="text-[11px] mt-1 px-2 py-1 rounded"
                        style={{
                            backgroundColor: "#2d0e0e",
                            color: "#ff7b72",
                            border: "1px solid #4a1515",
                        }}>
                        {step.errorMessage}
                    </p>
                )}

                {/* Reasoning block */}
                {expanded && step.reasoning && (
                    <p
                        className="text-[11px] mt-1.5 px-2 py-1.5 rounded italic"
                        style={{
                            backgroundColor: "#161b22",
                            color: "#8b949e",
                            border: "1px solid #30363d",
                        }}
                    >
                        {step.reasoning}
                    </p>
                )}
            </div>
        </div>
    );
};

// ── Plan header status ────────────────────────────────────────────────────────

const PlanStatusBadge: React.FC<{ status: AgentPlan["status"] }> = ({ status }) => {
    const configs = {
        planning: { label: "Planning…", color: "#d29922", bg: "#2d2000" },
        executing: { label: "Executing", color: "#58a6ff", bg: "#0d2840" },
        completed: { label: "Completed", color: "#3fb950", bg: "#0d2818" },
        failed: { label: "Failed", color: "#ff7b72", bg: "#2d0e0e" },
        aborted: { label: "Aborted", color: "#6e7681", bg: "#21262d" },
    };
    const cfg = configs[status];
    return (
        <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ color: cfg.color, backgroundColor: cfg.bg }}
        >
            {cfg.label}
        </span>
    );
};

// ── Progress bar ──────────────────────────────────────────────────────────────

const PlanProgress: React.FC<{ steps: PlanStep[] }> = ({ steps }) => {
    const done = steps.filter(s => s.status === "done").length;
    const total = steps.length;
    const pct = total > 0 ? (done / total) * 100 : 0;

    return (
        <div className="flex items-center gap-2">
            <div
                className="flex-1 h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: "#21262d" }}
            >
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? "#3fb950" : "#388bfd",
                    }}
                />
            </div>
            <span className="text-[10px] shrink-0" style={{ color: "#6e7681" }}>
                {done}/{total}
            </span>
        </div>
    );
};

// ── Main PlanBubble ───────────────────────────────────────────────────────────

interface PlanBubbleProps {
    plan: AgentPlan;
}

export const PlanBubble: React.FC<PlanBubbleProps> = ({ plan }) => {
    const [collapsed, setCollapsed] = useState(false);

    const doneCount = plan.steps.filter(s => s.status === "done").length;
    const failedCount = plan.steps.filter(s => s.status === "failed").length;
    const activeStep = plan.steps.find(s => s.status === "in_progress");

    return (
        <div
            className="rounded-lg overflow-hidden w-full"
            style={{
                backgroundColor: "#0d1117",
                border: "1px solid #30363d",
            }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                style={{ borderBottom: collapsed ? "none" : "1px solid #21262d" }}
                onClick={() => setCollapsed(v => !v)}
            >
                <ListChecksIcon size={14} style={{ color: "#8b949e" }} className="shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className="text-xs font-medium truncate"
                            style={{ color: "#e6edf3" }}
                        >
                            {plan.title}
                        </span>
                        <PlanStatusBadge status={plan.status} />
                    </div>

                    {/* Active step summary when collapsed */}
                    {collapsed && activeStep && (
                        <p className="text-[11px] truncate mt-0.5" style={{ color: "#6e7681" }}>
                            Step {activeStep.index}: {activeStep.title}
                        </p>
                    )}
                </div>

                {/* Collapse toggle */}
                <button className="shrink-0" style={{ color: "#6e7681" }}>
                    {collapsed
                        ? <ChevronRightIcon size={13} />
                        : <ChevronDownIcon size={13} />
                    }
                </button>
            </div>

            {/* Progress bar */}
            {!collapsed && (
                <div className="px-3 pt-2 pb-1">
                    <PlanProgress steps={plan.steps} />
                </div>
            )}

            {/* Steps */}
            {!collapsed && (
                <div className="px-3 pt-2 pb-3">
                    {plan.steps.map((step, i) => (
                        <StepRow
                            key={step.id}
                            step={step}
                            isLast={i === plan.steps.length - 1}
                        />
                    ))}
                </div>
            )}

            {/* Footer summary */}
            {!collapsed && plan.status !== "executing" && plan.status !== "planning" && (
                <div
                    className="flex items-center gap-3 px-3 py-2 text-[11px]"
                    style={{
                        borderTop: "1px solid #21262d",
                        color: "#6e7681",
                    }}
                >
                    {doneCount > 0 && (
                        <span className="flex items-center gap-1 text-[#3fb950]">
                            <CheckIcon size={10} />
                            {doneCount} completed
                        </span>
                    )}
                    {failedCount > 0 && (
                        <span className="flex items-center gap-1 text-[#ff7b72]">
                            <XIcon size={10} />
                            {failedCount} failed
                        </span>
                    )}
                    <span className="ml-auto">
                        {formatDuration(plan.createdAt, plan.updatedAt)}
                    </span>
                </div>
            )}
        </div>
    );
};