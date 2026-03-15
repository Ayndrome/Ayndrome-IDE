'use client';

import { cn } from "@/lib/utils";
import { useState } from "react";
import {
    RefreshCwIcon,
    ExternalLinkIcon,
    SmartphoneIcon,
    MonitorIcon,
    TabletIcon,
    LockIcon,
    GlobeIcon,
    ZapIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIDEStore } from "@/src/store/ide-store";

// ── GitHub Dark VS Code colors ────────────────────────────────────────────────
const GH = {
    canvas: "#0d1117",   // editor / main area
    canvasSub: "#161b22",   // panels, toolbar bg
    canvasInset: "#010409",   // deepest bg
    border: "#30363d",
    fg: "#e6edf3",
    fgMuted: "#8b949e",
    fgSubtle: "#6e7681",
    accent: "#388bfd",
};

const viewports = [
    { id: "desktop", icon: <MonitorIcon className="size-3.5" />, label: "Desktop", width: "100%" },
    { id: "tablet", icon: <TabletIcon className="size-3.5" />, label: "Tablet", width: "768px" },
    { id: "mobile", icon: <SmartphoneIcon className="size-3.5" />, label: "Mobile", width: "390px" },
] as const;

export const PreviewPane = () => {
    const { isRunning, projectName } = useIDEStore();
    const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
    const [refreshKey, setRefreshKey] = useState(0);

    const previewUrl = isRunning ? "http://localhost:3000" : null;
    const frameWidth = viewports.find((v) => v.id === viewport)?.width ?? "100%";

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: GH.canvas }}>

            {/* ── Toolbar ── */}
            <div
                className="flex items-center gap-2 px-3 py-1.5 shrink-0"
                style={{ backgroundColor: GH.canvasSub, borderBottom: `1px solid ${GH.border}` }}
            >
                {/* URL bar */}
                <div
                    className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs min-w-0"
                    style={{
                        backgroundColor: GH.canvas,
                        border: `1px solid ${GH.border}`,
                        color: GH.fgMuted,
                    }}
                >
                    <LockIcon className="size-3 shrink-0 text-[#3fb950]" />
                    <span className="truncate font-mono">{previewUrl ?? "localhost:3000"}</span>
                </div>

                {/* Viewport switcher */}
                <div
                    className="flex items-center rounded-md overflow-hidden"
                    style={{ border: `1px solid ${GH.border}`, backgroundColor: GH.canvas }}
                >
                    {viewports.map((v) => (
                        <Tooltip key={v.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setViewport(v.id)}
                                    className="p-1.5 transition-colors"
                                    style={{
                                        backgroundColor: viewport === v.id ? '#21262d' : 'transparent',
                                        color: viewport === v.id ? GH.fg : GH.fgMuted,
                                        borderRight: v.id !== "mobile" ? `1px solid ${GH.border}` : undefined,
                                    }}
                                >
                                    {v.icon}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{v.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </div>

                <div className="w-px h-4" style={{ backgroundColor: GH.border }} />

                {/* Refresh */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => setRefreshKey((k) => k + 1)}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: GH.fgMuted }}
                            onMouseEnter={e => (e.currentTarget.style.color = GH.fg, e.currentTarget.style.backgroundColor = '#21262d')}
                            onMouseLeave={e => (e.currentTarget.style.color = GH.fgMuted, e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <RefreshCwIcon className="size-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Refresh preview</TooltipContent>
                </Tooltip>

                {/* Open in tab */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <a
                            href={previewUrl ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: GH.fgMuted }}
                            onMouseEnter={e => (e.currentTarget.style.color = GH.fg, e.currentTarget.style.backgroundColor = '#21262d')}
                            onMouseLeave={e => (e.currentTarget.style.color = GH.fgMuted, e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <ExternalLinkIcon className="size-3.5" />
                        </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Open in new tab</TooltipContent>
                </Tooltip>
            </div>

            {/* ── Preview area ── */}
            <div
                className="flex-1 overflow-auto flex items-start justify-center"
                style={{ backgroundColor: GH.canvasInset }}
            >
                <div
                    className="h-full transition-all duration-300"
                    style={{ width: frameWidth, minHeight: "100%", backgroundColor: GH.canvas }}
                >
                    {isRunning ? (
                        <iframe
                            key={refreshKey}
                            src={previewUrl ?? ""}
                            className="w-full h-full border-0"
                            title={`${projectName} preview`}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                        />
                    ) : (
                        /* ── Not running placeholder ── */
                        <div
                            className="flex flex-col items-center justify-center h-full gap-5"
                            style={{ backgroundColor: GH.canvas }}
                        >
                            <div
                                className="size-14 rounded-2xl flex items-center justify-center"
                                style={{ backgroundColor: '#21262d', border: `1px solid ${GH.border}` }}
                            >
                                <ZapIcon className="size-6" style={{ color: GH.accent }} />
                            </div>
                            <div className="flex flex-col items-center gap-2 text-center">
                                <p className="text-sm font-semibold" style={{ color: GH.fg }}>
                                    Preview not running
                                </p>
                                <p className="text-xs max-w-[200px]" style={{ color: GH.fgMuted }}>
                                    Click <strong style={{ color: GH.accent }}>Run</strong> in the toolbar to start your project
                                </p>
                            </div>
                            <div
                                className="px-3 py-1 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: '#21262d', color: GH.fgMuted, border: `1px solid ${GH.border}` }}
                            >
                                localhost:3000
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
