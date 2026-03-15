// src/app/api/suggestion/prompts.ts

// ── Shared rules injected into every prompt ───────────────────────────────────
const SHARED_RULES = `
<critical_rules>
1. Output ONLY the raw code to insert — no explanations, no markdown, no code fences.
2. Never repeat code that already exists before OR after the cursor.
3. Never add imports unless explicitly part of the completion context.
4. Match the indentation style of the surrounding code exactly (tabs vs spaces, indent size).
5. If no useful completion exists, return an empty string — never force a suggestion.
6. Never close brackets/braces that are already closed after the cursor.
7. Output must be valid when spliced at cursor position — it must fit syntactically.
</critical_rules>`;

// ── Type-specific system prompts ──────────────────────────────────────────────

const SINGLE_LINE_FILL_MIDDLE_SYSTEM = `You are an expert code completion engine similar to GitHub Copilot.
Your task: complete the MIDDLE of a line where cursor is between existing code on both sides.

${SHARED_RULES}

<behavior>
- Complete only what fits between before_cursor and after_cursor on the same line.
- Do NOT output a newline — your output is inserted inline.
- Stop exactly where after_cursor begins — never duplicate it.
- If before_cursor ends with an operator (+, =, =>, :, ,) suggest the right-hand value.
- If before_cursor opens a bracket/paren/brace, suggest the inner content only.
- Keep it concise — fill the gap, don't rewrite the line.
</behavior>`;

const SINGLE_LINE_REDO_SUFFIX_SYSTEM = `You are an expert code completion engine.
Your task: the cursor is near the end of a line with a very short suffix (≤3 chars).
Rewrite the rest of the line from the cursor position, replacing the short suffix.

${SHARED_RULES}

<behavior>
- Output the COMPLETE rest of the line from cursor onwards, including the replacement for the short suffix.
- The short suffix after cursor will be REPLACED by your output — do not duplicate it.
- Do not output a newline.
- Think about what makes the line syntactically complete.
- Ensure bracket/paren balance relative to what exists before cursor on this line.
</behavior>`;

const MULTI_LINE_SYSTEM = `You are an expert code completion engine similar to GitHub Copilot.
Your task: generate a multi-line block of code starting on the NEXT line after the cursor.

${SHARED_RULES}

<behavior>
- Output starts from the NEXT line — do not repeat the current line.
- Generate complete, working logical blocks: full function bodies, complete if/else, full loops.
- Stop at a natural boundary — end of function, end of block, or a blank line separator.
- Match indentation of the current scope exactly.
- Do not generate more than ~15 lines unless the block genuinely requires it.
- If just accepted a completion on a line ending with '{' or ':', generate the block body.
</behavior>`;

const EMPTY_LINE_SYSTEM = `You are an expert code completion engine.
Your task: the cursor is on a completely blank line. Suggest what belongs here.

${SHARED_RULES}

<behavior>
- Analyze surrounding code to determine what logically comes next.
- If inside a function body, suggest the next statement.
- If between functions/classes, suggest the next declaration.
- If after a comment, suggest the code the comment describes.
- Can be single or multi-line depending on context — use judgment.
- Match indentation of surrounding scope.
</behavior>`;

// ── Prompt builders ───────────────────────────────────────────────────────────

export type CompletionType =
    | 'single-line-fill-middle'
    | 'single-line-redo-suffix'
    | 'multi-line-start-on-next-line'
    | 'empty-line'
    | 'do-not-predict';

interface PromptContext {
    fileName: string;
    language: string;
    previousLines: string;
    currentLine: string;
    lineNumber: number;
    textBeforeCursor: string;
    textAfterCursor: string;
    nextLines: string;
    code: string; // trimmed context window
    completionType: CompletionType;
    stopTokens: string[];
}

// Returns { system, prompt } ready to send to the LLM
export function buildSuggestionPrompt(ctx: PromptContext): {
    system: string;
    prompt: string;
} {
    const system = getSystemPrompt(ctx.completionType);
    const prompt = buildUserPrompt(ctx);
    return { system, prompt };
}

function getSystemPrompt(type: CompletionType): string {
    switch (type) {
        case 'single-line-fill-middle':
            return SINGLE_LINE_FILL_MIDDLE_SYSTEM;
        case 'single-line-redo-suffix':
            return SINGLE_LINE_REDO_SUFFIX_SYSTEM;
        case 'multi-line-start-on-next-line':
            return MULTI_LINE_SYSTEM;
        case 'empty-line':
            return EMPTY_LINE_SYSTEM;
        default:
            return SINGLE_LINE_FILL_MIDDLE_SYSTEM;
    }
}

function buildUserPrompt(ctx: PromptContext): string {
    const typeInstructions = getTypeSpecificInstructions(ctx);

    return `<file>
<name>${ctx.fileName}</name>
<language>${ctx.language}</language>
</file>

<cursor_context>
<lines_before>
${ctx.previousLines}
</lines_before>
<current_line number="${ctx.lineNumber}">
<before_cursor>${ctx.textBeforeCursor}</before_cursor><CURSOR/><after_cursor>${ctx.textAfterCursor}</after_cursor>
</current_line>
<lines_after>
${ctx.nextLines}
</lines_after>
</cursor_context>

<full_context>
${ctx.code}
</full_context>

${typeInstructions}

<validation>
Before outputting, verify:
- My output does NOT repeat any text already in lines_after
- My output is syntactically valid when inserted at <CURSOR/>
- My output matches the indentation style of surrounding code
- I am NOT outputting markdown, code fences, or explanations
</validation>

Complete the code at <CURSOR/>. Output only the raw completion text:`;
}

function getTypeSpecificInstructions(ctx: PromptContext): string {
    switch (ctx.completionType) {

        case 'single-line-fill-middle':
            return `<task>
Type: FILL IN MIDDLE
The cursor is in the MIDDLE of line ${ctx.lineNumber}.
Left of cursor:  "${ctx.textBeforeCursor}"
Right of cursor: "${ctx.textAfterCursor}"

Complete only the gap. Your output is inserted between left and right — do not include either side.
Stop before "${ctx.textAfterCursor[0] ?? ''}" — that character already exists.
</task>`;

        case 'single-line-redo-suffix':
            return `<task>
Type: REDO SUFFIX
The cursor is near end of line ${ctx.lineNumber}.
Left of cursor:  "${ctx.textBeforeCursor}"
Short suffix to replace: "${ctx.textAfterCursor}"

Your output REPLACES the short suffix. Write the complete rest of the line from cursor.
The "${ctx.textAfterCursor}" will be deleted — so include its replacement in your output if needed.
</task>`;

        case 'multi-line-start-on-next-line':
            return `<task>
Type: MULTILINE CONTINUATION
The cursor is at the end of line ${ctx.lineNumber}: "${ctx.textBeforeCursor}"
Generate the continuation starting on the NEXT line.

Do NOT repeat line ${ctx.lineNumber}.
Start your output with a newline if the current line ends with '{', ':', or '(' — then generate the block body.
Generate a complete logical unit (full function body, full loop, full conditional).
</task>`;

        case 'empty-line':
            return `<task>
Type: EMPTY LINE
The cursor is on a blank line ${ctx.lineNumber}.
Previous non-empty line: "${ctx.previousLines.trim().split('\n').at(-1) ?? ''}"
Next non-empty line: "${ctx.nextLines.trim().split('\n')[0] ?? ''}"

Determine what logically belongs on this blank line given the surrounding context.
Can be single or multiline — use judgment based on context.
</task>`;

        default:
            return '';
    }
}

// ── Language detection ────────────────────────────────────────────────────────

export function getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        ts: 'TypeScript', tsx: 'TypeScript React',
        js: 'JavaScript', jsx: 'JavaScript React',
        py: 'Python', rs: 'Rust', go: 'Go',
        java: 'Java', kt: 'Kotlin', swift: 'Swift',
        cpp: 'C++', c: 'C', cs: 'C#',
        rb: 'Ruby', php: 'PHP', scala: 'Scala',
        css: 'CSS', scss: 'SCSS', html: 'HTML',
        json: 'JSON', yaml: 'YAML', toml: 'TOML',
        sql: 'SQL', md: 'Markdown', sh: 'Shell',
        vue: 'Vue', svelte: 'Svelte',
    };
    return map[ext] ?? 'plaintext';
}

// ── Quick edit prompt ─────────────────────────────────────────────────────────

interface QuickEditContext {
    selectedCode: string;
    fullCode: string;
    instruction: string;
    fileName: string;
    language: string;
    documentation?: string;
}

export function buildQuickEditPrompt(ctx: QuickEditContext): {
    system: string;
    prompt: string;
} {
    const system = `You are an expert code editor. You receive a selected block of code and an instruction.
You output ONLY the edited version of the selected block — nothing else.

<rules>
1. Return ONLY the edited code — no explanations, no markdown fences, no preamble.
2. Preserve the original indentation level of the selected code.
3. If the instruction is unclear or impossible, return the original code unchanged.
4. Do not add unused imports.
5. Maintain the same language and style conventions as the surrounding code.
6. If instruction says "add types", infer from context — do not use 'any'.
7. If instruction says "optimize", prefer readability over micro-optimizations.
8. If instruction says "fix", identify and fix the actual bug — don't just suppress errors.
</rules>`;

    const docSection = ctx.documentation
        ? `<documentation>\n${ctx.documentation}\n</documentation>\n\n`
        : '';

    const prompt = `<file>
<name>${ctx.fileName}</name>
<language>${ctx.language}</language>
</file>

<selected_code>
${ctx.selectedCode}
</selected_code>

<full_context>
${ctx.fullCode}
</full_context>

${docSection}<instruction>
${ctx.instruction}
</instruction>

<validation>
Before outputting verify:
- Output has same indentation as selected_code
- Output is syntactically valid ${ctx.language}
- Output contains NO markdown fences or explanations
- If instruction was ambiguous, I returned original code unchanged
</validation>

Return ONLY the edited code:`;

    return { system, prompt };
}