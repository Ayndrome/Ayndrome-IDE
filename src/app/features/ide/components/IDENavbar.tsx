'use client';

import { cn } from "@/lib/utils";
import { Project } from "@/src/types/types";
import { Poppins } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { UserButton } from "@clerk/nextjs";
import {
    PlayIcon, SquareIcon, Settings2Icon, GitBranchIcon,
    Share2Icon, ChevronLeft, ZapIcon, WifiIcon, TerminalIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useIDEStore } from "@/src/store/ide-store";

const font = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const viewTabs = [
    { id: "code", label: "Code" },
    { id: "split", label: "Split" },
    { id: "preview", label: "Preview" },
] as const;

interface IDENavbarProps {
    project: Project;  // only for name display; rest from store
}

export const IDENavbar = ({ project }: IDENavbarProps) => {
    const router = useRouter();
    const { viewMode, setViewMode, isRunning, handleRun, handleStop, toggleTerminal, bottomPanel } = useIDEStore();

    return (
        <header
            className={cn(font.className, "h-11 shrink-0 flex items-center gap-2 px-3")}
            style={{ backgroundColor: '#161b22', borderBottom: '1px solid #30363d' }}
        >
            {/* Back */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={() => router.push("/")}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: '#8b949e' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.backgroundColor = '#21262d'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Back to projects</TooltipContent>
            </Tooltip>

            <div className="w-px h-4" style={{ backgroundColor: '#30363d' }} />

            {/* Project name + branch */}
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-semibold truncate max-w-36" style={{ color: '#e6edf3' }}>{project.name}</span>
                <button
                    className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: '#8b949e' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.backgroundColor = '#21262d'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <GitBranchIcon className="size-3" />
                    <span>main</span>
                </button>
            </div>

            <div className="w-px h-4" style={{ backgroundColor: '#30363d' }} />

            {/* Status indicator */}
            <div className="flex items-center gap-1.5">
                {isRunning ? (
                    <Badge variant="outline" className="h-5 gap-1 text-[10px] border-green-500/40 text-green-400 bg-green-500/10 px-1.5">
                        <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
                        Running
                    </Badge>
                ) : (
                    <Badge variant="outline" className="h-5 gap-1 text-[10px] px-1.5" style={{ borderColor: '#30363d', color: '#8b949e' }}>
                        <WifiIcon className="size-2.5" />
                        Idle
                    </Badge>
                )}
            </div>

            {/* Center — View mode tabs */}
            <div className="flex-1 flex items-center justify-center">
                <div
                    className="flex items-center gap-0.5 rounded-lg p-0.5"
                    style={{ backgroundColor: '#21262d' }}
                >
                    {viewTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setViewMode(tab.id)}
                            className="px-3 py-1 text-xs font-medium rounded-md transition-all duration-150"
                            style={{
                                backgroundColor: viewMode === tab.id ? '#0d1117' : 'transparent',
                                color: viewMode === tab.id ? '#e6edf3' : '#8b949e',
                                boxShadow: viewMode === tab.id ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Right — actions */}
            <div className="flex items-center gap-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7" style={{ color: '#8b949e' }}>
                            <Share2Icon className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Share project</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7" style={{ color: '#8b949e' }}>
                            <Settings2Icon className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Project settings</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={toggleTerminal}
                            style={{
                                color: bottomPanel === "terminal" ? "#58a6ff" : "#8b949e",
                                backgroundColor: bottomPanel === "terminal" ? "#1f3a5f" : "transparent",
                            }}
                        >
                            <TerminalIcon className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {bottomPanel === "terminal" ? "Hide terminal" : "Show terminal"}
                    </TooltipContent>
                </Tooltip>

                <div className="w-px h-4" style={{ backgroundColor: '#30363d' }} />

                {/* Run / Stop */}
                {isRunning ? (
                    <Button size="sm" variant="destructive" className="h-7 px-3 gap-1.5 text-xs" onClick={handleStop}>
                        <SquareIcon className="size-2.5 fill-current" />
                        Stop
                    </Button>
                ) : (
                    <Button size="sm" className="h-7 px-3 gap-1.5 text-xs bg-green-600 hover:bg-green-500 text-white" onClick={handleRun}>
                        <PlayIcon className="size-2.5 fill-current" />
                        Run
                    </Button>
                )}

                <div className="w-px h-4" style={{ backgroundColor: '#30363d' }} />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-7 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10">
                            <ZapIcon className="size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">AI Assistant</TooltipContent>
                </Tooltip>

                <UserButton afterSignOutUrl="/" />
            </div>
        </header>
    );
};
