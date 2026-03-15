'use client';

import { cn } from "@/lib/utils";
import { Poppins } from "next/font/google";
import { Button } from "@/components/ui/button";
import { FaGithub } from "react-icons/fa";
import {
    SparklesIcon,
    TerminalIcon,
    KeyboardIcon,
    Boxes,
    Zap,
    GitPullRequest,
    BookOpen,
    Settings,
    Search,
    SendHorizonal,
    ArrowRight,
} from "lucide-react";
import { ProjectList } from "./ProjectList";
import { NewProjectModal } from "./NewProjectModal";
import { ImportGithubModal } from "./ImportGithubModal";
import { useProjectsPartial } from "../hooks/use-project";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useState, useRef, useCallback } from "react";

const font = Poppins({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const features = [
    { icon: <Zap className="size-4 text-yellow-400" />, title: "AI Code Completion", desc: "Context-aware suggestions powered by LLMs" },
    { icon: <Boxes className="size-4 text-blue-400" />, title: "Live Collaboration", desc: "Real-time multiplayer editing with presence" },
    { icon: <TerminalIcon className="size-4 text-green-400" />, title: "Integrated Terminal", desc: "Full shell access directly in the browser" },
    { icon: <GitPullRequest className="size-4 text-purple-400" />, title: "Git Integration", desc: "Commit, branch, and PR from the IDE" },
];

// Both Mac (⌘) and Windows/Linux (Ctrl) are shown
const shortcuts = [
    { macKeys: ["⌘", "K"], winKeys: ["Ctrl", "K"], action: "New Project" },
    { macKeys: ["⌘", "I"], winKeys: ["Ctrl", "I"], action: "Import from GitHub" },
    { macKeys: ["⌘", "P"], winKeys: ["Ctrl", "P"], action: "Quick Open File" },
    { macKeys: ["⌘", "`"], winKeys: ["Ctrl", "`"], action: "Toggle Terminal" },
    { macKeys: ["⌘", "⇧", "P"], winKeys: ["Ctrl", "⇧", "P"], action: "Command Palette" },
];

const prompts = [
    "Build a REST API with authentication…",
    "Create a React dashboard with charts…",
    "Set up a Next.js e-commerce store…",
    "Design a real-time chat application…",
    "Write a Python data pipeline…",
];

export const ProjectViewContainer = () => {
    const projects = useProjectsPartial(5);
    const [searchQuery, setSearchQuery] = useState("");
    const [newProjectOpen, setNewProjectOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [promptIdx, setPromptIdx] = useState(0);
    const promptRef = useRef<HTMLInputElement>(null);

    // Filtered projects (client-side search on name)
    const filteredProjects = projects?.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openNewProject = useCallback(() => setNewProjectOpen(true), []);
    const openImport = useCallback(() => setImportOpen(true), []);

    // Keyboard shortcuts — ⌘/Ctrl+K → New Project, ⌘/Ctrl+I → Import
    useKeyboardShortcuts([
        { key: "k", meta: true, handler: openNewProject },
        { key: "i", meta: true, handler: openImport },
    ]);

    // Handle AI prompt submit → prefill New Project modal
    const handlePromptSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiPrompt.trim()) return;
        setNewProjectOpen(true);
    };

    // Cycle placeholder text for the prompt
    const placeholder = prompts[promptIdx % prompts.length];

    return (
        <>
            {/* ── Modals ── */}
            <NewProjectModal
                open={newProjectOpen}
                onClose={() => setNewProjectOpen(false)}
                initialPrompt={aiPrompt}
            />
            <ImportGithubModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
            />

            <div className={cn(font.className, "min-h-screen bg-background text-foreground flex flex-col")}>

                {/* ── Top bar ─────────────────────────────────────────── */}
                <div className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5 group/logo cursor-default">
                        <div className="size-6 rounded-md flex items-center justify-center group-hover/logo:scale-105 transition-transform">
                            <img src="/vercel.svg" alt="" className="size-4" />
                        </div>
                        <span className="text-base font-semibold tracking-tight">Ayndrome</span>
                        <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-medium">IDE</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            title="Documentation"
                            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
                        >
                            <BookOpen className="size-4" />
                        </button>
                        <button
                            title="Settings"
                            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
                        >
                            <Settings className="size-4" />
                        </button>
                    </div>
                </div>

                {/* ── Main layout ─────────────────────────────────────── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ── Left sidebar ── */}
                    <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-sidebar">

                        {/* Search */}
                        <div className="px-4 pt-5 pb-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search projects…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={cn(
                                        "w-full pl-8 pr-3 py-2 text-sm rounded-md",
                                        "bg-muted/60 border border-border",
                                        "placeholder:text-muted-foreground/70",
                                        "focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30",
                                        "transition-all duration-150"
                                    )}
                                />
                            </div>
                        </div>

                        {/* Quick actions */}
                        <div className="px-4 pb-4 flex flex-col gap-2">
                            <Button
                                variant="default"
                                className="w-full justify-start gap-2 h-9 text-sm font-medium"
                                onClick={openNewProject}
                                title="New Project (⌘K / Ctrl+K)"
                            >
                                <SparklesIcon className="size-3.5" />
                                New Project
                                <kbd className="ml-auto text-[10px] opacity-60 font-mono">⌘K</kbd>
                            </Button>

                            <Button
                                variant="outline"
                                className="w-full justify-start gap-2 h-9 text-sm"
                                onClick={openImport}
                                title="Import from GitHub (⌘I / Ctrl+I)"
                            >
                                <FaGithub className="size-3.5" />
                                Import from GitHub
                                <kbd className="ml-auto text-[10px] opacity-60 font-mono">⌘I</kbd>
                            </Button>
                        </div>

                        <div className="h-px bg-border mx-4 mb-4" />

                        {/* Project list */}
                        <div className="flex-1 overflow-y-auto px-4 pb-4">
                            <ProjectList
                                projects={filteredProjects ?? null}
                                onViewAllProjects={() => console.log("View all")}
                            />
                        </div>
                    </aside>

                    {/* ── Right panel ── */}
                    <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-10 py-12 gap-10">

                        {/* Hero */}
                        <div className="flex flex-col items-center text-center gap-3 max-w-xl w-full">
                            <div className={cn(
                                "size-14 rounded-2xl flex items-center justify-center mb-1",
                                "shadow-[0_0_40px_-8px] shadow-primary/50"
                            )}>
                                <img src="/vercel.svg" alt="" className="size-7" />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight">
                                Welcome to <span className="text-primary">Ayndrome IDE</span>
                            </h1>
                            <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                                A blazing-fast, AI-powered web IDE for modern development.
                                Create, collaborate, and ship — right from your browser.
                            </p>

                            {/* ── AI Prompt Bar (Lovable/Replit style) ── */}
                            <form
                                onSubmit={handlePromptSubmit}
                                className="w-full mt-2 max-w-lg"
                            >
                                <div className={cn(
                                    "relative flex items-center",
                                    "rounded-2xl border border-border bg-card",
                                    "shadow-[0_4px_24px_-4px] shadow-black/30",
                                    "focus-within:border-primary/60 focus-within:shadow-[0_4px_32px_-4px] focus-within:shadow-primary/20",
                                    "transition-all duration-300"
                                )}>
                                    <SparklesIcon className="absolute left-4 size-4 text-muted-foreground/70 shrink-0" />
                                    <input
                                        ref={promptRef}
                                        type="text"
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        placeholder={placeholder}
                                        className={cn(
                                            "flex-1 bg-transparent pl-11 pr-14 py-4 text-sm",
                                            "placeholder:text-muted-foreground/50",
                                            "focus:outline-none"
                                        )}
                                        onFocus={() => setPromptIdx((i) => i + 1)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!aiPrompt.trim()}
                                        className={cn(
                                            "absolute right-3 size-8 rounded-xl flex items-center justify-center",
                                            "transition-all duration-200",
                                            aiPrompt.trim()
                                                ? "bg-primary text-primary-foreground shadow-md hover:opacity-90 active:scale-95"
                                                : "bg-muted text-muted-foreground cursor-not-allowed"
                                        )}
                                    >
                                        <SendHorizonal className="size-3.5" />
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground/60 text-center">
                                    Describe what you want to build and Ayndrome will set it up for you
                                </p>
                            </form>

                            {/* Quick-start prompts */}
                            <div className="flex flex-wrap gap-2 justify-center mt-1">
                                {["Next.js app", "REST API", "React dashboard", "Python script"].map((tag) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => { setAiPrompt(`Build a ${tag}`); promptRef.current?.focus(); }}
                                        className={cn(
                                            "text-xs px-3 py-1.5 rounded-full border border-border",
                                            "bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                                            "flex items-center gap-1.5 transition-all duration-150"
                                        )}
                                    >
                                        <ArrowRight className="size-3 opacity-60" />
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Feature grid */}
                        <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                            {features.map((f) => (
                                <div
                                    key={f.title}
                                    className={cn(
                                        "p-4 rounded-xl border border-border bg-card",
                                        "hover:border-primary/40 hover:bg-muted/30",
                                        "transition-all duration-200 cursor-default group"
                                    )}
                                >
                                    <div className="size-8 rounded-lg bg-muted flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        {f.icon}
                                    </div>
                                    <p className="text-sm font-semibold">{f.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Keyboard shortcuts */}
                        <div className="w-full max-w-lg border border-border rounded-xl bg-card overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                                <KeyboardIcon className="size-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Keyboard Shortcuts</span>
                                <span className="ml-auto text-[10px] text-muted-foreground/60">Mac / Windows</span>
                            </div>
                            <div className="divide-y divide-border">
                                {shortcuts.map((s) => (
                                    <div key={s.action} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                        <span className="text-sm text-muted-foreground">{s.action}</span>
                                        <div className="flex items-center gap-3">
                                            {/* Mac */}
                                            <div className="flex items-center gap-1">
                                                {s.macKeys.map((k) => (
                                                    <kbd key={k} className="min-w-6 text-center px-1.5 py-0.5 text-[10px] rounded border border-border bg-muted font-mono">
                                                        {k}
                                                    </kbd>
                                                ))}
                                            </div>
                                            <span className="text-muted-foreground/30 text-xs">/</span>
                                            {/* Win */}
                                            <div className="flex items-center gap-1">
                                                {s.winKeys.map((k) => (
                                                    <kbd key={k} className="min-w-6 text-center px-1.5 py-0.5 text-[10px] rounded border border-border bg-muted font-mono">
                                                        {k}
                                                    </kbd>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};