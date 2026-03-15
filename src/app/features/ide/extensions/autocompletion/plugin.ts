import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { suggestionState, suggestionLoadingState } from "./state";
import { SuggestionWidget, LoadingWidget } from "./widget";

export const suggestionPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet = Decoration.none;

        update(update: ViewUpdate) {
            const prevSuggestion = update.startState.field(suggestionState);
            const nextSuggestion = update.state.field(suggestionState);
            const prevLoading = update.startState.field(suggestionLoadingState);
            const nextLoading = update.state.field(suggestionLoadingState);

            const changed =
                prevSuggestion !== nextSuggestion ||
                prevLoading !== nextLoading ||
                update.docChanged ||
                update.selectionSet ||
                update.viewportChanged;

            if (changed) this.decorations = this.build(update.view);
        }

        private build(view: EditorView): DecorationSet {
            const suggestion = view.state.field(suggestionState);
            const loading = view.state.field(suggestionLoadingState);
            const cursor = view.state.selection.main.head;

            if (suggestion) {
                return Decoration.set([
                    Decoration.widget({
                        widget: new SuggestionWidget(suggestion),
                        side: 1,
                    }).range(cursor),
                ]);
            }

            // if (loading) {
            //     return Decoration.set([
            //         Decoration.widget({
            //             widget: new LoadingWidget(),
            //             side: 1,
            //         }).range(cursor),
            //     ]);
            // }

            return Decoration.none;
        }
    },
    { decorations: (v) => v.decorations }
);