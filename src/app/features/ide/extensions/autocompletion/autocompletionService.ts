export class LRUCache<K, V> {

    public items: Map<K, V>;
    private keyOrder: K[];
    private capacity: number;


    // When the cache is full and a new item pushes out the oldest one, the dispose callback fires on the evicted item. Ayndrome uses it to abort the in-flight LLM request for that evicted autocompletion so it doesn't keep running in the background wasting resources.

    private disposeCallback?: (value: V, key?: K) => void;


    constructor(capacity: number, disposeCallback?: (value: V, key?: K) => void) {
        this.capacity = capacity;
        this.disposeCallback = disposeCallback;
        this.items = new Map<K, V>();
        this.keyOrder = [];
    }

    set(key: K, value: V): void {

        if (this.items.has(key)) {
            this.keyOrder = this.keyOrder.filter(k => k !== key);
        }

        else if (this.items.size >= this.capacity) {
            const key = this.keyOrder[0];
            const value = this.items.get(key);

            if (this.disposeCallback && value !== undefined) {
                this.disposeCallback(value, key);
            }

            this.items.delete(key);
            this.keyOrder.shift();
        }

        this.items.set(key, value);
        this.keyOrder.push(key);

    }

    delete(key: K): boolean {
        const value = this.items.get(key);

        if (value !== undefined) {
            if (this.disposeCallback) {
                this.disposeCallback(value, key);
            }

            this.items.delete(key);
            this.keyOrder = this.keyOrder.filter(k => k !== key);
            return true;
        }

        return false;
    }

    clear(): void {
        if (this.disposeCallback) {
            for (const [key, value] of this.items.entries()) {
                this.disposeCallback(value, key);
            }
        }

        this.items.clear();
        this.keyOrder = [];
    }

    get size(): number {
        return this.items.size;
    }

    has(key: K): boolean {
        return this.items.has(key);
    }



}



const DEBOUNCE_TIME = 500;
const TIMEOUT_TIME = 60000;
const MAX_CACHE_SIZE = 20;
const MAX_PENDING_REQUESTS = 2;


// A string cursor that trims from both ends using index pointers
// Never creates intermediate strings — just moves i and j boundaries

class SurroundingsRemover {
    readonly originalS: string;
    i: number;
    j: number;

    constructor(s: string) {
        this.originalS = s;
        this.i = 0;
        this.j = s.length - 1;
    }

    value(): string {
        return this.originalS.substring(this.i, this.j + 1);
    }

    removePrefix(prefix: string): boolean {
        let offset = 0;
        while (this.i <= this.j && offset <= prefix.length - 1) {
            if (this.originalS[this.i] !== prefix[offset]) break;
            offset++;
            this.i++;
        }
        return offset === prefix.length;
    }

    removeSuffix(suffix: string): boolean {
        const s = this.value();
        for (let len = Math.min(s.length, suffix.length); len >= 1; len--) {
            if (s.endsWith(suffix.slice(0, len))) {
                this.j -= len;
                return len === suffix.length;
            }
        }
        return false;
    }

    removeFromStartUntilFullMatch(until: string, alsoRemoveUntilStr: boolean): boolean {
        const index = this.originalS.indexOf(until, this.i);
        if (index === -1) return false;
        this.i = alsoRemoveUntilStr ? index + until.length : index;
        return true;
    }

    removeCodeBlock(): boolean {
        if (!this.removePrefix('```')) return false;
        this.removeFromStartUntilFullMatch('\n', true); // skip language identifier
        const j = this.j;
        const found = this.removeSuffix('```') || (this.j === j && this.removeSuffix('```\n'));
        if (!found) return false;
        this.removeSuffix('\n'); // remove newline before closing ```
        return true;
    }

    // Used for streaming: tracks which part of the result is newly arrived
    // recentlyAddedTextLen = how many chars at the end are "new" tokens
    deltaInfo(recentlyAddedTextLen: number): [string, string] {
        const recentlyAddedIdx = this.originalS.length - recentlyAddedTextLen;
        const actualDelta = this.originalS.substring(
            Math.max(this.i, recentlyAddedIdx),
            this.j + 1
        );
        const ignoredSuffix = this.originalS.substring(
            Math.max(this.j + 1, recentlyAddedIdx),
            Infinity
        );
        return [actualDelta, ignoredSuffix];
    }
}

// ── Code extraction ───────────────────────────────────────────────────────────

// Strips markdown code fences from LLM output
// Returns [cleanedText, newDelta, ignoredSuffix]
// newDelta and ignoredSuffix are only relevant for streaming use
export const extractCodeFromRegular = ({
    text,
    recentlyAddedTextLen,
}: {
    text: string;
    recentlyAddedTextLen: number;
}): [string, string, string] => {
    const pm = new SurroundingsRemover(text);
    pm.removeCodeBlock();
    const s = pm.value();
    const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen);
    return [s, delta, ignoredSuffix];
};

// For FIM (Fill-In-the-Middle) models like DeepSeek-Coder, CodeLlama
// These models wrap completions in special tags:
// <PRE>code before</PRE><MID>completion</MID><SUF>code after</SUF>
// NOT needed for Claude — only when you add FIM model support
export const extractCodeFromFIM = ({
    text,
    recentlyAddedTextLen,
    midTag,
}: {
    text: string;
    recentlyAddedTextLen: number;
    midTag: string;
}): [string, string, string] => {
    const pm = new SurroundingsRemover(text);
    pm.removeCodeBlock();
    const foundMid = pm.removePrefix(`<${midTag}>`);
    if (foundMid) {
        pm.removeSuffix('\n');
        pm.removeSuffix(`</${midTag}>`);
    }
    const s = pm.value();
    const [delta, ignoredSuffix] = pm.deltaInfo(recentlyAddedTextLen);
    return [s, delta, ignoredSuffix];
};

// ── Ghost suggestion postprocessing ──────────────────────────────────────────

// Strips code fences and preserves at most one leading/trailing space
// Leading space matters: " fetchData()" keeps separation from previous token
export const processStartAndEndSpaces = (result: string): string => {
    const [cleaned] = extractCodeFromRegular({
        text: result,
        recentlyAddedTextLen: result.length, // treat entire string as new (non-streaming)
    });

    const hasLeadingSpace = cleaned.startsWith(' ');
    const hasTrailingSpace = cleaned.endsWith(' ');

    return (hasLeadingSpace ? ' ' : '')
        + cleaned.trim()
        + (hasTrailingSpace ? ' ' : '');
};

// ── Search/Replace block extraction ──────────────────────────────────────────
// Used for inline file editing with live diff preview (Cursor-style)
// Parses LLM output that looks like:
//
// <<<<<<< ORIGINAL
// const x = 1
// =======
// const x = 42
// >>>>>>> UPDATED
//
// Works on PARTIAL/STREAMING output — state progresses as tokens arrive:
// 'writingOriginal' → 'writingFinal' → 'done'

// These match the markers your prompts/API route should use
// Keep in sync with your SUGGESTION_PROMPT in the API route
const ORIGINAL = '<<<<<<< ORIGINAL';
const DIVIDER = '=======';
const FINAL = '>>>>>>> UPDATED';

export type SearchReplaceBlock = {
    state: 'writingOriginal' | 'writingFinal' | 'done';
    orig: string;   // the code to find and replace
    final: string;  // the replacement code
};

// JS substring swaps indices if end < start, so "ab".substring(1,0) = "a" not ""
// This helper makes it safe
const safeSubstr = (str: string, start: number, end: number): string =>
    end < start ? '' : str.substring(start, end);

// For streaming: checks if str ends with any prefix of anyPrefix
// Used to avoid cutting off a block marker mid-stream
// e.g. str ends with "======" and anyPrefix is "=======" → returns "======"
export const endsWithAnyPrefixOf = (str: string, anyPrefix: string): string | null => {
    for (let i = anyPrefix.length; i >= 1; i--) {
        const prefix = anyPrefix.slice(0, i);
        if (str.endsWith(prefix)) return prefix;
    }
    return null;
};

// Guarantees: if you keep appending text, blocks.length strictly grows
// and state only moves forward: writingOriginal → writingFinal → done
// This is what enables live diff preview while LLM is still streaming
export const extractSearchReplaceBlocks = (str: string): SearchReplaceBlock[] => {
    const ORIGINAL_ = ORIGINAL + '\n';
    const DIVIDER_ = '\n' + DIVIDER + '\n';
    // FINAL handling is slightly more complex because final output can be empty

    const blocks: SearchReplaceBlock[] = [];
    let i = 0;

    while (true) {
        // ── Find ORIGINAL marker ───────────────────────────────────────────
        let origStart = str.indexOf(ORIGINAL_, i);
        if (origStart === -1) return blocks; // not started yet
        origStart += ORIGINAL_.length;
        i = origStart;

        // ── Find DIVIDER ───────────────────────────────────────────────────
        let dividerStart = str.indexOf(DIVIDER_, i);
        if (dividerStart === -1) {
            // Still writing the original block OR writing the divider itself
            const writingDividerLen = endsWithAnyPrefixOf(str, DIVIDER_)?.length ?? 0;
            blocks.push({
                orig: safeSubstr(str, origStart, str.length - writingDividerLen),
                final: '',
                state: 'writingOriginal',
            });
            return blocks;
        }
        const origStr = safeSubstr(str, origStart, dividerStart);
        dividerStart += DIVIDER_.length;
        i = dividerStart;

        // ── Find FINAL marker ──────────────────────────────────────────────
        // Try to match '\n' + FINAL first (more specific), then just FINAL
        const fullFinalStart = str.indexOf(FINAL, i);
        const fullFinalStartWithNewline = str.indexOf('\n' + FINAL, i);
        const matchedWithNewline =
            fullFinalStartWithNewline !== -1 &&
            fullFinalStart === fullFinalStartWithNewline + 1;

        let finalStart = matchedWithNewline ? fullFinalStartWithNewline : fullFinalStart;

        if (finalStart === -1) {
            // Still writing final block OR writing the FINAL marker itself
            // Check both forms to avoid cutting the marker mid-stream
            const writingFinalLen = endsWithAnyPrefixOf(str, FINAL)?.length ?? 0;
            const writingFinalLenWithNewline = endsWithAnyPrefixOf(str, '\n' + FINAL)?.length ?? 0;
            const longestMatch = Math.max(writingFinalLen, writingFinalLenWithNewline);

            blocks.push({
                orig: origStr,
                final: safeSubstr(str, dividerStart, str.length - longestMatch),
                state: 'writingFinal',
            });
            return blocks;
        }

        const usingFinal = matchedWithNewline ? '\n' + FINAL : FINAL;
        const finalStr = safeSubstr(str, dividerStart, finalStart);
        finalStart += usingFinal.length;
        i = finalStart;

        // ── Block complete ─────────────────────────────────────────────────
        blocks.push({
            orig: origStr,
            final: finalStr,
            state: 'done',
        });
        // Loop continues to find more blocks in the same response
        // (LLM may return multiple search/replace pairs for one edit)
    }
};

// ── Applying search/replace blocks to a document ─────────────────────────────
// You'll need this when wiring up the inline edit feature

export type ApplyResult =
    | { success: true; newDoc: string }
    | { success: false; reason: 'not_found' | 'multiple_matches' };

// Applies a single done block to a document string
export const applySearchReplaceBlock = (
    doc: string,
    block: SearchReplaceBlock
): ApplyResult => {
    if (block.state !== 'done') {
        return { success: false, reason: 'not_found' };
    }

    const { orig, final } = block;

    // Count occurrences to avoid ambiguous replacements
    let count = 0;
    let index = -1;
    let searchFrom = 0;

    while (true) {
        const found = doc.indexOf(orig, searchFrom);
        if (found === -1) break;
        count++;
        index = found;
        searchFrom = found + 1;
        if (count > 1) return { success: false, reason: 'multiple_matches' };
    }

    if (count === 0) return { success: false, reason: 'not_found' };

    const newDoc = doc.slice(0, index) + final + doc.slice(index + orig.length);
    return { success: true, newDoc };
};

// Applies ALL done blocks in sequence
// Stops on first failure and returns partial results + which block failed
export const applyAllSearchReplaceBlocks = (
    doc: string,
    blocks: SearchReplaceBlock[]
): {
    newDoc: string;
    applied: number;
    failed: number | null; // index of first failure, null if all succeeded
} => {
    let current = doc;
    const doneBlocks = blocks.filter(b => b.state === 'done');

    for (let i = 0; i < doneBlocks.length; i++) {
        const result = applySearchReplaceBlock(current, doneBlocks[i]);
        if (!result.success) {
            return { newDoc: current, applied: i, failed: i };
        }
        current = result.newDoc;
    }

    return { newDoc: current, applied: doneBlocks.length, failed: null };
};





const removeLeftTabsAndTrimEnds = (text: string) => {

    const trimmedStr = text.trimEnd();
    const trailingEnd = text.slice(trimmedStr.length);


    if (trailingEnd.includes('\r\n')) {

        text = trimmedStr + '\r\n';
    }

    text = text.replace(/^\s+/gm, '');
    return text;

}

const removeAllWhitespace = (text: string) => {
    return text.replace(/\s/g, '');
}





// src/extensions/suggestions/completion-engine.ts

const _ln = '\n';



const getLastLine = (s: string): string => {
    const matches = s.match(/[^\n]*$/);
    return matches ? matches[0] : '';
};

const getIndex = (str: string, line: number, char: number): number => {
    return str.split(_ln).slice(0, line).join(_ln).length + (line > 0 ? 1 : 0) + char;
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type AutocompletionPredictionType =
    | 'single-line-fill-middle'    // cursor in middle of a line with text on both sides
    | 'single-line-redo-suffix'    // short suffix — rewrite rest of the line
    | 'multi-line-start-on-next-line' // blank line after just accepting — predict next block
    | 'do-not-predict';            // conditions not met for any useful completion

export type PrefixAndSuffixInfo = {
    prefix: string;                    // everything before cursor in full doc
    suffix: string;                    // everything after cursor in full doc
    prefixLines: string[];             // prefix split by newline
    suffixLines: string[];             // suffix split by newline
    prefixToTheLeftOfCursor: string;   // current line, left of cursor
    suffixToTheRightOfCursor: string;  // current line, right of cursor
};

export type AutocompletionMatchupBounds = {
    startLine: number;
    startCharacter: number;
    startIdx: number;
};

export type CompletionOptions = {
    predictionType: AutocompletionPredictionType;
    shouldGenerate: boolean;
    llmPrefix: string;   // what the LLM actually sees as prefix (trimmed)
    llmSuffix: string;   // what the LLM actually sees as suffix (trimmed)
    stopTokens: string[];
};

// Mirrors your CachedSuggestion shape — only the fields needed here
export type AutocompletionEntry = {
    prefix: string;      // doc prefix at time of generation
    insertText: string;  // the generated suggestion text
    type: AutocompletionPredictionType;
};

// ── Step 1: Build prefix/suffix info from CodeMirror state ───────────────────
// Replaces VSCode's: getPrefixAndSuffixInfo(model: ITextModel, position: Position)

export const getPrefixAndSuffixInfo = (
    doc: string,
    cursorPos: number
): PrefixAndSuffixInfo => {
    const prefix = doc.slice(0, cursorPos);
    const suffix = doc.slice(cursorPos);

    const prefixLines = prefix.split(_ln);
    const suffixLines = suffix.split(_ln);

    // Last line of prefix = text to the LEFT of cursor on current line
    const prefixToTheLeftOfCursor = prefixLines.at(-1) ?? '';
    // First line of suffix = text to the RIGHT of cursor on current line
    const suffixToTheRightOfCursor = suffixLines[0] ?? '';

    return {
        prefix,
        suffix,
        prefixLines,
        suffixLines,
        prefixToTheLeftOfCursor,
        suffixToTheRightOfCursor,
    };
};

// ── Step 2: Determine what kind of completion to generate ────────────────────
// Replaces VSCode's: getCompletionOptions(prefixAndSuffix, relevantContext, justAccepted)

const CONTEXT_LINES_BEFORE = 25;
const CONTEXT_LINES_AFTER = 25;
const allLinebreakSymbols = ['\r\n', '\n'];

export const getCompletionOptions = (
    prefixAndSuffix: PrefixAndSuffixInfo,
    justAcceptedAutocompletion: boolean,
    relevantContext: string = '', // reserved for future context-gathering integration
): CompletionOptions => {
    let {
        prefix,
        suffix,
        prefixToTheLeftOfCursor,
        suffixToTheRightOfCursor,
        prefixLines,
        suffixLines,
    } = prefixAndSuffix;

    // Trim to sliding window — don't blow up the context window
    prefixLines = prefixLines.slice(-CONTEXT_LINES_BEFORE);
    suffixLines = suffixLines.slice(0, CONTEXT_LINES_AFTER);
    prefix = prefixLines.join(_ln);
    suffix = suffixLines.join(_ln);

    const isLineEmpty =
        !prefixToTheLeftOfCursor.trim() && !suffixToTheRightOfCursor.trim();
    const isLinePrefixEmpty =
        removeAllWhitespace(prefixToTheLeftOfCursor).length === 0;
    const isLineSuffixEmpty =
        removeAllWhitespace(suffixToTheRightOfCursor).length === 0;
    const suffixIsShort =
        removeAllWhitespace(suffixToTheRightOfCursor).length <= 3;

    // ── Decision tree (order matters) ─────────────────────────────────────

    // 1. Just accepted a suggestion on a line with nothing after cursor
    //    → predict the next block starting on the next line
    if (justAcceptedAutocompletion && isLineSuffixEmpty) {
        return {
            predictionType: 'multi-line-start-on-next-line',
            shouldGenerate: true,
            llmPrefix: prefix + _ln,
            llmSuffix: suffix,
            stopTokens: [`${_ln}${_ln}`], // stop at double newline (blank line)
        };
    }

    // 2. Entire line is empty → single line fill
    if (isLineEmpty) {
        return {
            predictionType: 'single-line-fill-middle',
            shouldGenerate: true,
            llmPrefix: prefix,
            llmSuffix: suffix,
            stopTokens: allLinebreakSymbols,
        };
    }

    // 3. Short suffix (≤3 non-whitespace chars) → rewrite rest of line
    //    e.g. cursor is at: "const x = |)" — rewrite that closing paren context
    if (suffixIsShort) {
        const suffixLinesIgnoringThisLine = suffixLines.slice(1);
        const suffixStringIgnoringThisLine =
            suffixLinesIgnoringThisLine.length === 0
                ? ''
                : _ln + suffixLinesIgnoringThisLine.join(_ln);
        return {
            predictionType: 'single-line-redo-suffix',
            shouldGenerate: true,
            llmPrefix: prefix,
            llmSuffix: suffixStringIgnoringThisLine, // ignore this line's suffix
            stopTokens: allLinebreakSymbols,
        };
    }

    // 4. Text on left, text on right → fill the middle
    if (!isLinePrefixEmpty) {
        return {
            predictionType: 'single-line-fill-middle',
            shouldGenerate: true,
            llmPrefix: prefix,
            llmSuffix: suffix,
            stopTokens: allLinebreakSymbols,
        };
    }

    // 5. Nothing useful to generate (blank prefix, non-blank suffix)
    return {
        predictionType: 'do-not-predict',
        shouldGenerate: false,
        llmPrefix: prefix,
        llmSuffix: suffix,
        stopTokens: [],
    };
};

// ── Step 3: Cache matchup ─────────────────────────────────────────────────────
// Checks if user's current prefix matches a cached autocompletion
// Handles the case where user kept typing AFTER the cache was populated
// Replaces VSCode's: getAutocompletionMatchup({ prefix, autocompletion })

export const getAutocompletionMatchup = ({
    prefix,
    autocompletion,
}: {
    prefix: string;
    autocompletion: AutocompletionEntry;
}): AutocompletionMatchupBounds | undefined => {
    const trimmedCurrentPrefix = removeLeftTabsAndTrimEnds(prefix);
    const trimmedCompletionPrefix = removeLeftTabsAndTrimEnds(autocompletion.prefix);
    const trimmedCompletionMiddle = removeLeftTabsAndTrimEnds(autocompletion.insertText);

    // User must have typed at least as much as existed when cache was generated
    if (trimmedCurrentPrefix.length < trimmedCompletionPrefix.length) {
        return undefined;
    }

    // The combined original prefix + suggestion must start with current prefix
    // This is what allows the cache to stay valid as user keeps typing
    // e.g. cache was: prefix="con", suggestion="sole.log()"
    //      user now at: prefix="cons" → "console.log()".startsWith("cons") ✓
    if (!(trimmedCompletionPrefix + trimmedCompletionMiddle).startsWith(trimmedCurrentPrefix)) {
        return undefined;
    }

    // Find where in the suggestion text the current prefix ends
    // (how many lines of the suggestion has the user already typed through)
    const lineStart =
        trimmedCurrentPrefix.split(_ln).length -
        trimmedCompletionPrefix.split(_ln).length;

    if (lineStart < 0) {
        console.error('getAutocompletionMatchup: negative lineStart — should never happen');
        return undefined;
    }

    const currentPrefixLine = getLastLine(trimmedCurrentPrefix);
    const completionPrefixLine = lineStart === 0 ? getLastLine(trimmedCompletionPrefix) : '';
    const completionMiddleLine = autocompletion.insertText.split(_ln)[lineStart] ?? '';
    const fullCompletionLine = completionPrefixLine + completionMiddleLine;

    const charMatchIdx = fullCompletionLine.indexOf(currentPrefixLine);
    if (charMatchIdx < 0) {
        console.error('getAutocompletionMatchup: negative charMatchIdx — should never happen');
        return undefined;
    }

    const character = charMatchIdx + currentPrefixLine.length - completionPrefixLine.length;
    const startIdx = getIndex(autocompletion.insertText, lineStart, character);

    return { startLine: lineStart, startCharacter: character, startIdx };
};

// ── Step 4: Postprocess the suggestion before displaying ─────────────────────
// Replaces VSCode's: postprocessAutocompletion({ autocompletionMatchup, autocompletion, prefixAndSuffix })
// Trims the raw LLM output to what should actually be shown as ghost text

export const postprocessCompletion = ({
    matchup,
    autocompletion,
    prefixAndSuffix,
}: {
    matchup: AutocompletionMatchupBounds;
    autocompletion: AutocompletionEntry;
    prefixAndSuffix: PrefixAndSuffixInfo;
}): string => {
    const { prefix, prefixToTheLeftOfCursor, suffixToTheRightOfCursor } = prefixAndSuffix;
    const generatedText = autocompletion.insertText;

    let startIdx = matchup.startIdx;
    let endIdx = generatedText.length;

    // ── Trim 1: Remove leading space if user already typed one ────────────
    const charToLeft = prefixToTheLeftOfCursor.at(-1) ?? '';
    const userTypedSpace = charToLeft === ' ' || charToLeft === '\t';
    const rawFirstNonspaceIdx = generatedText.slice(startIdx).search(/[^\t ]/);
    if (rawFirstNonspaceIdx > -1 && userTypedSpace) {
        startIdx = Math.max(startIdx, rawFirstNonspaceIdx + startIdx);
    }

    // ── Trim 2: Remove leading newlines if on a completely blank line ─────
    const numStartingNewlines =
        generatedText.slice(startIdx).match(/^\n+/)?.[0].length ?? 0;
    if (
        !prefixToTheLeftOfCursor.trim() &&
        !suffixToTheRightOfCursor.trim() &&
        numStartingNewlines > 0
    ) {
        startIdx += numStartingNewlines;
    }

    // ── Trim 3: Fill-middle — stop at first match with suffix ─────────────
    // e.g. completing "const [x, |] = useState()" — stop before the ]
    if (
        autocompletion.type === 'single-line-fill-middle' &&
        suffixToTheRightOfCursor.trim()
    ) {
        const rawMatchIndex = generatedText
            .slice(startIdx)
            .lastIndexOf(suffixToTheRightOfCursor.trim()[0]);
        if (rawMatchIndex > -1) {
            const matchIdx = rawMatchIndex + startIdx;
            const matchChar = generatedText[matchIdx];
            if (`{}()[]<>\`'"`.includes(matchChar)) {
                endIdx = Math.min(endIdx, matchIdx);
            }
        }
    }

    // ── Trim 4: Single-line — stop at first newline ───────────────────────
    // ONLY applied for explicitly single-line prediction types.
    // Multi-line types ('multi-line-*') and our structured AI output should
    // pass through intact — the model already returns just what should be inserted.
    const isSingleLineType =
        autocompletion.type === 'single-line-fill-middle' ||
        autocompletion.type === 'single-line-redo-suffix';
    const restOfLineToGenerate = generatedText.slice(startIdx).split(_ln)[0] ?? '';
    if (
        isSingleLineType &&
        prefixToTheLeftOfCursor.trim() &&
        !suffixToTheRightOfCursor.trim() &&
        restOfLineToGenerate.trim()
    ) {
        const rawNewlineIdx = generatedText.slice(startIdx).indexOf(_ln);
        if (rawNewlineIdx > -1) {
            endIdx = Math.min(endIdx, rawNewlineIdx + startIdx);
        }
    }

    let completionStr = generatedText.slice(startIdx, endIdx);

    // ── Trim 5: Remove unbalanced closing brackets ────────────────────────
    completionStr = trimToBalancedBrackets(completionStr, prefix);

    return completionStr;
};

// ── Step 5: Handle redo-suffix acceptance ────────────────────────────────────
// Replaces VSCode's: toInlineCompletions (the range logic part)
// When type is 'single-line-redo-suffix', we need to REPLACE the existing
// suffix on the current line, not just insert

function removeAllWhitespaceInner(str: string): string {
    return str.replace(/\s+/g, '');
}

function getIsSubsequence(
    of: string,
    subsequence: string
): [boolean, string] {
    if (subsequence.length === 0) return [true, ''];
    if (of.length === 0) return [false, ''];

    let subIdx = 0;
    let lastMatchChar = '';

    for (let i = 0; i < of.length; i++) {
        if (of[i] === subsequence[subIdx]) {
            lastMatchChar = of[i];
            subIdx++;
        }
        if (subIdx === subsequence.length) return [true, lastMatchChar];
    }
    return [false, lastMatchChar];
}

export type AcceptResult = {
    insertText: string;
    // How many characters to the RIGHT of cursor to delete before inserting
    // 0 = pure insert (normal case)
    // >0 = replace suffix chars (redo-suffix case)
    deleteCharCount: number;
};

export const computeAcceptResult = ({
    matchup,
    autocompletion,
    prefixAndSuffix,
}: {
    matchup: AutocompletionMatchupBounds;
    autocompletion: AutocompletionEntry;
    prefixAndSuffix: PrefixAndSuffixInfo;
}): AcceptResult => {
    let insertText = postprocessCompletion({ matchup, autocompletion, prefixAndSuffix });
    let deleteCharCount = 0;

    if (autocompletion.type === 'single-line-redo-suffix') {
        const oldSuffix = prefixAndSuffix.suffixToTheRightOfCursor;
        const newSuffix = autocompletion.insertText;

        const [isSubsequence, lastMatchingChar] = getIsSubsequence(
            removeAllWhitespaceInner(newSuffix),
            removeAllWhitespaceInner(oldSuffix),
        );

        if (isSubsequence) {
            // New suffix is a superset — replace entire current line suffix
            deleteCharCount = oldSuffix.length;
        } else {
            // Partial overlap — replace up to last matching bracket/char
            const lastMatchupIdx = insertText.lastIndexOf(lastMatchingChar);
            insertText = insertText.slice(0, lastMatchupIdx + 1);
            deleteCharCount = oldSuffix.lastIndexOf(lastMatchingChar) + 1;
        }
    }

    return { insertText, deleteCharCount };
};

// ── Step 6: Balanced bracket trimmer ─────────────────────────────────────────
// Prevents suggestions that break bracket balance
// e.g. if doc has "fn(", don't suggest "x, y))" — trim to "x, y"

export const trimToBalancedBrackets = (suggestion: string, prefixContext: string): string => {
    const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
    const stack: string[] = [];

    // Pre-load stack with unclosed brackets from prefix
    const firstOpenIdx = prefixContext.search(/[[({]/);
    if (firstOpenIdx !== -1) {
        for (const char of prefixContext.slice(firstOpenIdx)) {
            if ('([{'.includes(char)) {
                stack.push(char);
            } else if (')]}'.includes(char)) {
                if (stack.length > 0 && stack.at(-1) === pairs[char]) {
                    stack.pop();
                }
            }
        }
    }

    // Walk suggestion — stop at first unbalanced closer
    for (let i = 0; i < suggestion.length; i++) {
        const char = suggestion[i];
        if ('([{'.includes(char)) {
            stack.push(char);
        } else if (')]}'.includes(char)) {
            if (stack.length === 0 || stack.pop() !== pairs[char]) {
                return suggestion.slice(0, i);
            }
        }
    }

    return suggestion;
};