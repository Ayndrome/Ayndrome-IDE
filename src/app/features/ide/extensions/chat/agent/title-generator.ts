// src/app/features/ide/extensions/chat/agent/title-generator.ts
// Phase 15: use model router instead of direct Anthropic fetch

import { generateText } from "ai";
import { getModelInstance } from "@/src/lib/model-provider/model-router";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";

export async function generateThreadTitle(
    userMessage: string,
): Promise<string> {
    try {
        const providerStore = useProviderStore.getState();
        const globalModel = providerStore.globalModel;
        const credentials = providerStore.credentials[globalModel.provider] ?? {};

        // Use fast model for title generation
        const fastModelId = getFastModelForProvider(globalModel.provider);
        const model = await getModelInstance(
            { provider: globalModel.provider, modelId: fastModelId },
            credentials,
        );

        const result = await generateText({
            model,
            maxOutputTokens: 30,
            messages: [{
                role: "user",
                content: [
                    "Generate a short title (3-6 words, no quotes, no punctuation) ",
                    "that summarizes this coding task: ",
                    userMessage.slice(0, 300),
                ].join(""),
            }],
            system: [
                "You generate short titles for coding tasks. ",
                "Reply with ONLY the title — no explanation, no quotes, no punctuation. ",
                "Examples: 'Add JWT auth system', 'Fix dashboard layout'. ",
                "Maximum 6 words.",
            ].join(""),
        });

        return result.text
            .replace(/^["']|["']$/g, "")
            .replace(/[.!?]+$/, "")
            .slice(0, 60)
            .trim();

    } catch {
        return "";
    }
}

function getFastModelForProvider(provider: string): string {
    const map: Record<string, string> = {
        anthropic: "claude-haiku-4-5-20251001",
        openai: "gpt-4.1-nano",
        gemini: "gemini-2.0-flash-lite",
        deepseek: "deepseek-chat",
        xai: "grok-2",
        groq: "llama-3.1-8b-instant",
        mistral: "ministral-3b-latest",
        openrouter: "mistralai/devstral-small:free",
        ollama: "llama3.1",
        lmstudio: "default",
        "openai-compatible": "default",
    };
    return map[provider] ?? "default";
}