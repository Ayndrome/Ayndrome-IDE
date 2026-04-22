// src/app/api/model-providers/test/route.ts
// Tests provider connectivity with the user's credentials.
// Returns { ok: boolean; error?: string; latencyMs?: number }

import { NextRequest, NextResponse } from "next/server";
import type { ProviderName } from "../../../../lib/model-provider/provider-registry";

export async function POST(req: NextRequest) {
  try {
    const { provider, credentials } = (await req.json()) as {
      provider: ProviderName;
      credentials: { apiKey?: string; endpoint?: string };
    };

    const start = Date.now();

    switch (provider) {
      case "anthropic": {
        const { createAnthropic } = await import("@ai-sdk/anthropic");
        const { generateText } = await import("ai");
        const client = createAnthropic({ apiKey: credentials.apiKey ?? "" });
        await generateText({
          model: client("claude-haiku-4-5-20251001"),
          prompt: "Say OK",
          maxOutputTokens: 5,
        });
        break;
      }

      case "openai": {
        const { createOpenAI } = await import("@ai-sdk/openai");
        const { generateText } = await import("ai");
        const client = createOpenAI({ apiKey: credentials.apiKey ?? "" });
        await generateText({
          model: client("gpt-4o-mini"),
          prompt: "Say OK",
          maxOutputTokens: 5,
        });
        break;
      }

      case "gemini": {
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
        const { generateText } = await import("ai");
        const client = createGoogleGenerativeAI({
          apiKey: credentials.apiKey ?? "",
        });
        await generateText({
          model: client("gemini-2.5-flash"),
          prompt: "Say OK",
          maxOutputTokens: 5,
        });
        break;
      }

      case "deepseek":
      case "xai":
      case "groq":
      case "mistral":
      case "openrouter":
      case "openai-compatible": {
        const baseURLMap: Partial<Record<ProviderName, string>> = {
          deepseek: "https://api.deepseek.com/v1",
          xai: "https://api.x.ai/v1",
          groq: "https://api.groq.com/openai/v1",
          mistral: "https://api.mistral.ai/v1",
          openrouter: "https://openrouter.ai/api/v1",
          "openai-compatible": credentials.endpoint ?? "",
        };
        const testModelMap: Partial<Record<ProviderName, string>> = {
          deepseek: "deepseek-chat",
          xai: "grok-2",
          groq: "llama-3.1-8b-instant",
          mistral: "mistral-small-latest",
          openrouter: "google/gemma-4-26b-a4b-it:free",
          "openai-compatible": "default",
        };
        const { createOpenAI } = await import("@ai-sdk/openai");
        const { generateText } = await import("ai");
        const client = createOpenAI({
          apiKey: credentials.apiKey ?? "test",
          baseURL: baseURLMap[provider] ?? "",
          ...(provider === "openrouter" && {
            headers: {
              "HTTP-Referer": "https://ayndrome.dev",
              "X-Title": "Ayndrome IDE",
            },
          }),
        });
        await generateText({
          model: client(testModelMap[provider] ?? "default"),
          prompt: "Say OK",
          maxOutputTokens: 5,
        });
        break;
      }

      case "ollama":
      case "lmstudio": {
        const endpoint =
          credentials.endpoint ??
          (provider === "ollama"
            ? "http://localhost:11434"
            : "http://localhost:1234");
        const res = await fetch(`${endpoint}/v1/models`);
        if (!res.ok) throw new Error(`Endpoint returned ${res.status}`);
        break;
      }

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return NextResponse.json({ ok: true, latencyMs: Date.now() - start });
  } catch (err: any) {
    const msg = err.message ?? "Connection failed";
    // Sanitize — don't leak stack traces
    return NextResponse.json({
      ok: false,
      error: msg.slice(0, 200),
    });
  }
}
