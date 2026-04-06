// src/app/features/ide/extensions/editor/diff-decoration.ts
// CodeMirror extension that renders diff highlights directly in the editor.
// Green background + gutter widget for added lines.
// Red background + strikethrough for removed lines.
// Per-hunk accept/reject buttons in the gutter.
// Driven by a StateField so React doesn't need to touch the view directly.

import {
    StateField,
    StateEffect,
    RangeSetBuilder,
    type Extension,
    type Range,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    GutterMarker,
    gutter,
    WidgetType,
} from "@codemirror/view";
import type { FileDiff, DiffHunk } from "../chat/agent/diff-engine";

// ── Effects (dispatch these to update diff state in the editor) ───────────────

export const setDiffEffect = StateEffect.define<FileDiff | null>();
export const acceptHunkEffect = StateEffect.define<string>();   // hunkId
export const rejectHunkEffect = StateEffect.define<string>();  // hunkId

// ── State field ───────────────────────────────────────────────────────────────
// Holds the current FileDiff. Null = no diff active.

export const diffStateField = StateField.define<FileDiff | null>({
    create: () => null,
    update(current, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setDiffEffect)) return effect.value;
            if (effect.is(acceptHunkEffect)) {
                if (!current) return current;
                return {
                    ...current,
                    hunks: current.hunks.map(h =>
                        h.id === effect.value ? { ...h, accepted: true } : h
                    ),
                };
            }
            if (effect.is(rejectHunkEffect)) {
                if (!current) return current;
                return {
                    ...current,
                    hunks: current.hunks.map(h =>
                        h.id === effect.value ? { ...h, accepted: false } : h
                    ),
                };
            }
        }
        return current;
    },
    provide: field => [
        // Line decorations (background highlights)
        EditorView.decorations.from(field, diff => buildLineDecorations(diff)),
    ],
});

// ── Line background decorations ───────────────────────────────────────────────

const addedLineDeco = Decoration.line({ class: "cm-diff-added" });
const removedLineDeco = Decoration.line({ class: "cm-diff-removed" });
const modifiedLineDeco = Decoration.line({ class: "cm-diff-modified" });

function buildLineDecorations(diff: FileDiff | null): DecorationSet {
    if (!diff || diff.hunks.length === 0) return Decoration.none;

    // We're decorating the NEW content (what's in the editor).
    // Added lines = green. The editor only shows the new file,
    // so we highlight added lines green and mark the line where
    // content was removed with a red marker widget.

    const builder = new RangeSetBuilder<Decoration>();
    const decos: Array<Range<Decoration>> = [];

    for (const hunk of diff.hunks) {
        if (hunk.accepted === false) continue; // rejected — don't highlight

        for (const line of hunk.lines) {
            if (line.type === "added" && line.newLineNum != null) {
                decos.push(
                    addedLineDeco.range(line.newLineNum - 1)
                );
            }
        }
    }

    // Sort by position (required by RangeSetBuilder)
    decos.sort((a, b) => a.from - b.from);
    for (const d of decos) builder.add(d.from, d.from, d.value);

    return builder.finish();
}

// ── Gutter marker widgets ─────────────────────────────────────────────────────
// Accept/reject buttons rendered in the gutter per hunk.

class HunkActionWidget extends GutterMarker {
    constructor(
        private hunkId: string,
        private accepted: boolean | null,
        private isFirst: boolean,   // show buttons only on first line of hunk
    ) { super(); }

    eq(other: HunkActionWidget): boolean {
        return (
            this.hunkId === other.hunkId &&
            this.accepted === other.accepted &&
            this.isFirst === other.isFirst
        );
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "cm-diff-gutter-actions";
        wrap.style.cssText = "display:flex;align-items:center;gap:2px;height:100%;padding:0 2px;";

        if (!this.isFirst) {
            // Non-first lines of hunk — just show colored dot
            const dot = document.createElement("span");
            dot.style.cssText = "width:3px;height:3px;border-radius:50%;margin:auto;";
            dot.style.backgroundColor =
                this.accepted === true ? "#238636" :
                    this.accepted === false ? "#da3633" : "#388bfd";
            wrap.appendChild(dot);
            return wrap;
        }

        if (this.accepted === true) {
            const badge = document.createElement("span");
            badge.textContent = "✓";
            badge.style.cssText = "font-size:10px;color:#3fb950;font-weight:600;padding:0 2px;";
            wrap.appendChild(badge);
            return wrap;
        }

        if (this.accepted === false) {
            const badge = document.createElement("span");
            badge.textContent = "✕";
            badge.style.cssText = "font-size:10px;color:#ff7b72;font-weight:600;padding:0 2px;";
            wrap.appendChild(badge);
            return wrap;
        }

        // Undecided — show accept/reject buttons
        const acceptBtn = document.createElement("button");
        acceptBtn.textContent = "✓";
        acceptBtn.title = "Accept this change";
        acceptBtn.dataset.hunkId = this.hunkId;
        acceptBtn.dataset.action = "accept";
        acceptBtn.style.cssText = [
            "font-size:9px;font-weight:700;",
            "padding:0 3px;height:14px;border-radius:2px;cursor:pointer;",
            "background:rgba(35,134,54,0.2);color:#3fb950;",
            "border:1px solid rgba(35,134,54,0.4);",
            "line-height:1;",
        ].join("");

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "✕";
        rejectBtn.title = "Reject this change";
        rejectBtn.dataset.hunkId = this.hunkId;
        rejectBtn.dataset.action = "reject";
        rejectBtn.style.cssText = [
            "font-size:9px;font-weight:700;",
            "padding:0 3px;height:14px;border-radius:2px;cursor:pointer;",
            "background:rgba(218,54,51,0.2);color:#ff7b72;",
            "border:1px solid rgba(218,54,51,0.4);",
            "line-height:1;",
        ].join("");

        wrap.appendChild(acceptBtn);
        wrap.appendChild(rejectBtn);
        return wrap;
    }
}

// ── Gutter extension ──────────────────────────────────────────────────────────

function buildDiffGutter(
    onAccept: (hunkId: string) => void,
    onReject: (hunkId: string) => void,
): Extension {
    return gutter({
        class: "cm-diff-gutter",
        lineMarker(view, line) {
            const diff = view.state.field(diffStateField, false);
            if (!diff) return null;

            const lineNum = view.state.doc.lineAt(line.from).number;

            for (const hunk of diff.hunks) {
                if (hunk.accepted === false) continue;

                for (let i = 0; i < hunk.lines.length; i++) {
                    const dl = hunk.lines[i];
                    if (dl.type === "added" && dl.newLineNum === lineNum) {
                        const isFirstInHunk = i === 0 ||
                            hunk.lines.slice(0, i).every(l => l.type !== "added");
                        return new HunkActionWidget(
                            hunk.id,
                            hunk.accepted,
                            isFirstInHunk,
                        );
                    }
                }
            }
            return null;
        },
        domEventHandlers: {
            click(view, line, event) {
                const target = event.target as HTMLElement;
                const hunkId = target.dataset?.hunkId;
                const action = target.dataset?.action;
                if (!hunkId || !action) return false;

                if (action === "accept") {
                    onAccept(hunkId);
                    view.dispatch({ effects: acceptHunkEffect.of(hunkId) });
                }
                if (action === "reject") {
                    onReject(hunkId);
                    view.dispatch({ effects: rejectHunkEffect.of(hunkId) });
                }
                return true;
            },
        },
        initialSpacer: () => new HunkActionWidget("", null, false),
    });
}

// ── Removed-line widget ───────────────────────────────────────────────────────
// Renders deleted lines as red ghost lines between editor lines.

class RemovedLinesWidget extends WidgetType {
    constructor(private lines: string[]) { super(); }

    eq(other: RemovedLinesWidget): boolean {
        return this.lines.join("\n") === other.lines.join("\n");
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "cm-diff-removed-widget";
        wrap.style.cssText = [
            "background:rgba(255,123,114,0.08);",
            "border-left:2px solid #da3633;",
            "font-family:var(--cm-font-family, monospace);",
            "font-size:var(--cm-font-size, 13px);",
            "line-height:1.6;",
            "white-space:pre;",
            "opacity:0.7;",
            "pointer-events:none;",
            "padding:0 4px;",
        ].join("");

        for (const line of this.lines) {
            const div = document.createElement("div");
            div.style.cssText = "color:#ffc2c2;";
            div.textContent = "- " + (line || " ");
            wrap.appendChild(div);
        }
        return wrap;
    }

    get estimatedHeight(): number {
        return this.lines.length * 21;
    }
}

// ── Build removed-line widgets ────────────────────────────────────────────────

function buildRemovedWidgets(diff: FileDiff | null): DecorationSet {
    if (!diff || diff.hunks.length === 0) return Decoration.none;

    const widgets: Array<Range<Decoration>> = [];

    for (const hunk of diff.hunks) {
        if (hunk.accepted === false) continue;

        // Group consecutive removed lines
        let removedGroup: string[] = [];
        let insertAfterNewLine: number | null = null;

        for (const line of hunk.lines) {
            if (line.type === "removed") {
                removedGroup.push(line.content);
                // Insert widget before the next added/context line
                const nextAdded = hunk.lines.find(
                    l => l.type !== "removed" && l.newLineNum != null
                );
                if (nextAdded?.newLineNum) {
                    insertAfterNewLine = nextAdded.newLineNum - 1;
                }
            }
        }

        if (removedGroup.length > 0 && insertAfterNewLine !== null) {
            // Clamp to valid line number
            const lineCount = 1; // Will be resolved at render time
            widgets.push(
                Decoration.widget({
                    widget: new RemovedLinesWidget(removedGroup),
                    side: -1,  // before the line
                    block: true,
                }).range(insertAfterNewLine)
            );
        }
    }

    widgets.sort((a, b) => a.from - b.from);

    const builder = new RangeSetBuilder<Decoration>();
    for (const w of widgets) builder.add(w.from, w.from, w.value);
    return builder.finish();
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const diffTheme = EditorView.theme({
    ".cm-diff-added": {
        backgroundColor: "rgba(63,185,80,0.10) !important",
        borderLeft: "2px solid #238636",
    },
    ".cm-diff-removed": {
        backgroundColor: "rgba(255,123,114,0.10) !important",
        borderLeft: "2px solid #da3633",
        textDecoration: "line-through",
        opacity: "0.6",
    },
    ".cm-diff-gutter": {
        width: "36px",
        backgroundColor: "#0d1117",
        borderRight: "1px solid #21262d",
    },
    ".cm-diff-gutter-actions": {
        cursor: "default",
    },
});

// ── Main export ───────────────────────────────────────────────────────────────
// Returns the complete extension array to add to CodeMirror.

export function diffDecorationExtension(
    onAccept: (hunkId: string, filePath: string) => void,
    onReject: (hunkId: string, filePath: string) => void,
    filePath: string,
): Extension {
    return [
        diffStateField,
        diffTheme,
        buildDiffGutter(
            (hunkId) => onAccept(hunkId, filePath),
            (hunkId) => onReject(hunkId, filePath),
        ),
        // Removed lines as block widgets
        EditorView.decorations.compute(
            [diffStateField],
            state => buildRemovedWidgets(state.field(diffStateField)),
        ),
    ];
}