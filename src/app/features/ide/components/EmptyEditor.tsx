'use client';

// VSCode GitHub Dark Theme colors (3rd-party extension: GitHub Dark)
// matching exactly: https://github.com/primer/github-vscode-theme
const GH = {
    bg: "#0d1117",
    bgPanel: "#161b22",
    border: "#30363d",
    fg: "#e6edf3",
    fgSubtle: "#8b949e",
    fgInactive: "#484f58",
    keyword: "#ff7b72",
    func: "#79c0ff",
    constant: "#d2a8ff",
    string: "#a5d6ff",
    meta: "#e3b341",
} as const;

interface ShortcutItem {
    keys: string[];
    label: string;
}

const shortcuts: ShortcutItem[] = [
    { keys: ["Ctrl", "Shift", "P"], label: "Show All Commands" },
    { keys: ["Ctrl", "P"], label: "Go to File..." },
    { keys: ["Ctrl", "Shift", "`"], label: "New Terminal" },
    { keys: ["Ctrl", "B"], label: "Toggle Sidebar" },
];

const recentItems = [
    { icon: "📄", name: "FileExplorer.tsx", path: "src/app/features/ide/components" },
    { icon: "📄", name: "CodeEditor.tsx", path: "src/app/features/ide/components" },
    { icon: "📄", name: "EditorPane.tsx", path: "src/app/features/ide/components" },
];

export function EmptyEditor() {
    return (
        <div
            className="flex items-center justify-center h-full w-full select-none"
            style={{ backgroundColor: GH.bg, color: GH.fg }}
        >
            <div className="flex flex-col items-center gap-10 w-full max-w-2xl px-8">
                {/* Logo + Title */}
                <div className="flex flex-col items-center gap-3">
                    <svg width="80" height="80" viewBox="0 0 100 100" fill="none">
                        <rect width="100" height="100" rx="8" fill={GH.bgPanel} stroke={GH.border} strokeWidth="1" />
                        <path d="M20 30 L50 20 L80 30 L80 70 L50 80 L20 70 Z" stroke={GH.func} strokeWidth="2" fill="none" opacity="0.6" />
                        <path d="M20 30 L50 50 L80 30" stroke={GH.string} strokeWidth="2" fill="none" opacity="0.6" />
                        <path d="M50 50 L50 80" stroke={GH.constant} strokeWidth="2" fill="none" opacity="0.6" />
                    </svg>
                    <div className="text-center">
                        <h1 className="text-xl font-semibold" style={{ color: GH.fg }}>Ayndrome IDE</h1>
                        <p className="text-sm mt-1" style={{ color: GH.fgSubtle }}>
                            Version 1.0.0 &nbsp;—&nbsp; <span style={{ color: GH.constant }}>Ayndrome</span>
                        </p>
                    </div>
                </div>

                {/* Two column layout like VSCode */}
                <div className="grid grid-cols-2 gap-8 w-full">
                    {/* Start section */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GH.fgSubtle }}>
                            Start
                        </p>
                        <ul className="space-y-2">
                            {[
                                { label: "New File", shortcut: "", color: GH.func },
                                { label: "Open Folder...", shortcut: "", color: GH.func },
                                { label: "Clone Git Repository...", shortcut: null, color: GH.func },
                            ].map(({ label, shortcut, color }) => (
                                <li key={label}>
                                    <button
                                        className="flex items-center gap-2 text-sm  transition-colors"
                                        style={{ color }}
                                    >
                                        <span>{label}</span>
                                        {shortcut && (
                                            <span className="text-xs" style={{ color: GH.fgInactive }}>
                                                {shortcut}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Recent section */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GH.fgSubtle }}>
                            Recent
                        </p>
                        <ul className="space-y-2">
                            {recentItems.map(({ name, path }) => (
                                <li key={name}>
                                    <button className="flex flex-col text-left group" style={{ color: GH.func }}>
                                        <span className="text-sm">{name}</span>
                                        <span className="text-xs" style={{ color: GH.fgInactive }}>{path}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Keyboard shortcuts - like VSCode bottom section */}
                <div
                    className="w-full rounded-md p-4"
                    style={{ backgroundColor: GH.bgPanel, border: `1px solid ${GH.border}` }}
                >
                    <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GH.fgSubtle }}>
                        Shortcuts
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {shortcuts.map(({ keys, label }) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                                <span className="text-xs" style={{ color: GH.fgSubtle }}>{label}</span>
                                <div className="flex items-center gap-0.5">
                                    {keys.map((key, i) => (
                                        <span key={i}>
                                            <kbd
                                                className="text-xs px-1.5 py-0.5 rounded"
                                                style={{
                                                    backgroundColor: "#1c2128",
                                                    border: `1px solid ${GH.border}`,
                                                    color: GH.fg,
                                                    fontFamily: "inherit",
                                                }}
                                            >
                                                {key}
                                            </kbd>
                                            {i < keys.length - 1 && <span className="text-xs mx-0.5" style={{ color: GH.fgInactive }}>+</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom help text */}
                <p className="text-xs" style={{ color: GH.fgInactive }}>
                    Open a file from the explorer or use{" "}
                    <kbd
                        className="px-1 py-0.5 rounded text-xs"
                        style={{
                            backgroundColor: "#1c2128",
                            border: `1px solid ${GH.border}`,
                            color: GH.fgSubtle,
                        }}
                    >
                        ctrl
                    </kbd>{" "}

                    <span
                        className="px-1 py-0.5 rounded text-xs"

                    > +

                    </span>{" "}

                    <kbd
                        className="px-1 py-0.5 rounded text-xs"
                        style={{
                            backgroundColor: "#1c2128",
                            border: `1px solid ${GH.border}`,
                            color: GH.fgSubtle,
                        }}


                    >
                        P
                    </kbd>{" "}
                    to quickly open any file.
                </p>
            </div>
        </div>
    );
}

