import { StateEffect, StateField } from "@codemirror/state";

// ── Effects ────────────────────────────────────────────────────────────────────
/** Set a new ghost-text suggestion */
export const setSuggestionEffect = StateEffect.define<string>();
/** User accepted the current suggestion (Tab / F2) */
export const acceptSuggestionEffect = StateEffect.define<void>();
/** Clear the current suggestion (Escape, doc changed but no new result, etc.) */
export const clearSuggestionEffect = StateEffect.define<void>();
/** Toggle the loading indicator while waiting for the AI response */
export const suggestionLoadingEffect = StateEffect.define<boolean>();

// ── State fields ───────────────────────────────────────────────────────────────
export const suggestionState = StateField.define<string | null>({
    create: () => null,
    update(value, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(setSuggestionEffect)) return effect.value;
            if (effect.is(acceptSuggestionEffect)) return null;
            if (effect.is(clearSuggestionEffect)) return null;
        }
        return value;
    },
});

/** true while we're waiting for the AI to respond */
export const suggestionLoadingState = StateField.define<boolean>({
    create: () => false,
    update(value, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(suggestionLoadingEffect)) return effect.value;
            // Loading clears when a suggestion arrives or is dismissed
            if (effect.is(setSuggestionEffect)) return false;
            if (effect.is(clearSuggestionEffect)) return false;
            if (effect.is(acceptSuggestionEffect)) return false;
        }
        return value;
    },
});