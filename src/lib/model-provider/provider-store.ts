// src/lib/model-providers/provider-store.ts
// Zustand store for provider settings, credentials, and model selection.
// Persisted to localStorage — credentials never sent to Convex.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderName } from "./provider-registry";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProviderCredentials = {
    apiKey?: string;
    endpoint?: string;
};

export type ModelSelection = {
    provider: ProviderName;
    modelId: string;
    // Reasoning settings
    reasoningEnabled?: boolean;
    reasoningBudget?: number;   // for budget_tokens providers
    reasoningEffort?: "low" | "medium" | "high";   // for effort providers
};

export type ProviderStore = {
    // Credentials per provider — stored locally only, never in Convex
    credentials: Partial<Record<ProviderName, ProviderCredentials>>;

    // Global default model selection
    globalModel: ModelSelection;

    // Per-thread model overrides
    // key = threadId, value = model selection
    threadModels: Record<string, ModelSelection>;

    // Autodetected models (Ollama / LM Studio)
    detectedModels: Partial<Record<ProviderName, string[]>>;

    // Actions
    setCredentials: (provider: ProviderName, creds: ProviderCredentials) => void;
    setGlobalModel: (selection: ModelSelection) => void;
    setThreadModel: (threadId: string, selection: ModelSelection) => void;
    clearThreadModel: (threadId: string) => void;

    getEffectiveModel: (threadId?: string) => ModelSelection;

    setDetectedModels: (provider: ProviderName, models: string[]) => void;

    // Test provider connection
    testConnection: (provider: ProviderName) => Promise<{ ok: boolean; error?: string }>;

    // Autodetect models from local endpoint
    autodetectModels: (provider: ProviderName) => Promise<string[]>;
};

// ── Default global model ──────────────────────────────────────────────────────

const DEFAULT_GLOBAL: ModelSelection = {
    provider: "gemini",
    modelId: "gemini-2.5-flash",
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProviderStore = create<ProviderStore>()(
    persist(
        (set, get) => ({
            credentials: {},
            globalModel: DEFAULT_GLOBAL,
            threadModels: {},
            detectedModels: {},

            setCredentials: (provider, creds) =>
                set(s => ({
                    credentials: {
                        ...s.credentials,
                        [provider]: { ...s.credentials[provider], ...creds },
                    },
                })),

            setGlobalModel: (selection) =>
                set({ globalModel: selection }),

            setThreadModel: (threadId, selection) =>
                set(s => ({
                    threadModels: { ...s.threadModels, [threadId]: selection },
                })),

            clearThreadModel: (threadId) =>
                set(s => {
                    const next = { ...s.threadModels };
                    delete next[threadId];
                    return { threadModels: next };
                }),

            getEffectiveModel: (threadId) => {
                const s = get();
                if (threadId && s.threadModels[threadId]) {
                    return s.threadModels[threadId];
                }
                return s.globalModel;
            },

            setDetectedModels: (provider, models) =>
                set(s => ({
                    detectedModels: { ...s.detectedModels, [provider]: models },
                })),

            testConnection: async (provider) => {
                const { credentials } = get();
                const creds = credentials[provider];

                try {
                    const res = await fetch("/api/model-provider/test", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider, credentials: creds }),
                    });
                    const data = await res.json();
                    return data;
                } catch (err: any) {
                    return { ok: false, error: err.message };
                }
            },

            autodetectModels: async (provider) => {
                const { credentials } = get();
                const endpoint = credentials[provider]?.endpoint;

                try {
                    const res = await fetch("/api/models", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider, endpoint }),
                    });
                    const data = await res.json();
                    const models = data.models ?? [];
                    get().setDetectedModels(provider, models);
                    return models;
                } catch {
                    return [];
                }
            },
        }),
        {
            name: "ayndrome-provider-settings",
            // Never persist to server — localStorage only
            partialize: (s) => ({
                credentials: s.credentials,
                globalModel: s.globalModel,
                threadModels: s.threadModels,
                detectedModels: s.detectedModels,
            }),
        }
    )
);