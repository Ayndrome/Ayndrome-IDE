// 'use client';

// import { cn } from "@/lib/utils";
// import { useState } from "react";
// import {
//     RefreshCwIcon,
//     ExternalLinkIcon,
//     SmartphoneIcon,
//     MonitorIcon,
//     TabletIcon,
//     LockIcon,
//     GlobeIcon,
//     ZapIcon,
// } from "lucide-react";
// import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
// import { useIDEStore } from "@/src/store/ide-store";

// // ── GitHub Dark VS Code colors ────────────────────────────────────────────────
// const GH = {
//     canvas: "#0d1117",   // editor / main area
//     canvasSub: "#161b22",   // panels, toolbar bg
//     canvasInset: "#010409",   // deepest bg
//     border: "#30363d",
//     fg: "#e6edf3",
//     fgMuted: "#8b949e",
//     fgSubtle: "#6e7681",
//     accent: "#388bfd",
// };

// const viewports = [
//     { id: "desktop", icon: <MonitorIcon className="size-3.5" />, label: "Desktop", width: "100%" },
//     { id: "tablet", icon: <TabletIcon className="size-3.5" />, label: "Tablet", width: "768px" },
//     { id: "mobile", icon: <SmartphoneIcon className="size-3.5" />, label: "Mobile", width: "390px" },
// ] as const;

// export const PreviewPane = () => {
//     const { isRunning, projectName } = useIDEStore();
//     const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
//     const [refreshKey, setRefreshKey] = useState(0);

//     const previewUrl = isRunning ? "http://localhost:3000" : null;
//     const frameWidth = viewports.find((v) => v.id === viewport)?.width ?? "100%";

//     return (
//         <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: GH.canvas }}>

//             {/* ── Toolbar ── */}
//             <div
//                 className="flex items-center gap-2 px-3 py-1.5 shrink-0"
//                 style={{ backgroundColor: GH.canvasSub, borderBottom: `1px solid ${GH.border}` }}
//             >
//                 {/* URL bar */}
//                 <div
//                     className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs min-w-0"
//                     style={{
//                         backgroundColor: GH.canvas,
//                         border: `1px solid ${GH.border}`,
//                         color: GH.fgMuted,
//                     }}
//                 >
//                     <LockIcon className="size-3 shrink-0 text-[#3fb950]" />
//                     <span className="truncate font-mono">{previewUrl ?? "localhost:3000"}</span>
//                 </div>

//                 {/* Viewport switcher */}
//                 <div
//                     className="flex items-center rounded-md overflow-hidden"
//                     style={{ border: `1px solid ${GH.border}`, backgroundColor: GH.canvas }}
//                 >
//                     {viewports.map((v) => (
//                         <Tooltip key={v.id}>
//                             <TooltipTrigger asChild>
//                                 <button
//                                     onClick={() => setViewport(v.id)}
//                                     className="p-1.5 transition-colors"
//                                     style={{
//                                         backgroundColor: viewport === v.id ? '#21262d' : 'transparent',
//                                         color: viewport === v.id ? GH.fg : GH.fgMuted,
//                                         borderRight: v.id !== "mobile" ? `1px solid ${GH.border}` : undefined,
//                                     }}
//                                 >
//                                     {v.icon}
//                                 </button>
//                             </TooltipTrigger>
//                             <TooltipContent side="bottom">{v.label}</TooltipContent>
//                         </Tooltip>
//                     ))}
//                 </div>

//                 <div className="w-px h-4" style={{ backgroundColor: GH.border }} />

//                 {/* Refresh */}
//                 <Tooltip>
//                     <TooltipTrigger asChild>
//                         <button
//                             onClick={() => setRefreshKey((k) => k + 1)}
//                             className="p-1.5 rounded-md transition-colors"
//                             style={{ color: GH.fgMuted }}
//                             onMouseEnter={e => (e.currentTarget.style.color = GH.fg, e.currentTarget.style.backgroundColor = '#21262d')}
//                             onMouseLeave={e => (e.currentTarget.style.color = GH.fgMuted, e.currentTarget.style.backgroundColor = 'transparent')}
//                         >
//                             <RefreshCwIcon className="size-3.5" />
//                         </button>
//                     </TooltipTrigger>
//                     <TooltipContent side="bottom">Refresh preview</TooltipContent>
//                 </Tooltip>

//                 {/* Open in tab */}
//                 <Tooltip>
//                     <TooltipTrigger asChild>
//                         <a
//                             href={previewUrl ?? "#"}
//                             target="_blank"
//                             rel="noopener noreferrer"
//                             className="p-1.5 rounded-md transition-colors"
//                             style={{ color: GH.fgMuted }}
//                             onMouseEnter={e => (e.currentTarget.style.color = GH.fg, e.currentTarget.style.backgroundColor = '#21262d')}
//                             onMouseLeave={e => (e.currentTarget.style.color = GH.fgMuted, e.currentTarget.style.backgroundColor = 'transparent')}
//                         >
//                             <ExternalLinkIcon className="size-3.5" />
//                         </a>
//                     </TooltipTrigger>
//                     <TooltipContent side="bottom">Open in new tab</TooltipContent>
//                 </Tooltip>
//             </div>

//             {/* ── Preview area ── */}
//             <div
//                 className="flex-1 overflow-auto flex items-start justify-center"
//                 style={{ backgroundColor: GH.canvasInset }}
//             >
//                 <div
//                     className="h-full transition-all duration-300"
//                     style={{ width: frameWidth, minHeight: "100%", backgroundColor: GH.canvas }}
//                 >
//                     {isRunning ? (
//                         <iframe
//                             key={refreshKey}
//                             src={previewUrl ?? ""}
//                             className="w-full h-full border-0"
//                             title={`${projectName} preview`}
//                             sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
//                         />
//                     ) : (
//                         /* ── Not running placeholder ── */
//                         <div
//                             className="flex flex-col items-center justify-center h-full gap-5"
//                             style={{ backgroundColor: GH.canvas }}
//                         >
//                             <div
//                                 className="size-14 rounded-2xl flex items-center justify-center"
//                                 style={{ backgroundColor: '#21262d', border: `1px solid ${GH.border}` }}
//                             >
//                                 <ZapIcon className="size-6" style={{ color: GH.accent }} />
//                             </div>
//                             <div className="flex flex-col items-center gap-2 text-center">
//                                 <p className="text-sm font-semibold" style={{ color: GH.fg }}>
//                                     Preview not running
//                                 </p>
//                                 <p className="text-xs max-w-[200px]" style={{ color: GH.fgMuted }}>
//                                     Click <strong style={{ color: GH.accent }}>Run</strong> in the toolbar to start your project
//                                 </p>
//                             </div>
//                             <div
//                                 className="px-3 py-1 rounded-full text-[10px] font-medium"
//                                 style={{ backgroundColor: '#21262d', color: GH.fgMuted, border: `1px solid ${GH.border}` }}
//                             >
//                                 localhost:3000
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </div>
//     );
// };


// src/app/features/ide/components/PreviewPane.tsx
// Phase 13: full preview pane with live screenshot, interaction log,
// URL bar, and viewport controls. Shown in Editor tab area.

'use client';

import React, {
    useState, useCallback, useRef, useEffect,
} from "react";
import { useIDEStore } from "@/src/store/ide-store";
import {
    RefreshCwIcon, MonitorIcon, SmartphoneIcon,
    TabletIcon, ExternalLinkIcon, CameraIcon,
    AlertCircleIcon, CheckCircleIcon, Loader2Icon,
} from "lucide-react";

const C = {
    bg: "#141414",
    bg2: "#141414",
    bg3: "#141414",
    border: "#3c3f41",
    text: "#bcbec4",
    muted: "#8a8d94",
    faint: "#6f737a",
    green: "#59a869",
    red: "#c75450",
    amber: "#c09a4e",
} as const;

type Viewport = { label: string; width: number; height: number; icon: React.ReactNode };

const VIEWPORTS: Viewport[] = [
    { label: "Desktop", width: 1280, height: 800, icon: <MonitorIcon size={12} /> },
    { label: "Tablet", width: 768, height: 1024, icon: <TabletIcon size={12} /> },
    { label: "Mobile", width: 390, height: 844, icon: <SmartphoneIcon size={12} /> },
];

type ScreenshotState =
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "loaded"; base64: string; url: string; timestamp: number;
        consoleErrors?: string[]; networkErrors?: string[]
    }
    | { kind: "error"; message: string };

export const PreviewPane: React.FC = () => {
    const { workspaceId } = useIDEStore();
    const [url, setUrl] = useState("http://localhost:3000");
    const [inputUrl, setInputUrl] = useState("http://localhost:3000");
    const [viewport, setViewport] = useState(VIEWPORTS[0]);
    const [shot, setShot] = useState<ScreenshotState>({ kind: "idle" });
    const [autoRefresh, setAuto] = useState(false);
    const autoRefreshRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const [captureErrors, setCaptureErrors] = useState(false);

    // ── Take screenshot ───────────────────────────────────────────────────────

    const capture = useCallback(async (targetUrl = url, withErrors = captureErrors) => {
        if (!workspaceId) return;
        setShot({ kind: "loading" });

        try {
            const action = withErrors ? "page_state" : "screenshot";
            const res = await fetch("/api/playwright", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    workspaceId,
                    url: targetUrl,
                    fullPage: false,
                    viewport: { width: viewport.width, height: viewport.height },
                }),
            });

            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            const screenshot = withErrors ? data.screenshot : data;

            setShot({
                kind: "loaded",
                base64: screenshot.base64,
                url: screenshot.url,
                timestamp: screenshot.timestamp,
                consoleErrors: withErrors ? data.consoleErrors : undefined,
                networkErrors: withErrors ? data.networkErrors : undefined,
            });
        } catch (err: any) {
            setShot({ kind: "error", message: err.message });
        }
    }, [workspaceId, url, viewport, captureErrors]);

    // ── Auto-refresh ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (autoRefresh) {
            autoRefreshRef.current = setInterval(() => capture(), 3000);
        } else {
            clearInterval(autoRefreshRef.current);
        }
        return () => clearInterval(autoRefreshRef.current);
    }, [autoRefresh, capture]);

    // ── URL bar submit ────────────────────────────────────────────────────────

    const handleUrlSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const normalized = inputUrl.startsWith("http")
            ? inputUrl
            : `http://${inputUrl}`;
        setUrl(normalized);
        capture(normalized);
    }, [inputUrl, capture]);

    const hasErrors = shot.kind === "loaded" && (
        (shot.consoleErrors?.length ?? 0) > 0 ||
        (shot.networkErrors?.length ?? 0) > 0
    );

    return (
        <div
            className="flex flex-col h-full w-full overflow-hidden"
            style={{ backgroundColor: C.bg }}
        >
            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <div
                className="flex items-center gap-2 px-3 py-2 shrink-0"
                style={{
                    backgroundColor: C.bg2,
                    borderBottom: `1px solid ${C.border}`,
                }}
            >
                {/* Viewport selector */}
                <div
                    className="flex items-center rounded overflow-hidden shrink-0"
                    style={{ border: `1px solid ${C.border}` }}
                >
                    {VIEWPORTS.map(vp => (
                        <button
                            key={vp.label}
                            onClick={() => { setViewport(vp); capture(url); }}
                            title={`${vp.label} (${vp.width}×${vp.height})`}
                            className="flex items-center justify-center px-2 py-1 transition-colors"
                            style={{
                                backgroundColor: viewport.label === vp.label ? C.bg3 : "transparent",
                                color: viewport.label === vp.label ? C.text : C.faint,
                                borderRight: vp.label !== "Mobile" ? `1px solid ${C.border}` : "none",
                            }}
                        >
                            {vp.icon}
                        </button>
                    ))}
                </div>

                {/* URL bar */}
                <form onSubmit={handleUrlSubmit} className="flex-1 min-w-0">
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={e => setInputUrl(e.target.value)}
                        className="w-full px-2 py-1 rounded text-[12px] outline-none"
                        style={{
                            backgroundColor: C.bg3,
                            border: `1px solid ${C.border}`,
                            color: C.text,
                            fontFamily: "monospace",
                        }}
                        placeholder="http://localhost:3000"
                    />
                </form>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">

                    {/* Capture errors toggle */}
                    <button
                        onClick={() => setCaptureErrors(v => !v)}
                        title="Capture console + network errors"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                        style={{
                            color: captureErrors ? C.amber : C.faint,
                            backgroundColor: captureErrors ? "rgba(192,154,78,.1)" : "transparent",
                            border: `1px solid ${captureErrors ? C.amber : "transparent"}`,
                        }}
                    >
                        <AlertCircleIcon size={11} />
                        Errors
                    </button>

                    {/* Auto-refresh */}
                    <button
                        onClick={() => setAuto(v => !v)}
                        title="Auto-refresh every 3s"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                        style={{
                            color: autoRefresh ? C.green : C.faint,
                            backgroundColor: autoRefresh ? "rgba(89,168,105,.1)" : "transparent",
                            border: `1px solid ${autoRefresh ? C.green : "transparent"}`,
                        }}
                    >
                        <RefreshCwIcon
                            size={11}
                            className={autoRefresh ? "animate-spin" : ""}
                            style={{ animationDuration: "3s" }}
                        />
                        Live
                    </button>

                    {/* Screenshot */}
                    <button
                        onClick={() => capture()}
                        title="Take screenshot"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
                        style={{
                            color: C.text,
                            backgroundColor: C.bg3,
                            border: `1px solid ${C.border}`,
                        }}
                    >
                        {shot.kind === "loading"
                            ? <Loader2Icon size={11} className="animate-spin" />
                            : <CameraIcon size={11} />
                        }
                        Capture
                    </button>

                    {/* Open in browser */}
                    <button
                        onClick={() => window.open(url, "_blank")}
                        title="Open in browser"
                        className="p-1 rounded transition-colors"
                        style={{ color: C.faint }}
                        onMouseEnter={e => e.currentTarget.style.color = C.text}
                        onMouseLeave={e => e.currentTarget.style.color = C.faint}
                    >
                        <ExternalLinkIcon size={12} />
                    </button>
                </div>
            </div>

            {/* ── Screenshot display ────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto flex flex-col">

                {shot.kind === "idle" && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <CameraIcon size={32} style={{ color: C.faint, opacity: .4 }} />
                        <p className="text-[12px]" style={{ color: C.faint }}>
                            Click Capture to take a screenshot
                        </p>
                        <button
                            onClick={() => capture()}
                            className="flex items-center gap-2 px-4 py-2 rounded text-[12px] font-medium transition-colors"
                            style={{
                                backgroundColor: C.green,
                                color: "#0d1f16",
                            }}
                        >
                            <CameraIcon size={13} />
                            Capture screenshot
                        </button>
                    </div>
                )}

                {shot.kind === "loading" && (
                    <div className="flex-1 flex items-center justify-center gap-3">
                        <Loader2Icon size={20} className="animate-spin" style={{ color: C.green }} />
                        <span className="text-[12px]" style={{ color: C.muted }}>
                            Launching browser…
                        </span>
                    </div>
                )}

                {shot.kind === "error" && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                        <AlertCircleIcon size={28} style={{ color: C.red }} />
                        <p className="text-[12px] text-center" style={{ color: C.muted }}>
                            {shot.message}
                        </p>
                        <button
                            onClick={() => capture()}
                            className="text-[11px] px-3 py-1.5 rounded transition-colors"
                            style={{
                                color: C.text,
                                backgroundColor: C.bg3,
                                border: `1px solid ${C.border}`,
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {shot.kind === "loaded" && (
                    <div className="flex flex-col min-h-0">
                        {/* Viewport label */}
                        <div
                            className="flex items-center justify-between px-3 py-1.5 shrink-0"
                            style={{ borderBottom: `1px solid ${C.border}` }}
                        >
                            <span className="text-[10px] font-mono" style={{ color: C.faint }}>
                                {shot.url}
                            </span>
                            <div className="flex items-center gap-3">
                                {hasErrors ? (
                                    <span className="flex items-center gap-1 text-[10px]"
                                        style={{ color: C.amber }}>
                                        <AlertCircleIcon size={10} />
                                        {(shot.consoleErrors?.length ?? 0) + (shot.networkErrors?.length ?? 0)} errors
                                    </span>
                                ) : shot.consoleErrors !== undefined ? (
                                    <span className="flex items-center gap-1 text-[10px]"
                                        style={{ color: C.green }}>
                                        <CheckCircleIcon size={10} />
                                        No errors
                                    </span>
                                ) : null}
                                <span className="text-[10px]" style={{ color: C.faint }}>
                                    {viewport.width}×{viewport.height}
                                </span>
                                <span className="text-[10px]" style={{ color: C.faint }}>
                                    {new Date(shot.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                        </div>

                        {/* Screenshot image */}
                        <div
                            className="flex-1 overflow-auto flex items-start justify-center p-4"
                            style={{ backgroundColor: "#111214" }}
                        >
                            <img
                                src={`data:image/png;base64,${shot.base64}`}
                                alt="Page screenshot"
                                style={{
                                    maxWidth: "100%",
                                    borderRadius: "6px",
                                    boxShadow: "0 4px 24px rgba(0,0,0,.4)",
                                    border: `1px solid ${C.border}`,
                                }}
                            />
                        </div>

                        {/* Error panels */}
                        {hasErrors && (
                            <div
                                className="shrink-0 max-h-40 overflow-y-auto"
                                style={{ borderTop: `1px solid ${C.border}` }}
                            >
                                {(shot.consoleErrors ?? []).map((e, i) => (
                                    <div
                                        key={`c${i}`}
                                        className="flex items-start gap-2 px-3 py-1.5 text-[11px] font-mono"
                                        style={{
                                            borderBottom: `1px solid ${C.border}`,
                                            color: C.amber,
                                        }}
                                    >
                                        <AlertCircleIcon size={10} className="mt-0.5 shrink-0" />
                                        {e}
                                    </div>
                                ))}
                                {(shot.networkErrors ?? []).map((e, i) => (
                                    <div
                                        key={`n${i}`}
                                        className="flex items-start gap-2 px-3 py-1.5 text-[11px] font-mono"
                                        style={{
                                            borderBottom: `1px solid ${C.border}`,
                                            color: C.red,
                                        }}
                                    >
                                        <AlertCircleIcon size={10} className="mt-0.5 shrink-0" />
                                        {e}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};