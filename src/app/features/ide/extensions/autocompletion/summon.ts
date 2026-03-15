import ky from "ky";
import { toast } from "sonner";
import { z } from "zod";

const suggestionRequestSchema = z.object({
    fileName: z.string(),
    code: z.string(),
    cursor: z.number(),
    currentLine: z.string(),
    previousLines: z.string(),
    textBeforeCursor: z.string(),
    textAfterCursor: z.string(),
    nextLines: z.string(),
    lineNumber: z.number(),
    // New fields for the type-aware prompt system
    completionType: z.string(),
    stopTokens: z.array(z.string()),
});

const suggestionResponseSchema = z.object({
    suggestion: z.string(),
});

type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;
type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;

export async function fetchSuggestion(
    payload: SuggestionRequest,
    signal: AbortSignal
): Promise<string | null> {
    try {
        const validatedPayload = suggestionRequestSchema.parse(payload);
        const response = await ky.post("/api/suggestion", {
            json: validatedPayload,
            signal,
            timeout: 60_000,
            retry: 0,
        }).json<SuggestionResponse>();

        const validatedResponse = suggestionResponseSchema.parse(response);
        return validatedResponse.suggestion || null;

    } catch (error) {
        if (
            error instanceof Error &&
            (error.name === 'AbortError' || error.message.includes('aborted'))
        ) {
            return null; // expected cancellation — user typed again
        }
        toast.error("Failed to fetch suggestion");
        return null;
    }
}
