// src/app/features/ide/extensions/editor/diff-decoration.ts
// CodeMirror extension that renders diff highlights directly in the editor.
// Green background for added lines (using correct doc.line().from positions).
// Inline block widget at top of each hunk with Accept/Reject buttons.
// Ghost red lines as block widgets for removed content.
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
  WidgetType,
} from "@codemirror/view";
import type { FileDiff } from "../chat/agent/diff-engine";

// ── Effects (dispatch these to update diff state in the editor) ───────────────

export const setDiffEffect = StateEffect.define<FileDiff | null>();
export const acceptHunkEffect = StateEffect.define<string>(); // hunkId
export const rejectHunkEffect = StateEffect.define<string>(); // hunkId

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
          hunks: current.hunks.map((h) =>
            h.id === effect.value ? { ...h, accepted: true } : h,
          ),
        };
      }
      if (effect.is(rejectHunkEffect)) {
        if (!current) return current;
        return {
          ...current,
          hunks: current.hunks.map((h) =>
            h.id === effect.value ? { ...h, accepted: false } : h,
          ),
        };
      }
    }
    return current;
  },
});

// ── Line background decorations ───────────────────────────────────────────────
// Uses EditorView.decorations.compute so we can access state.doc.line()
// which gives us the correct character position from a 1-based line number.

function buildLineDecorations(
  diff: FileDiff | null,
  state: import("@codemirror/state").EditorState,
): DecorationSet {
  if (!diff || diff.hunks.length === 0) return Decoration.none;

  const addedLineDeco = Decoration.line({ class: "cm-diff-added" });
  const builder = new RangeSetBuilder<Decoration>();
  const decos: Array<Range<Decoration>> = [];

  const totalLines = state.doc.lines;

  for (const hunk of diff.hunks) {
    if (hunk.accepted === false) continue;

    for (const line of hunk.lines) {
      if (line.type === "added" && line.newLineNum != null) {
        const lineNum = line.newLineNum;
        if (lineNum < 1 || lineNum > totalLines) continue;
        // Correct API: resolve the character position of the line start
        const from = state.doc.line(lineNum).from;
        decos.push(addedLineDeco.range(from));
      }
    }
  }

  // Sort by position (required by RangeSetBuilder)
  decos.sort((a, b) => a.from - b.from);
  // Deduplicate (same line could appear in overlapping hunks)
  const seen = new Set<number>();
  for (const d of decos) {
    if (seen.has(d.from)) continue;
    seen.add(d.from);
    builder.add(d.from, d.from, d.value);
  }

  return builder.finish();
}

// ── Hunk action widget ─────────────────────────────────────────────────────────
// Rendered as a block widget BEFORE the first added line of each hunk.
// This appears inline in the editor content (above the green lines),
// NOT in the gutter, so it never conflicts with the line number gutter.

class HunkActionWidget extends WidgetType {
  constructor(
    private hunkId: string,
    private accepted: boolean | null,
    private oldStart: number,
    private oldCount: number,
    private newStart: number,
    private newCount: number,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const o = other as HunkActionWidget;
    return this.hunkId === o.hunkId && this.accepted === o.accepted;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-diff-hunk-header";
    wrap.style.cssText = [
      "display:flex;align-items:center;justify-content:space-between;",
      "padding:1px 8px;",
      "background:#161b22;",
      "border-top:1px solid #30363d;",
      "border-bottom:1px solid #21262d;",
      "font-family:var(--font-mono,monospace);",
      "font-size:11px;",
      "color:#6e7681;",
      "user-select:none;",
      "min-height:20px;",
    ].join("");

    const label = document.createElement("span");
    label.textContent = `@@ -${this.oldStart},${this.oldCount} +${this.newStart},${this.newCount} @@`;
    wrap.appendChild(label);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:4px;";

    if (this.accepted === true) {
      const badge = document.createElement("span");
      badge.textContent = "✓ Accepted";
      badge.style.cssText =
        "font-size:10px;color:#3fb950;font-weight:600;padding:0 4px;";
      actions.appendChild(badge);
    } else if (this.accepted === false) {
      const badge = document.createElement("span");
      badge.textContent = "✕ Rejected";
      badge.style.cssText =
        "font-size:10px;color:#ff7b72;font-weight:600;padding:0 4px;";
      actions.appendChild(badge);
    } else {
      // Undecided — show accept/reject buttons
      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "✓ Accept";
      acceptBtn.title = "Accept this change";
      acceptBtn.dataset.hunkId = this.hunkId;
      acceptBtn.dataset.action = "accept";
      acceptBtn.style.cssText = [
        "font-size:10px;font-weight:600;",
        "padding:1px 6px;border-radius:3px;cursor:pointer;",
        "background:rgba(35,134,54,0.15);color:#3fb950;",
        "border:1px solid rgba(35,134,54,0.35);",
        "line-height:1.4;",
      ].join("");

      const rejectBtn = document.createElement("button");
      rejectBtn.textContent = "✕ Reject";
      rejectBtn.title = "Reject this change";
      rejectBtn.dataset.hunkId = this.hunkId;
      rejectBtn.dataset.action = "reject";
      rejectBtn.style.cssText = [
        "font-size:10px;font-weight:600;",
        "padding:1px 6px;border-radius:3px;cursor:pointer;",
        "background:rgba(218,54,51,0.15);color:#ff7b72;",
        "border:1px solid rgba(218,54,51,0.35);",
        "line-height:1.4;",
      ].join("");

      actions.appendChild(acceptBtn);
      actions.appendChild(rejectBtn);
    }

    wrap.appendChild(actions);
    return wrap;
  }

  get estimatedHeight(): number {
    return 22;
  }
  ignoreEvent(_event: Event): boolean {
    return false;
  }
}

// ── Build hunk header widgets ─────────────────────────────────────────────────

function buildHunkHeaderWidgets(
  diff: FileDiff | null,
  state: import("@codemirror/state").EditorState,
  onAccept: (hunkId: string) => void,
  onReject: (hunkId: string) => void,
): DecorationSet {
  if (!diff || diff.hunks.length === 0) return Decoration.none;

  const widgets: Array<Range<Decoration>> = [];
  const totalLines = state.doc.lines;

  for (const hunk of diff.hunks) {
    // Find the first new-file line in this hunk
    const firstNewLine = hunk.lines.find((l) => l.newLineNum != null);
    if (!firstNewLine?.newLineNum) continue;

    const lineNum = firstNewLine.newLineNum;
    if (lineNum < 1 || lineNum > totalLines) continue;

    const from = state.doc.line(lineNum).from;

    widgets.push(
      Decoration.widget({
        widget: new HunkActionWidget(
          hunk.id,
          hunk.accepted,
          hunk.oldStart,
          hunk.oldCount,
          hunk.newStart,
          hunk.newCount,
        ),
        side: -1, // before the line
        block: true,
      }).range(from),
    );
  }

  widgets.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const w of widgets) builder.add(w.from, w.from, w.value);
  return builder.finish();
}

// ── Removed-line widget ───────────────────────────────────────────────────────
// Renders deleted lines as red ghost lines BEFORE the position where they were.

class RemovedLinesWidget extends WidgetType {
  constructor(private lines: string[]) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      this.lines.join("\n") === (other as RemovedLinesWidget).lines.join("\n")
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-diff-removed-widget";
    wrap.style.cssText = [
      "background:rgba(255,123,114,0.06);",
      "border-left:2px solid #da3633;",
      "font-family:var(--cm-font-family,monospace);",
      "font-size:var(--cm-font-size,13px);",
      "line-height:1.6;",
      "white-space:pre;",
      "opacity:0.75;",
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
// Fixed: properly groups consecutive removed lines and inserts widget
// before the next added/context line that follows the removal block.

function buildRemovedWidgets(
  diff: FileDiff | null,
  state: import("@codemirror/state").EditorState,
): DecorationSet {
  if (!diff || diff.hunks.length === 0) return Decoration.none;

  const widgets: Array<Range<Decoration>> = [];
  const totalLines = state.doc.lines;

  for (const hunk of diff.hunks) {
    if (hunk.accepted === false) continue;

    let removedGroup: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === "removed") {
        removedGroup.push(line.content);
      } else {
        // Flush group before this non-removed line
        if (removedGroup.length > 0 && line.newLineNum != null) {
          const lineNum = line.newLineNum;
          if (lineNum >= 1 && lineNum <= totalLines) {
            const from = state.doc.line(lineNum).from;
            widgets.push(
              Decoration.widget({
                widget: new RemovedLinesWidget([...removedGroup]),
                side: -1,
                block: true,
              }).range(from),
            );
          }
          removedGroup = [];
        }
      }
    }

    // If hunk ends with removed lines (deletion at end of hunk)
    // Insert widget after the last context/added line before it
    if (removedGroup.length > 0) {
      // Find the last added/context line in this hunk
      const lastNewLine = [...hunk.lines]
        .reverse()
        .find((l) => l.type !== "removed" && l.newLineNum != null);

      const insertLine = lastNewLine?.newLineNum ?? hunk.newStart;
      const lineNum = Math.min(insertLine + 1, totalLines);
      if (lineNum >= 1 && lineNum <= totalLines) {
        const from = state.doc.line(lineNum).from;
        widgets.push(
          Decoration.widget({
            widget: new RemovedLinesWidget([...removedGroup]),
            side: -1,
            block: true,
          }).range(from),
        );
      }
      removedGroup = [];
    }
  }

  widgets.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const w of widgets) builder.add(w.from, w.from, w.value);
  return builder.finish();
}

// ── Event handler for hunk actions ───────────────────────────────────────────
// Listens for clicks on Accept/Reject buttons inside the block widgets.

function buildClickHandler(
  onAccept: (hunkId: string) => void,
  onReject: (hunkId: string) => void,
): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
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
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const diffTheme = EditorView.theme({
  ".cm-diff-added": {
    backgroundColor: "#133627 !important",
    // borderLeft: "2px solid #238636",
  },
  ".cm-diff-hunk-header": {
    display: "block",
  },
});

// ── Main export ───────────────────────────────────────────────────────────────

export function diffDecorationExtension(
  onAccept: (hunkId: string, filePath: string) => void,
  onReject: (hunkId: string, filePath: string) => void,
  filePath: string,
): Extension {
  const wrappedAccept = (hunkId: string) => onAccept(hunkId, filePath);
  const wrappedReject = (hunkId: string) => onReject(hunkId, filePath);

  return [
    diffStateField,
    diffTheme,

    // Correct line background highlights
    EditorView.decorations.compute([diffStateField], (state) =>
      buildLineDecorations(state.field(diffStateField), state),
    ),

    // Inline hunk header + accept/reject buttons
    EditorView.decorations.compute([diffStateField], (state) =>
      buildHunkHeaderWidgets(
        state.field(diffStateField),
        state,
        wrappedAccept,
        wrappedReject,
      ),
    ),

    // Ghost removed-line widgets
    EditorView.decorations.compute([diffStateField], (state) =>
      buildRemovedWidgets(state.field(diffStateField), state),
    ),

    // Click handler for accept/reject buttons
    buildClickHandler(wrappedAccept, wrappedReject),
  ];
}
