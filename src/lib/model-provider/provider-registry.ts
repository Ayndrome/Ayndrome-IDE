// src/lib/model-providers/provider-registry.ts
// Single source of truth for all supported providers and their models.
// Drives the settings UI, the model selector, and the LLM call routing.

export type ProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "xai"
  | "groq"
  | "mistral"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "openai-compatible";

export type ModelCapability =
  | "reasoning" // extended thinking / chain of thought
  | "vision" // image input
  | "tools" // function / tool calling
  | "fim"; // fill-in-middle (autocomplete)

export type ToolFormat = "anthropic" | "openai" | "gemini";

export type ReasoningType =
  | "budget_tokens" // anthropic — thinking budget in tokens
  | "effort" // openai — low/medium/high
  | "none";

export type ModelDef = {
  id: string; // API model ID
  label: string; // display name
  contextWindow: number; // input tokens
  outputTokens: number; // max output tokens
  capabilities: ModelCapability[];
  toolFormat: ToolFormat;
  reasoning: ReasoningType;
  costPer1kInput?: number; // USD
  costPer1kOutput?: number; // USD
  isDefault?: boolean;
};

export type ProviderDef = {
  name: ProviderName;
  label: string;
  description: string;
  authType: "api_key" | "endpoint" | "api_key_and_endpoint" | "none";
  endpointLabel?: string;
  endpointDefault?: string;
  apiKeyLabel?: string;
  apiKeyLink?: string; // where to get an API key
  models: ModelDef[];
  supportsModelAutodetect?: boolean; // Ollama/LM Studio list models dynamically
  isLocal?: boolean;
};

// ── Provider definitions ──────────────────────────────────────────────────────

export const PROVIDERS: ProviderDef[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    name: "anthropic",
    label: "Anthropic",
    description: "Claude models — best for coding and reasoning",
    authType: "api_key",
    apiKeyLabel: "Anthropic API Key",
    apiKeyLink: "https://console.anthropic.com/settings/keys",
    models: [
      {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["reasoning", "vision", "tools"],
        toolFormat: "anthropic",
        reasoning: "budget_tokens",
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        isDefault: true,
      },
      {
        id: "claude-opus-4-5",
        label: "Claude Opus 4.5",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["reasoning", "vision", "tools"],
        toolFormat: "anthropic",
        reasoning: "budget_tokens",
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
      },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["vision", "tools"],
        toolFormat: "anthropic",
        reasoning: "none",
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
      },
      {
        id: "claude-3-7-sonnet-20250219",
        label: "Claude 3.7 Sonnet",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["reasoning", "vision", "tools"],
        toolFormat: "anthropic",
        reasoning: "budget_tokens",
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
      },
      {
        id: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["vision", "tools"],
        toolFormat: "anthropic",
        reasoning: "none",
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
      },
      {
        id: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "anthropic",
        reasoning: "none",
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
      },
    ],
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    name: "openai",
    label: "OpenAI",
    description: "GPT-4.1 and o-series reasoning models",
    authType: "api_key",
    apiKeyLabel: "OpenAI API Key",
    apiKeyLink: "https://platform.openai.com/api-keys",
    models: [
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        contextWindow: 1_047_576,
        outputTokens: 32_768,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.002,
        costPer1kOutput: 0.008,
        isDefault: true,
      },
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 Mini",
        contextWindow: 1_047_576,
        outputTokens: 32_768,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.0004,
        costPer1kOutput: 0.0016,
      },
      {
        id: "gpt-4.1-nano",
        label: "GPT-4.1 Nano",
        contextWindow: 1_047_576,
        outputTokens: 32_768,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.0001,
        costPer1kOutput: 0.0004,
      },
      {
        id: "o3",
        label: "o3",
        contextWindow: 1_047_576,
        outputTokens: 32_768,
        capabilities: ["reasoning", "tools"],
        toolFormat: "openai",
        reasoning: "effort",
        costPer1kInput: 0.01,
        costPer1kOutput: 0.04,
      },
      {
        id: "o4-mini",
        label: "o4 Mini",
        contextWindow: 1_047_576,
        outputTokens: 32_768,
        capabilities: ["reasoning", "tools"],
        toolFormat: "openai",
        reasoning: "effort",
        costPer1kInput: 0.0011,
        costPer1kOutput: 0.0044,
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        contextWindow: 128_000,
        outputTokens: 16_384,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o Mini",
        contextWindow: 128_000,
        outputTokens: 16_384,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
      },
    ],
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  {
    name: "gemini",
    label: "Google Gemini",
    description: "Gemini 2.5 Pro — massive context window",
    authType: "api_key",
    apiKeyLabel: "Google AI API Key",
    apiKeyLink: "https://aistudio.google.com/apikey",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1_048_576,
        outputTokens: 8_192,
        capabilities: ["reasoning", "vision", "tools"],
        toolFormat: "openai",
        reasoning: "budget_tokens",
        costPer1kInput: 0.00125,
        costPer1kOutput: 0.01,
        isDefault: true,
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        contextWindow: 1_048_576,
        outputTokens: 8_192,
        capabilities: ["reasoning", "vision", "tools"],
        toolFormat: "openai",
        reasoning: "budget_tokens",
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        contextWindow: 1_048_576,
        outputTokens: 8_192,
        capabilities: ["vision", "tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.0001,
        costPer1kOutput: 0.0004,
      },
      {
        id: "gemini-2.0-flash-lite",
        label: "Gemini 2.0 Flash Lite",
        contextWindow: 1_048_576,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.000075,
        costPer1kOutput: 0.0003,
      },
    ],
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  {
    name: "deepseek",
    label: "DeepSeek",
    description: "Best price/performance ratio for coding",
    authType: "api_key",
    apiKeyLabel: "DeepSeek API Key",
    apiKeyLink: "https://platform.deepseek.com/api_keys",
    models: [
      {
        id: "deepseek-chat",
        label: "DeepSeek V3",
        contextWindow: 64_000,
        outputTokens: 8_000,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.00027,
        costPer1kOutput: 0.0011,
        isDefault: true,
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek R1",
        contextWindow: 64_000,
        outputTokens: 8_000,
        capabilities: ["reasoning"],
        toolFormat: "openai",
        reasoning: "none", // R1 reasons internally
        costPer1kInput: 0.00055,
        costPer1kOutput: 0.00219,
      },
    ],
  },

  // ── xAI ──────────────────────────────────────────────────────────────────
  {
    name: "xai",
    label: "xAI (Grok)",
    description: "Grok 3 — strong reasoning model",
    authType: "api_key",
    apiKeyLabel: "xAI API Key",
    apiKeyLink: "https://console.x.ai",
    models: [
      {
        id: "grok-3",
        label: "Grok 3",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        isDefault: true,
      },
      {
        id: "grok-3-mini",
        label: "Grok 3 Mini",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["reasoning", "tools"],
        toolFormat: "openai",
        reasoning: "effort",
        costPer1kInput: 0.0003,
        costPer1kOutput: 0.0005,
      },
      {
        id: "grok-2",
        label: "Grok 2",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.002,
        costPer1kOutput: 0.01,
      },
    ],
  },

  // ── Groq ──────────────────────────────────────────────────────────────────
  {
    name: "groq",
    label: "Groq",
    description: "Fastest inference — Llama and Qwen models",
    authType: "api_key",
    apiKeyLabel: "Groq API Key",
    apiKeyLink: "https://console.groq.com/keys",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B",
        contextWindow: 128_000,
        outputTokens: 32_768,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.00059,
        costPer1kOutput: 0.00079,
        isDefault: true,
      },
      {
        id: "qwen-qwq-32b",
        label: "QwQ 32B",
        contextWindow: 128_000,
        outputTokens: 8_192,
        capabilities: ["reasoning"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.00029,
        costPer1kOutput: 0.00039,
      },
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B",
        contextWindow: 128_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.00005,
        costPer1kOutput: 0.00008,
      },
    ],
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  {
    name: "mistral",
    label: "Mistral",
    description: "Devstral — specialized coding model",
    authType: "api_key",
    apiKeyLabel: "Mistral API Key",
    apiKeyLink: "https://console.mistral.ai/api-keys",
    models: [
      {
        id: "devstral-small-latest",
        label: "Devstral Small",
        contextWindow: 131_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0,
        costPer1kOutput: 0,
        isDefault: true,
      },
      {
        id: "codestral-latest",
        label: "Codestral",
        contextWindow: 256_000,
        outputTokens: 8_192,
        capabilities: ["tools", "fim"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.0003,
        costPer1kOutput: 0.0009,
      },
      {
        id: "mistral-large-latest",
        label: "Mistral Large",
        contextWindow: 131_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        costPer1kInput: 0.002,
        costPer1kOutput: 0.006,
      },
    ],
  },

  // ── OpenRouter ────────────────────────────────────────────────────────────
  {
    name: "openrouter",
    label: "OpenRouter",
    description: "Access 100+ models through one API key",
    authType: "api_key",
    apiKeyLabel: "OpenRouter API Key",
    apiKeyLink: "https://openrouter.ai/keys",
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        label: "Claude Sonnet 4 (via OpenRouter)",
        contextWindow: 200_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        isDefault: true,
      },
      {
        id: "deepseek/deepseek-r1",
        label: "DeepSeek R1 (via OpenRouter)",
        contextWindow: 128_000,
        outputTokens: 8_192,
        capabilities: ["reasoning"],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "qwen/qwen3-235b-a22b",
        label: "Qwen3 235B (via OpenRouter)",
        contextWindow: 40_960,
        outputTokens: 8_192,
        capabilities: ["reasoning", "tools"],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "mistralai/devstral-small:free",
        label: "Devstral Small Free (via OpenRouter)",
        contextWindow: 130_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "google/gemini-2.0-flash-exp:free",
        label: "Gemini 2.0 Flash Free (via OpenRouter)",
        contextWindow: 1_048_576,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },

      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        label: "Nemotron 3 Super 120B (via OpenRouter)",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },

      {
        id: "meta-llama/llama-3.2-3b-instruct:free",
        label: "Llama 3.2 3B Free (via OpenRouter)",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },

      {
        id: "google/gemma-4-26b-a4b-it:free",
        label: "Gemma 4 26B (via OpenRouter)",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },

      {
        id: "minimax/minimax-m2.5:free",
        label: "Minimax M2.5 Free (via OpenRouter)",
        contextWindow: 131_072,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },
    ],
  },

  // ── Ollama (local) ────────────────────────────────────────────────────────
  {
    name: "ollama",
    label: "Ollama",
    description: "Run models locally — free, private, offline",
    authType: "endpoint",
    endpointLabel: "Ollama Endpoint",
    endpointDefault: "http://localhost:11434",
    isLocal: true,
    supportsModelAutodetect: true,
    models: [
      {
        id: "qwen2.5-coder:7b",
        label: "Qwen2.5 Coder 7B",
        contextWindow: 32_000,
        outputTokens: 4_096,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "devstral:latest",
        label: "Devstral",
        contextWindow: 131_000,
        outputTokens: 8_192,
        capabilities: ["tools"],
        toolFormat: "openai",
        reasoning: "none",
        isDefault: true,
      },
      {
        id: "llama3.1",
        label: "Llama 3.1 8B",
        contextWindow: 128_000,
        outputTokens: 4_096,
        capabilities: [],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "deepseek-r1",
        label: "DeepSeek R1",
        contextWindow: 128_000,
        outputTokens: 4_096,
        capabilities: ["reasoning"],
        toolFormat: "openai",
        reasoning: "none",
      },
      {
        id: "qwq",
        label: "QwQ 32B",
        contextWindow: 128_000,
        outputTokens: 8_192,
        capabilities: ["reasoning"],
        toolFormat: "openai",
        reasoning: "none",
      },
    ],
  },

  // ── LM Studio (local) ─────────────────────────────────────────────────────
  {
    name: "lmstudio",
    label: "LM Studio",
    description: "Run local models via LM Studio GUI",
    authType: "endpoint",
    endpointLabel: "LM Studio Endpoint",
    endpointDefault: "http://localhost:1234",
    isLocal: true,
    supportsModelAutodetect: true,
    models: [], // autodetected from endpoint
  },

  // ── OpenAI Compatible ─────────────────────────────────────────────────────
  {
    name: "openai-compatible",
    label: "OpenAI Compatible",
    description: "Any OpenAI-compatible API (vLLM, Together, etc.)",
    authType: "api_key_and_endpoint",
    endpointLabel: "API Endpoint",
    endpointDefault: "https://api.together.xyz/v1",
    apiKeyLabel: "API Key",
    isLocal: false,
    supportsModelAutodetect: false,
    models: [], // user enters model ID manually
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getProvider(name: ProviderName): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.name === name);
}

export function getModel(
  provider: ProviderName,
  modelId: string,
): ModelDef | undefined {
  return getProvider(provider)?.models.find((m) => m.id === modelId);
}

export function getDefaultModel(provider: ProviderName): ModelDef | undefined {
  const p = getProvider(provider);
  return p?.models.find((m) => m.isDefault) ?? p?.models[0];
}
