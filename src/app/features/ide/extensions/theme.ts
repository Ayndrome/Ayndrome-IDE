import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// ── GitHub Dark palette (matches github-vscode-theme) ────────────────────────
//   https://github.com/primer/github-vscode-theme
const GH = {
    bg: "#0d1117",   // editor background
    bgPanel: "#161b22",   // gutter, line highlight
    bgSelection: "#264f7840", // selection
    border: "#30363d",   // dividers
    fg: "#e6edf3",   // default text
    fgSubtle: "#8b949e",   // comments, line numbers
    fgInactive: "#484f58",   // inactive, fold markers
    string: "#a5d6ff",   // strings, template literals
    stringRe: "#ff7b72",   // regex literals (same as keyword)
    keyword: "#ff7b72",   // keywords: import, return, …
    keyword2: "#f47067",   // control: if, for, while
    constant: "#79c0ff",   // numeric, boolean, this, null
    func: "#d2a8ff",   // function names
    param: "#ffa657",   // parameters, variables
    typeClass: "#ffa657",   // type annotations, class names
    property: "#79c0ff",   // object keys / properties
    punctuation: "#e6edf3",   // brackets, commas
    operator: "#ff7b72",   // operators
    meta: "#e3b341",   // decorators, meta
    invalid: "#f85149",   // invalid tokens
    cursor: "#e6edf3",
    activeLine: "#161b2260",
    matchBracket: "#264f78",
} as const;

// ── CodeMirror EditorView theme (UI chrome) ───────────────────────────────────
export const githubDarkTheme = EditorView.theme(
    {
        "&": {
            color: GH.fg,
            backgroundColor: GH.bg,
            height: "100%",
            fontSize: "13px",
            fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Menlo", monospace',
        },
        ".cm-content": {
            caretColor: GH.cursor,
            padding: "8px 0",
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: GH.cursor,
            borderLeftWidth: "2px",
        },
        "&.cm-focused .cm-cursor": { borderLeftColor: GH.cursor },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
            backgroundColor: GH.bgSelection,
        },
        ".cm-panels": { backgroundColor: GH.bgPanel, color: GH.fg },
        ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${GH.border}` },
        ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${GH.border}` },

        // Search highlight
        ".cm-searchMatch": {
            backgroundColor: "#264f7860",
            outline: `1px solid ${GH.border}`,
            borderRadius: "2px",
        },
        ".cm-searchMatch.cm-searchMatch-selected": {
            backgroundColor: "#264f78a0",
        },

        // Active line
        ".cm-activeLine": { backgroundColor: GH.activeLine },
        ".cm-selectionMatch": { backgroundColor: "#264f7840" },

        // Brackets
        "&.cm-focused .cm-matchingBracket": {
            backgroundColor: GH.matchBracket,
            outline: `1px solid #79c0ff80`,
            borderRadius: "2px",
        },
        "&.cm-focused .cm-nonmatchingBracket": {
            backgroundColor: "#f8514920",
        },

        // Gutter
        ".cm-gutters": {
            backgroundColor: GH.bg,
            color: GH.fgSubtle,
            border: "none",
            borderRight: `1px solid ${GH.border}`,
            minWidth: "40px",
        },
        ".cm-lineNumbers .cm-gutterElement": {
            padding: "0 12px 0 8px",
            minWidth: "32px",
        },
        ".cm-activeLineGutter": {
            backgroundColor: GH.bgPanel,
            color: GH.fg,
        },

        // Fold gutter
        ".cm-foldPlaceholder": {
            backgroundColor: "transparent",
            border: "none",
            color: GH.fgInactive,
        },

        // Scrollbar
        ".cm-scroller": { overflow: "auto" },
        ".cm-scroller::-webkit-scrollbar": { width: "8px", height: "8px" },
        ".cm-scroller::-webkit-scrollbar-track": { background: GH.bg },
        ".cm-scroller::-webkit-scrollbar-thumb": {
            background: GH.border,
            borderRadius: "4px",
        },

        // Tooltip / autocomplete
        ".cm-tooltip": {
            backgroundColor: "#1c2128",
            border: `1px solid ${GH.border}`,
            borderRadius: "6px",
        },
        ".cm-tooltip-autocomplete": {
            "& > ul > li[aria-selected]": {
                backgroundColor: "#264f78",
                color: GH.fg,
            },
        },
    },
    { dark: true }
);

// ── Syntax highlight rules ─────────────────────────────────────────────────────
export const githubDarkHighlight = HighlightStyle.define([
    // Comments
    { tag: t.comment, color: GH.fgSubtle, fontStyle: "italic" },
    { tag: t.lineComment, color: GH.fgSubtle, fontStyle: "italic" },
    { tag: t.blockComment, color: GH.fgSubtle, fontStyle: "italic" },
    { tag: t.docComment, color: GH.fgSubtle, fontStyle: "italic" },

    // Strings
    { tag: t.string, color: GH.string },
    { tag: t.special(t.string), color: GH.string },
    { tag: t.regexp, color: GH.stringRe },
    { tag: t.escape, color: GH.constant },

    // Keywords
    { tag: t.keyword, color: GH.keyword, fontWeight: "bold" },
    { tag: t.moduleKeyword, color: GH.keyword },
    { tag: t.controlKeyword, color: GH.keyword2 },
    { tag: t.operatorKeyword, color: GH.keyword2 },
    { tag: t.definitionKeyword, color: GH.keyword },
    { tag: t.modifier, color: GH.keyword },

    // Names
    { tag: t.name, color: GH.fg },
    { tag: t.variableName, color: GH.fg },
    { tag: t.definition(t.variableName), color: GH.fg },
    { tag: t.function(t.variableName), color: GH.func },
    { tag: t.definition(t.propertyName), color: GH.func },

    // Types / Classes
    { tag: t.typeName, color: GH.typeClass },
    { tag: t.typeOperator, color: GH.keyword },
    { tag: t.className, color: GH.typeClass },
    { tag: t.namespace, color: GH.typeClass },

    // Properties / attributes
    { tag: t.propertyName, color: GH.property },
    { tag: t.attributeName, color: GH.func },
    { tag: t.attributeValue, color: GH.string },

    // Number / bool / null / this
    { tag: t.number, color: GH.constant },
    { tag: t.bool, color: GH.constant, fontWeight: "bold" },
    { tag: t.null, color: GH.constant },
    { tag: t.self, color: GH.constant },

    // Operators & punctuation
    { tag: t.operator, color: GH.operator },
    { tag: t.punctuation, color: GH.punctuation },
    { tag: t.bracket, color: GH.punctuation },
    { tag: t.separator, color: GH.fgSubtle },
    { tag: t.derefOperator, color: GH.operator },

    // Params
    { tag: t.special(t.variableName), color: GH.param },
    { tag: t.local(t.variableName), color: GH.param },

    // Meta / decorator
    { tag: t.meta, color: GH.meta },
    { tag: t.processingInstruction, color: GH.meta },
    { tag: t.annotation, color: GH.meta },

    // Markup (HTML/JSX)
    { tag: t.tagName, color: GH.keyword2 },
    { tag: t.angleBracket, color: GH.fgSubtle },
    { tag: t.content, color: GH.fg },
    { tag: t.heading, color: GH.func, fontWeight: "bold" },
    { tag: t.link, color: GH.string, textDecoration: "underline" },

    // Invalid
    { tag: t.invalid, color: GH.invalid },
    { tag: t.deleted, color: GH.invalid },
    { tag: t.inserted, color: "#3fb950" },
    { tag: t.changed, color: GH.param },
]);

/** Drop-in extension: combine UI theme + syntax highlighting */
export const githubDark = [
    githubDarkTheme,
    syntaxHighlighting(githubDarkHighlight),
];

