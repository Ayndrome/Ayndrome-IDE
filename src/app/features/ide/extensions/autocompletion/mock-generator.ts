// Triggers and their fake completions
// Key = word the user just finished typing
const MOCK_SUGGESTIONS: Record<string, string> = {
    function: " name(params: type): returnType {\n\t\n}",
    class: " ClassName {\n\tconstructor() {\n\t\t\n\t}\n}",
    console: ".log()",
    return: " value;",
    import: " {  } from \"\";",
    interface: " Name {\n\t\n}",
    type: " Name = ;",
    const: " name = ;",
    let: " name = ;",
    async: " function name() {\n\tawait \n}",
    if: " (condition) {\n\t\n}",
    for: " (let i = 0; i < arr.length; i++) {\n\t\n}",
    forEach: "((item) => {\n\t\n})",
    map: "((item) => )",
    filter: "((item) => )",
    useState: "< >()",
    useEffect: "(() => {\n\t\n}, [])",
    fetch: "(url, { method: 'GET' })",
    try: " {\n\tawait \n} catch (error) {\n\tconsole.error(error);\n}",
};

// Extracts the last word the user typed before the cursor
function getWordBeforeCursor(doc: string, cursorPos: number): string {
    const textBeforeCursor = doc.slice(0, cursorPos);
    console.log("Text Before Cursor: ", textBeforeCursor);
    // Match last continuous word (letters + digits only)
    const match = textBeforeCursor.match(/([a-zA-Z][a-zA-Z0-9]*)$/);
    console.log("Match: ", match);
    return match ? match[1] : "";
}

export function getMockSuggestion(doc: string, cursorPos: number): string | null {
    const word = getWordBeforeCursor(doc, cursorPos);
    console.log(word);
    if (!word) return null;

    // Only suggest when word is an exact key — no partial matches
    // (avoids showing on every random word)
    return MOCK_SUGGESTIONS[word] ?? null;
}