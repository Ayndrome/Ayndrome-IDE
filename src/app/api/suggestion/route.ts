import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { google } from '@ai-sdk/google';
import { buildSuggestionPrompt, getLanguageFromFileName, type CompletionType } from "./prompt";

const suggestionSchema = z.object({
    suggestion: z.string().describe("The suggested code to insert at the cursor position."),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {

    try {
        const {
            fileName,
            code,
            currentLine,
            previousLines,
            textBeforeCursor,
            textAfterCursor,
            nextLines,
            lineNumber,
            completionType,
            stopTokens,
        } = await request.json();

        if (!code) {
            return NextResponse.json({ error: "Code is required" }, { status: 400 });
        }

        const language = getLanguageFromFileName(fileName ?? '');

        const { system, prompt } = buildSuggestionPrompt({
            fileName: fileName ?? 'untitled',
            language,
            previousLines: previousLines ?? '',
            currentLine: currentLine ?? '',
            lineNumber: lineNumber ?? 1,
            textBeforeCursor: textBeforeCursor ?? '',
            textAfterCursor: textAfterCursor ?? '',
            nextLines: nextLines ?? '',
            code,
            completionType: (completionType as CompletionType) ?? 'single-line-fill-middle',
            stopTokens: stopTokens ?? [],
        });

        const { output } = await generateText({
            model: google("gemini-pro-latest"),
            output: Output.object({ schema: suggestionSchema }),
            system,
            prompt,
            abortSignal: request.signal,
        });

        console.log(`[${completionType}/${language}] Suggestion:`, output.suggestion);

        return NextResponse.json({ suggestion: output.suggestion });
    }

    catch (error) {
        // ResponseAborted = AI SDK abort when abortSignal fires
        // AbortError = browser fetch cancel
        // Both are expected when the user types again before the response arrives.
        if (error instanceof Error &&
            (error.name === 'AbortError' ||
                error.name === 'ResponseAborted' ||
                error.message?.includes('aborted'))) {
            return new Response(null, { status: 499 });
        }
        console.error("Error generating suggestion:", error);
        return NextResponse.json({ error: "Failed to generate suggestion" }, { status: 500 });
    }
}
