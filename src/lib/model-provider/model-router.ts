// src/lib/model-providers/model-router.ts
// Routes a model selection to the correct AI SDK provider instance.
// This is the only file that knows about SDK internals.
// Everything else uses ModelSelection and calls getModelInstance().

import { type LanguageModel } from "ai";
import type { ProviderName } from "./provider-registry";
import type { ProviderCredentials, ModelSelection } from "./provider-store";

// ── Provider SDK factory ──────────────────────────────────────────────────────

export async function getModelInstance(
    selection: ModelSelection,
    credentials: ProviderCredentials,
): Promise<LanguageModel> {

    const { provider, modelId } = selection;

    // All cloud providers route through /api/llm-proxy to avoid CORS.
    // The proxy forwards requests to the real provider API server-side.
    const PROXY = "/api/llm-proxy";

    switch (provider) {

        // ── Anthropic ─────────────────────────────────────────────────────────
        case "anthropic": {
            const { createAnthropic } = await import("@ai-sdk/anthropic");
            const client = createAnthropic({
                apiKey: credentials.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
                baseURL: `${PROXY}/anthropic`,
            });
            return client(modelId);
        }

        // ── OpenAI ────────────────────────────────────────────────────────────
        case "openai": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.OPENAI_API_KEY ?? "",
                baseURL: `${PROXY}/openai/v1`,
            });
            return client(modelId);
        }

        // ── Google Gemini ─────────────────────────────────────────────────────
        case "gemini": {
            const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
            const client = createGoogleGenerativeAI({
                apiKey: credentials.apiKey ?? process.env.GOOGLE_API_KEY ?? "",
                baseURL: `${PROXY}/google/v1beta`,
            });
            return client(modelId);
        }

        // ── DeepSeek (OpenAI-compatible) ──────────────────────────────────────
        case "deepseek": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "",
                baseURL: `${PROXY}/deepseek/v1`,
            });
            return client(modelId);
        }

        // ── xAI ───────────────────────────────────────────────────────────────
        case "xai": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.XAI_API_KEY ?? "",
                baseURL: `${PROXY}/xai/v1`,
            });
            return client(modelId);
        }

        // ── Groq ──────────────────────────────────────────────────────────────
        case "groq": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.GROQ_API_KEY ?? "",
                baseURL: `${PROXY}/groq/v1`,
            });
            return client(modelId);
        }

        // ── Mistral ───────────────────────────────────────────────────────────
        case "mistral": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.MISTRAL_API_KEY ?? "",
                baseURL: `${PROXY}/mistral/v1`,
            });
            return client(modelId);
        }

        // ── OpenRouter ────────────────────────────────────────────────────────
        case "openrouter": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? process.env.OPENROUTER_API_KEY ?? "",
                baseURL: `${PROXY}/openrouter/v1`,
                headers: {
                    "HTTP-Referer": "https://ayndrome.dev",
                    "X-Title": "Ayndrome IDE",
                },
            });
            return client(modelId);
        }

        // ── Ollama ────────────────────────────────────────────────────────────
        case "ollama": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const endpoint = credentials.endpoint ?? "http://localhost:11434";
            const client = createOpenAI({
                apiKey: "ollama",   // Ollama doesn't check this
                baseURL: `${endpoint}/v1`,
            });
            return client(modelId);
        }

        // ── LM Studio ─────────────────────────────────────────────────────────
        case "lmstudio": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const endpoint = credentials.endpoint ?? "http://localhost:1234";
            const client = createOpenAI({
                apiKey: "lmstudio",
                baseURL: `${endpoint}/v1`,
            });
            return client(modelId);
        }

        // ── OpenAI Compatible ─────────────────────────────────────────────────
        case "openai-compatible": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const client = createOpenAI({
                apiKey: credentials.apiKey ?? "",
                baseURL: credentials.endpoint ?? "",
            });
            return client(modelId);
        }

        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

// ── Provider options for streamText ──────────────────────────────────────────
// Some providers need extra options (e.g. thinking/reasoning config)

export function getProviderOptions(
    selection: ModelSelection,
): Record<string, unknown> | undefined {
    const { provider, modelId, reasoningEnabled, reasoningBudget, reasoningEffort } = selection;

    if (!reasoningEnabled) return undefined;

    // Anthropic extended thinking
    if (provider === "anthropic") {
        return {
            anthropic: {
                thinking: {
                    type: "enabled",
                    budgetTokens: reasoningBudget ?? 8_000,
                },
            },
        };
    }

    // OpenAI / xAI reasoning effort
    if (provider === "openai" || provider === "xai") {
        return {
            openai: {
                reasoningEffort: reasoningEffort ?? "medium",
            },
        };
    }

    // Gemini thinking
    if (provider === "gemini") {
        return {
            google: {
                thinkingConfig: {
                    thinkingBudget: reasoningBudget ?? 8_000,
                },
            },
        };
    }

    return undefined;
}

// ── Context window per model ──────────────────────────────────────────────────

export function getContextWindow(
    selection: ModelSelection,
): number {
    const { getModel } = require("./provider-registry");
    const model = getModel(selection.provider, selection.modelId);
    return model?.contextWindow ?? 128_000;
}

// ── Max output tokens per model ───────────────────────────────────────────────

export function getMaxOutputTokens(
    selection: ModelSelection,
    chatMode: "normal" | "gather" | "agent",
): number {
    const { getModel } = require("./provider-registry");
    const model = getModel(selection.provider, selection.modelId);
    const base = model?.outputTokens ?? 4_096;

    // Use full output tokens for agent mode, less for chat
    return chatMode === "agent" ? base : Math.min(base, 4_096);
}