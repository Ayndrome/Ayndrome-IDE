import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { tags as t } from "@lezer/highlight";

// ── Cursor / VS Code Dark+ palette ───────────────────────────────────────────
// Matches the default Cursor dark theme exactly (VS Code Dark+ variant).
// Colors verified against the Cursor screenshot.
const GH = {
  bg: "#181818", // editor + gutter background
  bgPanel: "#181818", // gutter, active line bg
  bgSelection: "#264f7880", // selection highlight (blue-ish)
  border: "#3c3c3c", // gutter border / dividers
  fg: "#d4d4d4", // default text — warm light gray
  fgSubtle: "#858585", // line numbers
  fgInactive: "#4a4a4a", // indent guides, fold markers

  // Syntax
  string: "#ce9178", // strings — warm orange
  stringRe: "#d16969", // regex literals — muted red
  keyword: "#569cd6", // const, let, var, return, new, typeof — blue
  keyword2: "#c586c0", // import, export, if, for, while, async — purple
  constant: "#b5cea8", // numbers — mint green
  func: "#dcdcaa", // function / method names — yellow
  param: "#9cdcfe", // parameters, local variables, properties — light blue
  typeClass: "#4ec9b0", // type names, class names — teal
  property: "#9cdcfe", // object keys / properties — light blue
  punctuation: "#d4d4d4", // brackets, commas — default
  operator: "#d4d4d4", // operators
  meta: "#dcdcaa", // decorators — yellow
  invalid: "#f44747", // errors

  cursor: "#d4d4d4",
  activeLine: "#2a2d2e", // subtle active line
  matchBracket: "#0d3a58", // bracket pair highlight
} as const;

// ── CodeMirror EditorView theme (UI chrome) ───────────────────────────────────
export const githubDarkTheme = EditorView.theme(
  {
    "&": {
      color: GH.fg,
      backgroundColor: GH.bg,
      height: "100%",
      fontSize: "13px",
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "Fira Code", "Menlo", monospace',
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
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: GH.bgSelection,
      },
    ".cm-panels": { backgroundColor: GH.bgPanel, color: GH.fg },
    ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${GH.border}` },
    ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${GH.border}` },

    // Search highlight
    ".cm-searchMatch": {
      backgroundColor: "#613214",
      outline: `1px solid ${GH.border}`,
      borderRadius: "2px",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#264f78",
    },

    // Active line
    ".cm-activeLine": { backgroundColor: GH.activeLine },
    ".cm-selectionMatch": { backgroundColor: "#3a3d41" },

    // Brackets
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: GH.matchBracket,
      outline: `1px solid #569cd680`,
      borderRadius: "2px",
    },
    "&.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#f4474730",
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
      color: GH.fgSubtle,
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
      backgroundColor: "#252526",
      border: `1px solid #454545`,
      borderRadius: "4px",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#04395e",
        color: GH.fg,
      },
    },
  },
  { dark: true },
);

// ── Syntax highlight rules — Cursor / VS Code Dark+ ───────────────────────────
export const githubDarkHighlight = HighlightStyle.define([
  // Comments — green, italic (like VS Code)
  { tag: t.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.lineComment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.blockComment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.docComment, color: "#6a9955", fontStyle: "italic" },

  // Strings — warm orange
  { tag: t.string, color: GH.string },
  { tag: t.special(t.string), color: GH.string },
  { tag: t.regexp, color: GH.stringRe },
  { tag: t.escape, color: "#d7ba7d" }, // escape sequences — gold

  // Keywords — blue (const, let, var, return, function, new, typeof)
  { tag: t.keyword, color: GH.keyword },
  { tag: t.definitionKeyword, color: GH.keyword },
  { tag: t.modifier, color: GH.keyword },
  // Module / control flow — purple (import, export, if, for, while, async, await)
  { tag: t.moduleKeyword, color: GH.keyword2 },
  { tag: t.controlKeyword, color: GH.keyword2 },
  { tag: t.operatorKeyword, color: GH.keyword2 },

  // Identifiers
  { tag: t.name, color: GH.fg },
  { tag: t.variableName, color: GH.fg },
  { tag: t.definition(t.variableName), color: GH.fg },
  // Function / method names — yellow
  { tag: t.function(t.variableName), color: GH.func },
  { tag: t.definition(t.propertyName), color: GH.func },
  { tag: t.function(t.propertyName), color: GH.func },

  // Types / Classes — teal
  { tag: t.typeName, color: GH.typeClass },
  { tag: t.typeOperator, color: GH.keyword },
  { tag: t.className, color: GH.typeClass },
  { tag: t.namespace, color: GH.typeClass },

  // Properties / attributes — light blue
  { tag: t.propertyName, color: GH.property },
  { tag: t.attributeName, color: GH.property },
  { tag: t.attributeValue, color: GH.string },

  // Numbers — mint green; booleans / null — blue (like VS Code)
  { tag: t.number, color: GH.constant },
  { tag: t.bool, color: GH.keyword }, // true / false — blue
  { tag: t.null, color: GH.keyword }, // null / undefined — blue
  { tag: t.self, color: GH.keyword2 }, // this — purple

  // Operators & punctuation
  { tag: t.operator, color: GH.operator },
  { tag: t.punctuation, color: GH.punctuation },
  { tag: t.bracket, color: GH.punctuation },
  { tag: t.separator, color: GH.fgSubtle },
  { tag: t.derefOperator, color: GH.operator },

  // Parameters, local vars — light blue
  { tag: t.special(t.variableName), color: GH.param },
  { tag: t.local(t.variableName), color: GH.param },

  // Meta / decorators — yellow
  { tag: t.meta, color: GH.meta },
  { tag: t.processingInstruction, color: GH.meta },
  { tag: t.annotation, color: GH.meta },

  // Markup (HTML / JSX)
  { tag: t.tagName, color: GH.keyword2 }, // tag names — purple
  { tag: t.angleBracket, color: GH.fgSubtle },
  { tag: t.content, color: GH.fg },
  { tag: t.heading, color: GH.func, fontWeight: "bold" },
  { tag: t.link, color: GH.string, textDecoration: "underline" },

  // Invalid / diff
  { tag: t.invalid, color: GH.invalid },
  { tag: t.deleted, color: GH.invalid },
  { tag: t.inserted, color: "#b5cea8" },
  { tag: t.changed, color: GH.param },
]);

/** Drop-in extension: combine UI theme + syntax highlighting */
export const githubDark = [
  githubDarkTheme,
  syntaxHighlighting(githubDarkHighlight),
];

// ── Indentation markers — subtle, theme-matched ───────────────────────────────
// Inactive guides: barely-visible dark line blending into bg (#1e1e1e → #2a2a2a)
// Active-block guide: the user's chosen #3b82f6 accent (subtle blue)
export const githubDarkIndentMarkers = indentationMarkers({
  colors: {
    light: "#343a40", // inactive guide — very subtle
    dark: "#343a40", // inactive guide — very subtle
    activeLight: "#343a40", // active-block guide — subtle blue accent
    activeDark: "#343a40",
  },
  highlightActiveBlock: true,
  hideFirstIndent: false,
});
