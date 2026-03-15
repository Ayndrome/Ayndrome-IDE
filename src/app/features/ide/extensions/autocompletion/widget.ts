import { WidgetType } from "@codemirror/view";
import { EditorView } from "@codemirror/view";

// ── Exact GitHub Dark palette (from VS Code github-dark theme) ────────────────
const C = {
    PANEL: '#161b22',  // sidebar / inactive tab bg
    ELEVATED: '#21262d',  // input / button bg
    BORDER: '#30363d',  // standard border
    BORDER_SUB: '#21262d',  // subtle border
    FG_MUTED: '#8b949e',  // muted text — used for ghost suggestions
    FG_SUBTLE: '#6e7681',  // very dim label text
    BLUE: '#388bfd',  // active accent (tab indicator, links)
    BLUE_SOFT: 'rgba(56, 139, 253, 0.15)', // blue tint for badge bg
    BLUE_GLOW: 'rgba(56, 139, 253, 0.08)', // very subtle blue wash
};

// ── Global keyframe injection (once per page) ─────────────────────────────────
function injectStyles(): void {
    if (document.getElementById('ac-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-styles';
    s.textContent = `
        @keyframes ac-ghost-in {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @keyframes ac-box-in {
            from { opacity: 0; transform: translateY(-3px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ac-dot {
            0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); }
            40%           { opacity: 1;   transform: scale(1); }
        }
        .ac-wrapper { animation: ac-ghost-in 0.1s ease forwards; }
        .ac-box     { animation: ac-box-in   0.15s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ── SuggestionWidget ──────────────────────────────────────────────────────────

export class SuggestionWidget extends WidgetType {
    constructor(private suggestion: string) {
        super();
        injectStyles();
    }

    eq(other: SuggestionWidget): boolean {
        return other.suggestion === this.suggestion;
    }

    toDOM(): HTMLElement {
        const lines = this.suggestion.split('\n');
        const isMultiline = lines.length > 1;

        const wrapper = document.createElement('span');
        wrapper.setAttribute('aria-hidden', 'true');
        wrapper.className = 'ac-wrapper';
        wrapper.style.cssText = `
            display: inline;
            position: relative;
            pointer-events: none;
            user-select: none;
        `;

        if (isMultiline) {
            renderMultiline(wrapper, lines);
        } else {
            renderInline(wrapper, lines[0]);
        }

        return wrapper;
    }

    ignoreEvent(): boolean { return true; }
}

// ── Single-line: inline ghost text + Tab badge ────────────────────────────────

function renderInline(wrapper: HTMLElement, text: string): void {
    const ghost = document.createElement('span');
    ghost.style.cssText = `
        color: ${C.FG_MUTED};
        font-style: italic;
        white-space: pre;
        opacity: 0.75;
        letter-spacing: 0.005em;
    `;
    ghost.textContent = text;

    wrapper.appendChild(ghost);
    wrapper.appendChild(buildBadge());
}

// ── Multiline: floating panel below cursor, NO inline duplication ─────────────
//
// The box shows ALL suggestion lines (including line 0).
// We deliberately show NOTHING inline — only the box — to avoid the first
// line appearing twice (once inline, once at top of box).

function renderMultiline(wrapper: HTMLElement, lines: string[]): void {
    const box = document.createElement('span');
    box.className = 'ac-box';
    box.style.cssText = `
        display: inline-block;
        position: absolute;
        left: 0;
        top: 1.45em;
        z-index: 999;
        background: ${C.PANEL};
        border: 1px solid ${C.BORDER};
        border-left: 2px solid ${C.BLUE};
        border-radius: 0 4px 4px 4px;
        padding: 5px 12px 5px 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.2);
        font-style: italic;
        white-space: pre;
        min-width: 120px;
        max-width: min(620px, 90vw);
    `;

    // Render each line
    lines.forEach((line, idx) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            line-height: 1.65;
            color: ${C.FG_MUTED};
            opacity: ${idx === 0 ? '0.9' : '0.7'};
            font-size: inherit;
        `;

        const txt = document.createElement('span');
        txt.style.whiteSpace = 'pre';
        txt.textContent = line.length > 0 ? line : ' '; // preserve blank lines

        row.appendChild(txt);
        box.appendChild(row);
    });

    // Footer row: line count + Tab badge
    const footer = document.createElement('div');
    footer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid ${C.BORDER_SUB};
        gap: 8px;
    `;

    const linesLabel = document.createElement('span');
    linesLabel.textContent = `${lines.length} lines`;
    linesLabel.style.cssText = `
        font-size: 10px;
        font-style: normal;
        color: ${C.FG_SUBTLE};
        font-family: ui-monospace, monospace;
        letter-spacing: 0.02em;
    `;

    footer.appendChild(linesLabel);
    footer.appendChild(buildBadge());
    box.appendChild(footer);

    wrapper.appendChild(box);
}

// ── Tab / F2 "accept" badge ───────────────────────────────────────────────────

function buildBadge(): HTMLElement {
    const badge = document.createElement('span');
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        padding: 1px 6px 1px 5px;
        border-radius: 4px;
        background: ${C.BLUE_SOFT};
        border: 1px solid rgba(56, 139, 253, 0.3);
        font-size: 10px;
        font-style: normal;
        font-family: ui-monospace, monospace;
        line-height: 1.6;
        vertical-align: middle;
        pointer-events: none;
        user-select: none;
        flex-shrink: 0;
    `;

    const label = document.createElement('span');
    label.textContent = 'Tab';
    label.style.cssText = `
        color: ${C.BLUE};
        font-weight: 600;
        letter-spacing: 0.02em;
    `;

    badge.appendChild(label);
    return badge;
}

// ── Accept flash (called from keymap.ts after accepting) ──────────────────────

export function flashAcceptedText(
    view: EditorView,
    from: number,
    to: number
): void {
    const coords = view.coordsAtPos(from);
    const coordsEnd = view.coordsAtPos(to);
    if (!coords || !coordsEnd) return;

    const scroller = view.dom.querySelector('.cm-scroller') as HTMLElement | null;
    if (!scroller) return;
    if (getComputedStyle(scroller).position === 'static') {
        scroller.style.position = 'relative';
    }

    // Inject flash keyframes once
    if (!document.getElementById('ac-flash-style')) {
        const s = document.createElement('style');
        s.id = 'ac-flash-style';
        s.textContent = `
            @keyframes ac-flash {
                0%   { background: rgba(56,139,253,0.25); border-radius:3px; }
                60%  { background: rgba(56,139,253,0.12); border-radius:3px; }
                100% { background: transparent;            border-radius:3px; }
            }
        `;
        document.head.appendChild(s);
    }

    const editorRect = view.dom.getBoundingClientRect();
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: absolute;
        left:   ${coords.left - editorRect.left}px;
        top:    ${coords.top - editorRect.top}px;
        width:  ${Math.max(coordsEnd.right - coords.left, 16)}px;
        height: ${coords.bottom - coords.top + 1}px;
        pointer-events: none;
        z-index: 500;
        animation: ac-flash 0.55s ease forwards;
    `;
    scroller.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
}

// ── LoadingWidget ─────────────────────────────────────────────────────────────

export class LoadingWidget extends WidgetType {
    constructor() { super(); injectStyles(); }

    eq(): boolean { return true; }
    ignoreEvent(): boolean { return true; }

    toDOM(): HTMLElement {
        const wrap = document.createElement('span');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 3px;
            margin-left: 7px;
            padding: 2px 7px;
            border-radius: 4px;
            background: ${C.ELEVATED};
            border: 1px solid ${C.BORDER_SUB};
            vertical-align: middle;
            pointer-events: none;
            user-select: none;
        `;

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.textContent = '●';
            dot.style.cssText = `
                color: ${C.BLUE};
                font-size: 5px;
                display: inline-block;
                animation: ac-dot 1.1s ${i * 0.18}s infinite ease-in-out;
            `;
            wrap.appendChild(dot);
        }

        return wrap;
    }
}