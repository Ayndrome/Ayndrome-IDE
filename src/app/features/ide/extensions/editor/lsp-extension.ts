// src/app/features/ide/extensions/editor/lsp-extension.ts
// CodeMirror extension that wires LSP into the editor.
// Provides: hover, completions, go-to-definition, diagnostics.

import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate,
    hoverTooltip,
    keymap,
    gutter,
    GutterMarker,
} from "@codemirror/view";
import {
    StateField,
    StateEffect,
    RangeSetBuilder,
    Extension,
    EditorState,
} from "@codemirror/state";
import {
    autocompletion,
    CompletionContext,
    CompletionResult,
} from "@codemirror/autocomplete";
import { LspClient, toFileUri, fromFileUri } from "./lsp-client";

// ── Diagnostic types ──────────────────────────────────────────────────────────

type LspDiagnostic = {
    from: number;
    to: number;
    severity: "error" | "warning" | "info" | "hint";
    message: string;
};

// ── State effects ─────────────────────────────────────────────────────────────

export const setDiagnosticsEffect =
    StateEffect.define<LspDiagnostic[]>();

// ── Diagnostics state field ───────────────────────────────────────────────────

export const diagnosticsField = StateField.define<LspDiagnostic[]>({
    create: () => [],
    update(diags, tr) {
        for (const e of tr.effects) {
            if (e.is(setDiagnosticsEffect)) return e.value;
        }
        return diags;
    },
});

// ── Diagnostic gutter marker ──────────────────────────────────────────────────

class DiagnosticGutterMarker extends GutterMarker {
    constructor(
        private severity: "error" | "warning" | "info" | "hint"
    ) { super(); }

    toDOM(): HTMLElement {
        const el = document.createElement("div");
        el.style.cssText = [
            "width:6px;height:6px;border-radius:50%;",
            "margin:auto;margin-top:6px;",
        ].join("");
        el.style.backgroundColor =
            this.severity === "error" ? "#c75450" :
                this.severity === "warning" ? "#c09a4e" : "#6897bb";
        el.title = this.severity;
        return el;
    }
}

// ── Diagnostic decorations ────────────────────────────────────────────────────

const diagnosticTheme = EditorView.theme({
    ".cm-lsp-error": {
        textDecoration: "underline wavy #c75450",
        textUnderlineOffset: "3px",
    },
    ".cm-lsp-warning": {
        textDecoration: "underline wavy #c09a4e",
        textUnderlineOffset: "3px",
    },
    ".cm-lsp-info": {
        textDecoration: "underline wavy #6897bb",
        textUnderlineOffset: "3px",
    },
    ".cm-lsp-tooltip": {
        backgroundColor: "#2b2d30",
        border: "1px solid #3c3f41",
        borderRadius: "5px",
        padding: "6px 10px",
        fontSize: "12px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: "#bcbec4",
        maxWidth: "420px",
        lineHeight: "1.5",
    },
    ".cm-lsp-tooltip code": {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        backgroundColor: "#313438",
        padding: "1px 4px",
        borderRadius: "3px",
        color: "#ffc66d",
    },
    ".cm-lsp-tooltip-error": {
        borderLeft: "3px solid #c75450",
        paddingLeft: "8px",
    },
});

function buildDiagnosticDecorations(diags: LspDiagnostic[]): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const sorted = [...diags].sort((a, b) => a.from - b.from);
    for (const d of sorted) {
        const cls =
            d.severity === "error" ? "cm-lsp-error" :
                d.severity === "warning" ? "cm-lsp-warning" : "cm-lsp-info";
        builder.add(d.from, d.to, Decoration.mark({ class: cls }));
    }
    return builder.finish();
}

// ── LSP position helpers ──────────────────────────────────────────────────────

function posToLsp(
    state: EditorState,
    pos: number,
): { line: number; character: number } {
    const line = state.doc.lineAt(pos);
    return {
        line: line.number - 1,
        character: pos - line.from,
    };
}

function lspPosToOffset(
    state: EditorState,
    lspLine: number,
    lspChar: number,
): number {
    const line = state.doc.line(lspLine + 1);
    return Math.min(line.from + lspChar, line.to);
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

function buildHoverTooltip(client: LspClient, filePath: string) {
    return hoverTooltip(async (view, pos) => {
        if (!client.isReady()) return null;

        try {
            const lspPos = posToLsp(view.state, pos);
            const result = await client.hover(
                toFileUri(filePath),
                lspPos.line,
                lspPos.character,
            );

            if (!result?.contents) return null;

            const text =
                typeof result.contents === "string"
                    ? result.contents
                    : result.contents.value ?? result.contents.map?.((c: any) =>
                        typeof c === "string" ? c : c.value
                    ).join("\n") ?? "";

            if (!text.trim()) return null;

            return {
                pos,
                end: pos,
                above: true,
                create: () => {
                    const el = document.createElement("div");
                    el.className = "cm-lsp-tooltip";
                    // Render markdown-ish content safely
                    el.innerHTML = text
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/`([^`]+)`/g, "<code>$1</code>")
                        .replace(/\n/g, "<br>");
                    return { dom: el };
                },
            };
        } catch {
            return null;
        }
    }, { hideOnChange: true });
}

// ── Completions ───────────────────────────────────────────────────────────────

function buildCompletionSource(client: LspClient, filePath: string) {
    return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
        if (!client.isReady()) return null;
        if (!ctx.explicit && !ctx.matchBefore(/\w+/)) return null;

        try {
            const lspPos = posToLsp(ctx.state, ctx.pos);
            const result = await client.completion(
                toFileUri(filePath),
                lspPos.line,
                lspPos.character,
            );

            const items = Array.isArray(result) ? result : result?.items ?? [];
            if (!items.length) return null;

            return {
                from: ctx.pos - (ctx.matchBefore(/\w+/)?.text.length ?? 0),
                options: items.slice(0, 80).map((item: any) => ({
                    label: item.label,
                    detail: item.detail ?? "",
                    info: item.documentation
                        ? typeof item.documentation === "string"
                            ? item.documentation
                            : item.documentation.value
                        : undefined,
                    type: lspKindToType(item.kind),
                    apply: item.insertText ?? item.label,
                })),
                validFor: /^\w*$/,
            };
        } catch {
            return null;
        }
    };
}

function lspKindToType(kind?: number): string {
    const kinds: Record<number, string> = {
        1: "text", 2: "method", 3: "function", 4: "constructor",
        5: "field", 6: "variable", 7: "class", 8: "interface",
        9: "module", 10: "property", 11: "unit", 12: "value",
        13: "enum", 14: "keyword", 15: "snippet", 16: "color",
        17: "file", 18: "reference", 19: "folder", 20: "enum",
        21: "constant", 22: "struct", 23: "event", 24: "operator",
        25: "type",
    };
    return kinds[kind ?? 0] ?? "text";
}

// ── Diagnostics plugin ────────────────────────────────────────────────────────

function buildDiagnosticsPlugin(
    client: LspClient,
    filePath: string,
) {
    return ViewPlugin.fromClass(
        class {
            private unsubscribe: () => void;

            constructor(view: EditorView) {
                this.unsubscribe = client.onNotification(
                    (method, params) => {
                        if (method !== "textDocument/publishDiagnostics") return;
                        if (fromFileUri(params.uri) !== filePath) return;

                        const diags: LspDiagnostic[] = (params.diagnostics ?? []).map(
                            (d: any) => ({
                                from: lspPosToOffset(
                                    view.state, d.range.start.line, d.range.start.character
                                ),
                                to: lspPosToOffset(
                                    view.state, d.range.end.line, d.range.end.character
                                ),
                                severity: (["error", "warning", "info", "hint"] as const)[
                                    (d.severity ?? 1) - 1
                                ] ?? "info",
                                message: d.message,
                            })
                        );

                        view.dispatch({
                            effects: setDiagnosticsEffect.of(diags),
                        });
                    }
                );
            }

            destroy() { this.unsubscribe(); }
        }
    );
}

// ── Diagnostic decorations plugin ────────────────────────────────────────────

const diagnosticDecorationsPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = buildDiagnosticDecorations(
                view.state.field(diagnosticsField)
            );
        }
        update(update: ViewUpdate) {
            if (update.state.field(diagnosticsField) !==
                update.startState.field(diagnosticsField)) {
                this.decorations = buildDiagnosticDecorations(
                    update.state.field(diagnosticsField)
                );
            }
        }
    },
    { decorations: v => v.decorations }
);

// ── Diagnostic gutter ─────────────────────────────────────────────────────────

function buildDiagnosticGutter() {
    return gutter({
        class: "cm-lsp-gutter",
        lineMarker(view, line) {
            const diags = view.state.field(diagnosticsField);
            const diag = diags.find(
                d => d.from >= line.from && d.from <= line.to
            );
            if (!diag) return null;
            return new DiagnosticGutterMarker(diag.severity);
        },
        initialSpacer: () => new DiagnosticGutterMarker("hint"),
    });
}

// ── Go-to-definition keymap ───────────────────────────────────────────────────

function buildGoToDefinitionKeymap(
    client: LspClient,
    filePath: string,
    onNavigate: (filePath: string, line: number) => void,
) {
    return keymap.of([{
        key: "F12",
        run(view) {
            const pos = view.state.selection.main.head;
            const lspPos = posToLsp(view.state, pos);

            client.definition(
                toFileUri(filePath),
                lspPos.line,
                lspPos.character,
            ).then(result => {
                if (!result) return;
                const loc = Array.isArray(result) ? result[0] : result;
                if (!loc) return;

                const targetPath = fromFileUri(loc.uri ?? loc.targetUri);
                const targetLine = (loc.range ?? loc.targetRange)?.start?.line ?? 0;
                onNavigate(targetPath, targetLine);
            }).catch(() => { });

            return true;
        },
    }]);
}

// ── Document sync plugin ──────────────────────────────────────────────────────

function buildDocSyncPlugin(client: LspClient, filePath: string) {
    const uri = toFileUri(filePath);
    const languageId = filePath.endsWith(".py") ? "python" : "typescript";
    let version = 1;
    let opened = false;

    return ViewPlugin.fromClass(class {
        constructor(view: EditorView) {
            if (!opened) {
                opened = true;
                client.didOpen(uri, languageId, view.state.doc.toString(), version);
            }
        }
        update(update: ViewUpdate) {
            if (update.docChanged) {
                version++;
                client.didChange(uri, update.state.doc.toString(), version);
            }
        }
        destroy() {
            client.didClose(uri);
        }
    });
}

// ── Main LSP extension ────────────────────────────────────────────────────────

export function lspExtension(
    client: LspClient,
    filePath: string,
    onNavigate: (filePath: string, line: number) => void,
): Extension {
    return [
        diagnosticsField,
        diagnosticTheme,
        buildDocSyncPlugin(client, filePath),
        buildDiagnosticsPlugin(client, filePath),
        diagnosticDecorationsPlugin,
        buildDiagnosticGutter(),
        buildHoverTooltip(client, filePath),
        autocompletion({ override: [buildCompletionSource(client, filePath)] }),
        buildGoToDefinitionKeymap(client, filePath, onNavigate),
    ];
}