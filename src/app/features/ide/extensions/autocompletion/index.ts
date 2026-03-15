import { Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
    suggestionState,
    suggestionLoadingState,
    setSuggestionEffect,
    clearSuggestionEffect,
    suggestionLoadingEffect,
} from "./state";
import { suggestionPlugin } from "./plugin";
import { buildSuggestionKeymap } from "./keymap";
import { fetchSuggestion } from "./summon";
import { cache, findCacheMatch } from "./cache";
import { requestManager } from "./requestManager";
import { lastAcceptTime } from "./acceptTime";
import {
    getPrefixAndSuffixInfo,
    getCompletionOptions,
    getAutocompletionMatchup,
    postprocessCompletion,
    processStartAndEndSpaces,
    type AutocompletionEntry,
    type AutocompletionMatchupBounds,
} from "./autocompletionService";

// Re-export so consumers need only one import path
export {
    suggestionState,
    suggestionLoadingState,
    setSuggestionEffect,
    acceptSuggestionEffect,
    clearSuggestionEffect,
    suggestionLoadingEffect,
} from "./state";
export { markAccepted } from "./acceptTime";

const DEBOUNCE_MS = 500;

// ── Request counter for log correlation ────────────────────────────────────────
let _reqId = 0;

// -1  = no request currently in-flight.
// ≥0  = the cursor head position when the current request was made.
let inFlightCursor = -1;

// ── Log helper ─────────────────────────────────────────────────────────────────
// Prefix all logs so they're easy to filter in DevTools: type "AC|" in filter
const tag = (reqId?: number) => reqId !== undefined ? `AC|#${reqId}` : 'AC|cursor';

interface SuggestionOptions {
    fileName: string;
    debounceRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>;
}

export function suggestions({ fileName, debounceRef }: SuggestionOptions): Extension {

    const updateListener = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (!update.transactions.some(tr =>
            tr.isUserEvent("input") || tr.isUserEvent("delete")
        )) return;

        clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            const reqId = ++_reqId;
            const view = update.view;
            if (!view || view.state.doc.length === 0) return;

            const doc = view.state.doc.toString();
            const cursorPos = view.state.selection.main.head;
            const snapshotDoc = doc;
            const snapshotCursor = cursorPos;

            console.log(`${tag(reqId)} ▶ DEBOUNCE FIRED  cursor=${cursorPos}  docLen=${doc.length}`);

            // ── 1. Build context ─────────────────────────────────────────
            const prefixAndSuffix = getPrefixAndSuffixInfo(doc, cursorPos);

            // ── 2. Decide what to generate ───────────────────────────────
            const justAccepted = Date.now() - lastAcceptTime < 5000;
            const options = getCompletionOptions(prefixAndSuffix, justAccepted);

            console.log(`${tag(reqId)} 📋 completionOptions: type=${options.predictionType}  shouldGenerate=${options.shouldGenerate}  leftOfCursor="${prefixAndSuffix.prefixToTheLeftOfCursor.slice(-30)}"  rightOfCursor="${prefixAndSuffix.suffixToTheRightOfCursor.slice(0, 20)}"`);

            if (!options.shouldGenerate) {
                console.log(`${tag(reqId)} ✗ SKIP — shouldGenerate=false (type="${options.predictionType}")`);
                view.dispatch({ effects: clearSuggestionEffect.of() });
                return;
            }

            // ── 3. Try the LRU cache first ───────────────────────────────
            const cached = findCacheMatch(prefixAndSuffix.prefix);
            if (cached?.status === "finished" && cached.suggestion) {
                const entry: AutocompletionEntry = {
                    prefix: cached.prefix,
                    insertText: cached.suggestion,
                    type: options.predictionType,
                };
                const matchup = getAutocompletionMatchup({
                    prefix: prefixAndSuffix.prefix,
                    autocompletion: entry,
                });
                if (matchup) {
                    const processed = postprocessCompletion({
                        matchup,
                        autocompletion: entry,
                        prefixAndSuffix,
                    });
                    if (processed) {
                        console.log(`${tag(reqId)} ⚡ CACHE HIT — suggestion="${processed.slice(0, 40)}"`);
                        view.dispatch({ effects: setSuggestionEffect.of(processed) });
                        return;
                    }
                }
                console.log(`${tag(reqId)} 🗃  CACHE matched but postprocess returned empty`);
            }

            // ── 4. Fetch from AI ─────────────────────────────────────────
            view.dispatch({ effects: suggestionLoadingEffect.of(true) });
            const signal = requestManager.start();
            inFlightCursor = cursorPos;

            console.log(`${tag(reqId)} 🌐 FETCH START  inFlightCursor=${inFlightCursor}`);
            const t0 = performance.now();

            try {
                const raw = await fetchSuggestion(
                    {
                        fileName,
                        code: options.llmPrefix + options.llmSuffix,
                        cursor: cursorPos,
                        currentLine: prefixAndSuffix.prefixToTheLeftOfCursor,
                        previousLines: options.llmPrefix,
                        textBeforeCursor: prefixAndSuffix.prefixToTheLeftOfCursor,
                        textAfterCursor: prefixAndSuffix.suffixToTheRightOfCursor,
                        nextLines: options.llmSuffix,
                        lineNumber: prefixAndSuffix.prefixLines.length,
                        completionType: options.predictionType,
                        stopTokens: options.stopTokens,
                    },
                    signal
                );

                const elapsed = (performance.now() - t0).toFixed(0);
                console.log(`${tag(reqId)} 📡 FETCH END  ${elapsed}ms  raw="${String(raw).slice(0, 60)}"  signal.aborted=${signal.aborted}`);

                // ── Stale-response guards ────────────────────────────────
                if (signal.aborted) {
                    console.log(`${tag(reqId)} ✗ STALE — signal aborted`);
                    return;
                }
                try { if (view.state.doc.length === 0) return; } catch {
                    console.log(`${tag(reqId)} ✗ STALE — view destroyed`);
                    return;
                }
                if (view.state.selection.main.head !== snapshotCursor) {
                    console.log(`${tag(reqId)} ✗ STALE — cursor moved: was ${snapshotCursor} now ${view.state.selection.main.head}`);
                    return;
                }
                if (view.state.doc.toString() !== snapshotDoc) {
                    console.log(`${tag(reqId)} ✗ STALE — doc changed`);
                    return;
                }

                if (!raw?.trim()) {
                    console.log(`${tag(reqId)} ✗ EMPTY — AI returned blank/empty suggestion`);
                    view.dispatch({ effects: clearSuggestionEffect.of() });
                    return;
                }

                // ── 5. Postprocess & cache ────────────────────────────────
                const cleaned = processStartAndEndSpaces(raw);

                // If the AI returned a multiline result, use multi-line type so
                // Trim 4 in postprocessCompletion doesn't strip it to one line.
                const actualType = cleaned.includes('\n')
                    ? 'multi-line-start-on-next-line'
                    : options.predictionType;

                const entry: AutocompletionEntry = {
                    prefix: prefixAndSuffix.prefix,
                    insertText: cleaned,
                    type: actualType,
                };
                const matchup: AutocompletionMatchupBounds = {
                    startIdx: 0,
                    startLine: 0,
                    startCharacter: 0,
                };
                const finalSuggestion = postprocessCompletion({
                    matchup,
                    autocompletion: entry,
                    prefixAndSuffix,
                });

                console.log(`${tag(reqId)} ✂  POSTPROCESS  raw="${cleaned.slice(0, 60)}"  →  final="${String(finalSuggestion).slice(0, 60)}"`);

                cache.set(prefixAndSuffix.prefix, {
                    status: "finished",
                    suggestion: finalSuggestion || null,
                    promise: Promise.resolve(finalSuggestion || null),
                    prefix: prefixAndSuffix.prefix,
                    timestamp: Date.now(),
                });

                if (finalSuggestion) {
                    console.log(`${tag(reqId)} ✅ SHOW  "${finalSuggestion.slice(0, 60)}"`);
                    view.dispatch({ effects: setSuggestionEffect.of(finalSuggestion) });
                } else {
                    console.log(`${tag(reqId)} ✗ POSTPROCESS returned empty`);
                    view.dispatch({ effects: clearSuggestionEffect.of() });
                }
            } finally {
                inFlightCursor = -1;
            }

        }, DEBOUNCE_MS);
    });

    // ── Cursor-move listener ──────────────────────────────────────────────────
    const cursorMoveListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) return;
        if (!update.selectionSet) return;
        if (update.transactions.some(tr => tr.isUserEvent("input.complete"))) return;

        const oldHead = update.startState.selection.main.head;
        const newHead = update.state.selection.main.head;

        if (inFlightCursor === -1) {
            if (newHead !== oldHead) {
                console.log(`${tag()} cursor moved ${oldHead}→${newHead} (no request in-flight, clearing ghost text)`);
                clearTimeout(debounceRef.current);
                update.view.dispatch({ effects: clearSuggestionEffect.of() });
            }
            return;
        }

        if (newHead === inFlightCursor) {
            // Selection changed (e.g. range selected) but head didn't move — ignore
            console.log(`${tag()} selectionSet but head unchanged at ${newHead} — CM6 internal, ignoring`);
            return;
        }

        // Real move while in-flight
        console.log(`${tag()} 🚫 ABORT — cursor moved ${oldHead}→${newHead} while request inFlightCursor=${inFlightCursor}`);
        clearTimeout(debounceRef.current);
        requestManager.abort();
        inFlightCursor = -1;
        update.view.dispatch({ effects: clearSuggestionEffect.of() });
    });

    return [
        suggestionState,
        suggestionLoadingState,
        suggestionPlugin,
        Prec.highest(keymap.of(buildSuggestionKeymap(debounceRef))),
        updateListener,
        cursorMoveListener,
    ];
}
