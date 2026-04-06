// src/app/features/ide/extensions/editor/streaming-writer.ts
// Manages live streaming of agent-generated content into the CodeMirror editor.
// The agent calls stream_write_file_chunk repeatedly, each chunk gets
// applied to the editor document in real time as tokens arrive.
// When streaming ends, the diff decorations appear for review.

import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";

// ── Effects ───────────────────────────────────────────────────────────────────

// Fired once at start — replaces doc with empty + shows cursor
export const streamStartEffect = StateEffect.define<{
    filePath: string;
    oldContent: string;
}>();

// Fired for each chunk — appends text at end of doc
export const streamChunkEffect = StateEffect.define<string>();

// Fired when streaming is complete — triggers diff decoration
export const streamEndEffect = StateEffect.define<{
    filePath: string;
    newContent: string;
    oldContent: string;
}>();

// Fired to cancel streaming (abort signal)
export const streamAbortEffect = StateEffect.define<void>();

// ── Streaming cursor decoration ───────────────────────────────────────────────

import {
    Decoration,
    DecorationSet,
    WidgetType,

} from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";

class StreamCursorWidget extends WidgetType {
    toDOM(): HTMLElement {
        const span = document.createElement("span");
        span.className = "cm-stream-cursor";
        span.style.cssText = [
            "display:inline-block;",
            "width:2px;height:1.1em;",
            "background:#58a6ff;",
            "margin-left:1px;",
            "vertical-align:text-bottom;",
            "animation:cm-cursor-blink 0.8s step-end infinite;",
        ].join("");
        return span;
    }
    eq(): boolean { return true; }
}

export const streamingStateField = StateField.define<{
    isStreaming: boolean;
    cursorPos: number;
}>({
    create: () => ({ isStreaming: false, cursorPos: 0 }),
    update(state, tr) {
        for (const effect of tr.effects) {
            if (effect.is(streamStartEffect)) {
                return { isStreaming: true, cursorPos: 0 };
            }
            if (effect.is(streamChunkEffect)) {
                return {
                    isStreaming: true,
                    cursorPos: tr.newDoc.length,
                };
            }
            if (effect.is(streamEndEffect) || effect.is(streamAbortEffect)) {
                return { isStreaming: false, cursorPos: 0 };
            }
        }
        return state;
    },
    provide: field => EditorView.decorations.from(field, state => {
        if (!state.isStreaming || state.cursorPos === 0) return Decoration.none;

        const builder = new RangeSetBuilder<Decoration>();
        builder.add(
            state.cursorPos,
            state.cursorPos,
            Decoration.widget({ widget: new StreamCursorWidget(), side: 1 })
        );
        return builder.finish();
    }),
});

// ── Line highlight during streaming ──────────────────────────────────────────

const streamingLineDeco = Decoration.line({
    class: "cm-streaming-line",
});

export const streamingLineField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decos, tr) {
        for (const effect of tr.effects) {
            if (effect.is(streamChunkEffect)) {
                // Highlight last line being written
                const lastLine = tr.newDoc.line(tr.newDoc.lines);
                const builder = new RangeSetBuilder<Decoration>();
                builder.add(lastLine.from, lastLine.from, streamingLineDeco);
                return builder.finish();
            }
            if (effect.is(streamEndEffect) || effect.is(streamAbortEffect)) {
                return Decoration.none;
            }
        }
        return decos.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});

// ── Theme ─────────────────────────────────────────────────────────────────────

import { EditorView as EV } from "@codemirror/view";

export const streamingTheme = EV.theme({
    ".cm-streaming-line": {
        backgroundColor: "rgba(56,139,253,0.06) !important",
        borderLeft: "2px solid rgba(56,139,253,0.4)",
    },
    "@keyframes cm-cursor-blink": {
        "0%, 100%": { opacity: "1" },
        "50%": { opacity: "0" },
    },
});

// ── Extension bundle ──────────────────────────────────────────────────────────

import type { Extension } from "@codemirror/state";

export function streamingWriterExtension(): Extension {
    return [
        streamingStateField,
        streamingLineField,
        streamingTheme,
    ];
}