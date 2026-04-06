import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// ── GitHub Dark palette (matches github-vscode-theme) ────────────────────────
//   https://github.com/primer/github-vscode-theme
const GH = {
    bg: "#141414",   // editor background
    bgPanel: "#141414",   // gutter, line highlight
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



// src/app/features/ide/extensions/theme.ts
// Updated palette — same structure, new colors matching the design

// import { EditorView } from "@codemirror/view";
// import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
// import { tags as t } from "@lezer/highlight";

// // ── Ayndrome Dark palette ─────────────────────────────────────────────────────
// // Warm dark greys base, IntelliJ/JetBrains-inspired syntax colors
// // that work harmoniously with the #1e1f22 / #2b2d30 shell
// const P = {
//     bg: "#141414",   // editor background — matches shell
//     bgPanel: "#141414",   // gutter, active line
//     bgSelection: "#214283",   // selection (JetBrains blue-ish)
//     border: "#3c3f41",   // dividers
//     fg: "#bcbec4",   // default text
//     fgSubtle: "#6f737a",   // comments, line numbers
//     fgInactive: "#4a4d52",   // fold markers, inactive

//     // Syntax — warm, low saturation, JetBrains-inspired
//     string: "#6a8759",   // strings — muted green
//     stringRe: "#6a8759",   // regex
//     keyword: "#cc7832",   // keywords — warm orange
//     keyword2: "#cc7832",   // control keywords
//     constant: "#6897bb",   // numbers, booleans — muted blue
//     func: "#ffc66d",   // function names — warm yellow
//     param: "#b8b08d",   // parameters — warm sand
//     typeClass: "#b8b08d",   // types, class names
//     property: "#9876aa",   // properties — muted purple
//     punctuation: "#bcbec4",   // brackets, commas
//     operator: "#bcbec4",   // operators
//     meta: "#bbb529",   // decorators — muted yellow
//     invalid: "#c75450",   // errors — muted red

//     cursor: "#bcbec4",
//     activeLine: "#26282e",
//     matchBracket: "#214283",
// } as const;

// export const githubDarkTheme = EditorView.theme(
//     {
//         "&": {
//             color: P.fg,
//             backgroundColor: P.bg,
//             height: "100%",
//             fontSize: "13px",
//             fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Menlo", monospace',
//         },
//         ".cm-content": {
//             caretColor: P.cursor,
//             padding: "8px 0",
//         },
//         ".cm-cursor, .cm-dropCursor": {
//             borderLeftColor: P.cursor,
//             borderLeftWidth: "2px",
//         },
//         "&.cm-focused .cm-cursor": { borderLeftColor: P.cursor },
//         "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
//             backgroundColor: P.bgSelection,
//         },
//         ".cm-panels": { backgroundColor: P.bgPanel, color: P.fg },
//         ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${P.border}` },
//         ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${P.border}` },

//         ".cm-searchMatch": {
//             backgroundColor: "#214283",
//             outline: `1px solid ${P.border}`,
//             borderRadius: "2px",
//         },
//         ".cm-searchMatch.cm-searchMatch-selected": {
//             backgroundColor: "#2145a0",
//         },

//         ".cm-activeLine": { backgroundColor: P.activeLine },
//         ".cm-selectionMatch": { backgroundColor: "#21428360" },

//         "&.cm-focused .cm-matchingBracket": {
//             backgroundColor: P.matchBracket,
//             outline: `1px solid #6897bb80`,
//             borderRadius: "2px",
//         },
//         "&.cm-focused .cm-nonmatchingBracket": {
//             backgroundColor: "#c7545020",
//         },

//         ".cm-gutters": {
//             backgroundColor: P.bg,
//             color: P.fgSubtle,
//             border: "none",
//             borderRight: `1px solid ${P.border}`,
//             minWidth: "40px",
//         },
//         ".cm-lineNumbers .cm-gutterElement": {
//             padding: "0 12px 0 8px",
//             minWidth: "32px",
//         },
//         ".cm-activeLineGutter": {
//             backgroundColor: P.bgPanel,
//             color: P.fg,
//         },
//         ".cm-foldPlaceholder": {
//             backgroundColor: "transparent",
//             border: "none",
//             color: P.fgInactive,
//         },

//         ".cm-scroller": { overflow: "auto" },
//         ".cm-scroller::-webkit-scrollbar": { width: "8px", height: "8px" },
//         ".cm-scroller::-webkit-scrollbar-track": { background: P.bg },
//         ".cm-scroller::-webkit-scrollbar-thumb": {
//             background: P.border,
//             borderRadius: "4px",
//         },

//         ".cm-tooltip": {
//             backgroundColor: "#2b2d30",
//             border: `1px solid ${P.border}`,
//             borderRadius: "6px",
//         },
//         ".cm-tooltip-autocomplete": {
//             "& > ul > li[aria-selected]": {
//                 backgroundColor: "#214283",
//                 color: P.fg,
//             },
//         },
//     },
//     { dark: true }
// );

// export const githubDarkHighlight = HighlightStyle.define([
//     { tag: t.comment, color: P.fgSubtle, fontStyle: "italic" },
//     { tag: t.lineComment, color: P.fgSubtle, fontStyle: "italic" },
//     { tag: t.blockComment, color: P.fgSubtle, fontStyle: "italic" },
//     { tag: t.docComment, color: P.fgSubtle, fontStyle: "italic" },

//     { tag: t.string, color: P.string },
//     { tag: t.special(t.string), color: P.string },
//     { tag: t.regexp, color: P.stringRe },
//     { tag: t.escape, color: P.constant },

//     { tag: t.keyword, color: P.keyword, fontWeight: "bold" },
//     { tag: t.moduleKeyword, color: P.keyword },
//     { tag: t.controlKeyword, color: P.keyword2 },
//     { tag: t.operatorKeyword, color: P.keyword2 },
//     { tag: t.definitionKeyword, color: P.keyword },
//     { tag: t.modifier, color: P.keyword },

//     { tag: t.name, color: P.fg },
//     { tag: t.variableName, color: P.fg },
//     { tag: t.definition(t.variableName), color: P.fg },
//     { tag: t.function(t.variableName), color: P.func },
//     { tag: t.definition(t.propertyName), color: P.func },

//     { tag: t.typeName, color: P.typeClass },
//     { tag: t.typeOperator, color: P.keyword },
//     { tag: t.className, color: P.typeClass },
//     { tag: t.namespace, color: P.typeClass },

//     { tag: t.propertyName, color: P.property },
//     { tag: t.attributeName, color: P.func },
//     { tag: t.attributeValue, color: P.string },

//     { tag: t.number, color: P.constant },
//     { tag: t.bool, color: P.constant, fontWeight: "bold" },
//     { tag: t.null, color: P.constant },
//     { tag: t.self, color: P.constant },

//     { tag: t.operator, color: P.operator },
//     { tag: t.punctuation, color: P.punctuation },
//     { tag: t.bracket, color: P.punctuation },
//     { tag: t.separator, color: P.fgSubtle },
//     { tag: t.derefOperator, color: P.operator },

//     { tag: t.special(t.variableName), color: P.param },
//     { tag: t.local(t.variableName), color: P.param },

//     { tag: t.meta, color: P.meta },
//     { tag: t.processingInstruction, color: P.meta },
//     { tag: t.annotation, color: P.meta },

//     { tag: t.tagName, color: P.keyword2 },
//     { tag: t.angleBracket, color: P.fgSubtle },
//     { tag: t.content, color: P.fg },
//     { tag: t.heading, color: P.func, fontWeight: "bold" },
//     { tag: t.link, color: P.string, textDecoration: "underline" },

//     { tag: t.invalid, color: P.invalid },
//     { tag: t.deleted, color: P.invalid },
//     { tag: t.inserted, color: "#59a869" },
//     { tag: t.changed, color: P.param },
// ]);

// export const githubDark = [
//     githubDarkTheme,
//     syntaxHighlighting(githubDarkHighlight),
// ];