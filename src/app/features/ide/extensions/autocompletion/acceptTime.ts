/**
 * Shared mutable cell — tracks when the user last accepted a suggestion.
 *
 * Kept in its own module to break the circular dependency between
 * index.ts (which reads it) and keymap.ts (which writes it).
 */
export let lastAcceptTime = 0;

export function markAccepted(): void {
    lastAcceptTime = Date.now();
}
