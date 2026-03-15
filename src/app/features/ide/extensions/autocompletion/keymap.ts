import { EditorView, KeyBinding } from "@codemirror/view";
import { clearSuggestionEffect, acceptSuggestionEffect, suggestionState } from "./state";
import { markAccepted } from "./acceptTime";
import {
    getPrefixAndSuffixInfo,
    getAutocompletionMatchup,
    computeAcceptResult,
    type AutocompletionEntry,
    type AutocompletionMatchupBounds,
} from "./autocompletionService";
import { flashAcceptedText } from "./widget";

export function buildSuggestionKeymap(
    debounceRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>
): KeyBinding[] {
    return [
        {
            key: "Tab",
            run: (view) => acceptSuggestion(view, debounceRef),
        },
        {
            key: "F2",
            run: (view) => acceptSuggestion(view, debounceRef),
        },
        {
            key: "Escape",
            run: (view) => {
                const suggestion = view.state.field(suggestionState);
                if (!suggestion) return false;
                clearTimeout(debounceRef.current);
                view.dispatch({ effects: clearSuggestionEffect.of() });
                return true;
            },
        },
    ];
}

function acceptSuggestion(
    view: EditorView,
    debounceRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>
): boolean {
    const suggestion = view.state.field(suggestionState);
    if (!suggestion) return false;

    clearTimeout(debounceRef.current);
    const cursor = view.state.selection.main.head;

    // ── Multiline: bypass computeAcceptResult entirely ────────────────────────
    // computeAcceptResult → postprocessCompletion applies single-line Trim 4
    // which would strip everything after the first newline even with our fix,
    // because the redo-suffix/fill-middle type doesn't match 'multi-line-*'.
    // For multiline, a direct verbatim insert is always correct.
    if (suggestion.includes('\n')) {
        view.dispatch({
            changes: { from: cursor, to: cursor, insert: suggestion },
            effects: acceptSuggestionEffect.of(),
            selection: { anchor: cursor + suggestion.length },
            userEvent: "input.complete",
        });
        flashAcceptedText(view, cursor, cursor + suggestion.length);
        markAccepted();
        return true;
    }

    // ── Single-line: use computeAcceptResult for redo-suffix handling ─────────
    // redo-suffix: cursor is in the middle of a line and the suggestion rewrites
    // the rest of that line — computeAcceptResult calculates deleteCharCount.
    const doc = view.state.doc.toString();
    const prefixAndSuffix = getPrefixAndSuffixInfo(doc, cursor);

    const entry: AutocompletionEntry = {
        prefix: prefixAndSuffix.prefix,
        insertText: suggestion,
        type: "single-line-redo-suffix",
    };

    const matchup: AutocompletionMatchupBounds =
        getAutocompletionMatchup({
            prefix: prefixAndSuffix.prefix,
            autocompletion: entry,
        }) ?? { startIdx: 0, startLine: 0, startCharacter: 0 };

    const { insertText, deleteCharCount } = computeAcceptResult({
        matchup,
        autocompletion: entry,
        prefixAndSuffix,
    });

    view.dispatch({
        changes: {
            from: cursor,
            to: cursor + deleteCharCount,
            insert: insertText,
        },
        effects: acceptSuggestionEffect.of(),
        selection: { anchor: cursor + insertText.length },
        userEvent: "input.complete",
    });

    flashAcceptedText(view, cursor, cursor + insertText.length);
    markAccepted();
    return true;
}