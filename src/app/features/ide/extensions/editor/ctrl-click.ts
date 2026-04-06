// src/app/features/ide/extensions/editor/ctrl-click.ts
// Ctrl+click (or Cmd+click on Mac) on a file path string in the editor
// opens that file. Works for paths like:
//   import { X } from "./components/Button"
//   // see src/utils/helpers.ts
//   require("../config/db")

import {
    EditorView,
    ViewPlugin,
    Decoration,
    DecorationSet,
    ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// ── File path regex ───────────────────────────────────────────────────────────
// Matches: './foo/bar', '../baz', 'src/utils/x', '@/components/Button'

const FILE_PATH_RE =
    /(?:from\s+['"]|require\s*\(\s*['"]|import\s+['"])\s*((?:\.{0,2}\/|@\/|src\/)[^'"]+)['"]/g;

const PLAIN_PATH_RE = /\b((?:\.{1,2}\/|src\/|app\/)[^\s'"`,;)]+\.[a-z]{1,4})\b/g;

// ── Ctrl+click decoration ─────────────────────────────────────────────────────

const linkMark = Decoration.mark({
    class: "cm-ctrl-link",
    inclusive: false,
});

function buildLinkDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    // Only add decorations when Ctrl/Cmd is held
    // (checked at click time — we always render the marks faintly)

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;

        for (const re of [FILE_PATH_RE, PLAIN_PATH_RE]) {
            re.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = re.exec(text)) !== null) {
                const pathGroup = match[1];
                const pathStart = line.from + match[0].indexOf(pathGroup);
                const pathEnd = pathStart + pathGroup.length;
                builder.add(pathStart, pathEnd, linkMark);
            }
        }
    }

    return builder.finish();
}

// ── Ctrl+click extension ──────────────────────────────────────────────────────

export function ctrlClickExtension(
    onNavigate: (filePath: string, line: number) => void,
): any[] {
    const theme = EditorView.theme({
        ".cm-ctrl-link": {
            cursor: "default",
            borderBottom: "1px dotted #6f737a",
        },
        ".cm-ctrl-link:hover": {
            color: "#59a869",
            borderBottom: "1px solid #59a869",
            cursor: "pointer",
        },
    });

    const plugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildLinkDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildLinkDecorations(update.view);
                }
            }
        },
        { decorations: v => v.decorations }
    );

    const clickHandler = EditorView.domEventHandlers({
        click(event, view) {
            const isMeta = event.metaKey || event.ctrlKey;
            if (!isMeta) return false;

            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos == null) return false;

            const doc = view.state.doc;
            const line = doc.lineAt(pos);
            const text = line.text;

            // Find the path under cursor
            for (const re of [FILE_PATH_RE, PLAIN_PATH_RE]) {
                re.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = re.exec(text)) !== null) {
                    const pathGroup = match[1];
                    const pathStart = line.from + match[0].indexOf(pathGroup);
                    const pathEnd = pathStart + pathGroup.length;

                    if (pos >= pathStart && pos <= pathEnd) {
                        event.preventDefault();

                        // Resolve relative path
                        const resolved = resolveImportPath(
                            pathGroup,
                            view.state.doc.toString(),
                        );

                        onNavigate(resolved, 0);
                        return true;
                    }
                }
            }

            return false;
        },
    });

    return [theme, plugin, clickHandler];
}

// ── Resolve import path to relative file path ─────────────────────────────────

function resolveImportPath(importPath: string, _docContent: string): string {
    // Strip leading @/ → src/
    if (importPath.startsWith("@/")) {
        return "src/" + importPath.slice(2);
    }

    // Already a relative path — normalize
    // Remove leading ./
    if (importPath.startsWith("./")) {
        return importPath.slice(2);
    }

    // ../foo — keep as-is for now (caller can resolve against active file)
    return importPath;
}