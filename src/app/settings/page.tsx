// src/app/settings/page.tsx
// Provider and model settings page.
// Shows all providers, credential inputs, connection test, model list.

'use client';

import React, { useState, useEffect } from "react";
import { useProviderStore } from "@/src/lib/model-provider/provider-store";
import {
    PROVIDERS, getDefaultModel,
    type ProviderDef, type ProviderName,
} from "@/src/lib/model-provider/provider-registry";
import {
    CheckCircleIcon, XCircleIcon, Loader2Icon,
    EyeIcon, EyeOffIcon, ChevronRightIcon,
    ExternalLinkIcon, RefreshCwIcon, ServerIcon,
    CloudIcon, SettingsIcon, ZapIcon,
} from "lucide-react";
import Link from "next/link";

const C = {
    bg: "#1e1f22",
    bg2: "#2b2d30",
    bg3: "#313438",
    bg4: "#3c3f41",
    border: "#3c3f41",
    text: "#bcbec4",
    muted: "#8a8d94",
    faint: "#6f737a",
    green: "#59a869",
    greenBg: "#1e2e22",
    greenBd: "#2e4a34",
    red: "#c75450",
    redBg: "#2a1818",
    amber: "#c09a4e",
    amberBg: "#251e10",
} as const;

// ── Connection status ─────────────────────────────────────────────────────────

type ConnStatus = "idle" | "testing" | "ok" | "error";

const StatusBadge: React.FC<{ status: ConnStatus; error?: string }> = ({
    status, error,
}) => {
    if (status === "idle") return null;
    if (status === "testing") return (
        <span className="flex items-center gap-1 text-[11px]" style={{ color: C.muted }}>
            <Loader2Icon size={11} className="animate-spin" />
            Testing…
        </span>
    );
    if (status === "ok") return (
        <span className="flex items-center gap-1 text-[11px]" style={{ color: C.green }}>
            <CheckCircleIcon size={11} />
            Connected
        </span>
    );
    return (
        <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: C.red }}
            title={error}
        >
            <XCircleIcon size={11} />
            Failed
        </span>
    );
};

// ── Provider card ─────────────────────────────────────────────────────────────

const ProviderCard: React.FC<{
    provider: ProviderDef;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ provider, isSelected, onSelect }) => {
    const store = useProviderStore();
    const creds = store.credentials[provider.name] ?? {};
    const [showKey, setShowKey] = useState(false);
    const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
    const [connError, setConnError] = useState<string>();
    const [detected, setDetected] = useState<string[]>(
        store.detectedModels[provider.name] ?? []
    );

    const isConfigured = provider.authType === "none"
        || (provider.authType === "api_key" && !!creds.apiKey)
        || (provider.authType === "endpoint" && !!creds.endpoint)
        || (provider.authType === "api_key_and_endpoint" && !!creds.apiKey && !!creds.endpoint);

    const handleTest = async () => {
        setConnStatus("testing");
        setConnError(undefined);
        const result = await store.testConnection(provider.name);
        setConnStatus(result.ok ? "ok" : "error");
        if (!result.ok) setConnError(result.error);
    };

    const handleAutodetect = async () => {
        const models = await store.autodetectModels(provider.name);
        setDetected(models);
    };

    return (
        <div
            className="rounded-lg overflow-hidden transition-all duration-150"
            style={{
                backgroundColor: C.bg2,
                border: `1px solid ${isSelected ? C.green : C.border}`,
            }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={onSelect}
                style={{ borderBottom: `1px solid ${C.border}` }}
            >
                {provider.isLocal
                    ? <ServerIcon size={14} style={{ color: C.amber }} />
                    : <CloudIcon size={14} style={{ color: C.muted }} />
                }
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium" style={{ color: C.text }}>
                            {provider.label}
                        </span>
                        {isSelected && (
                            <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                    backgroundColor: C.greenBg,
                                    color: C.green,
                                    border: `1px solid ${C.greenBd}`,
                                }}
                            >
                                Active
                            </span>
                        )}
                        {provider.isLocal && (
                            <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                    backgroundColor: C.amberBg,
                                    color: C.amber,
                                    border: `1px solid #3a2e10`,
                                }}
                            >
                                Local
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: C.faint }}>
                        {provider.description}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={connStatus} error={connError} />
                    <ChevronRightIcon
                        size={13}
                        style={{
                            color: C.faint,
                            transform: isSelected ? "rotate(90deg)" : "none",
                            transition: "transform 0.15s",
                        }}
                    />
                </div>
            </div>

            {/* Body — only shown when selected */}
            {isSelected && (
                <div className="px-4 py-3 flex flex-col gap-3">

                    {/* API Key input */}
                    {(provider.authType === "api_key" ||
                        provider.authType === "api_key_and_endpoint") && (
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label
                                        className="text-[11px] font-medium"
                                        style={{ color: C.muted }}
                                    >
                                        {provider.apiKeyLabel ?? "API Key"}
                                    </label>
                                    {provider.apiKeyLink && (
                                        <Link
                                            href={provider.apiKeyLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[10px] transition-colors"
                                            style={{ color: C.green }}
                                        >
                                            Get key
                                            <ExternalLinkIcon size={9} />
                                        </Link>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 relative">
                                        <input
                                            type={showKey ? "text" : "password"}
                                            value={creds.apiKey ?? ""}
                                            onChange={e => store.setCredentials(
                                                provider.name,
                                                { apiKey: e.target.value }
                                            )}
                                            placeholder="sk-..."
                                            className="w-full px-3 py-1.5 rounded text-[12px] outline-none font-mono pr-8"
                                            style={{
                                                backgroundColor: C.bg3,
                                                border: `1px solid ${C.border}`,
                                                color: C.text,
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(v => !v)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2"
                                            style={{ color: C.faint }}
                                        >
                                            {showKey
                                                ? <EyeOffIcon size={12} />
                                                : <EyeIcon size={12} />
                                            }
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    {/* Endpoint input */}
                    {(provider.authType === "endpoint" ||
                        provider.authType === "api_key_and_endpoint") && (
                            <div>
                                <label
                                    className="text-[11px] font-medium block mb-1.5"
                                    style={{ color: C.muted }}
                                >
                                    {provider.endpointLabel ?? "Endpoint"}
                                </label>
                                <input
                                    type="text"
                                    value={creds.endpoint ?? provider.endpointDefault ?? ""}
                                    onChange={e => store.setCredentials(
                                        provider.name,
                                        { endpoint: e.target.value }
                                    )}
                                    placeholder={provider.endpointDefault ?? "http://localhost:11434"}
                                    className="w-full px-3 py-1.5 rounded text-[12px] outline-none font-mono"
                                    style={{
                                        backgroundColor: C.bg3,
                                        border: `1px solid ${C.border}`,
                                        color: C.text,
                                    }}
                                />
                            </div>
                        )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleTest}
                            disabled={!isConfigured || connStatus === "testing"}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors"
                            style={{
                                backgroundColor: isConfigured ? C.greenBg : C.bg3,
                                color: isConfigured ? C.green : C.faint,
                                border: `1px solid ${isConfigured ? C.greenBd : C.border}`,
                                cursor: isConfigured ? "pointer" : "not-allowed",
                            }}
                        >
                            {connStatus === "testing"
                                ? <Loader2Icon size={11} className="animate-spin" />
                                : <ZapIcon size={11} />
                            }
                            Test connection
                        </button>

                        {provider.supportsModelAutodetect && (
                            <button
                                onClick={handleAutodetect}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors"
                                style={{
                                    backgroundColor: C.bg3,
                                    color: C.muted,
                                    border: `1px solid ${C.border}`,
                                }}
                            >
                                <RefreshCwIcon size={11} />
                                Detect models
                            </button>
                        )}
                    </div>

                    {/* Detected models (Ollama / LM Studio) */}
                    {detected.length > 0 && (
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-[.07em] mb-1.5"
                                style={{ color: C.faint }}>
                                Detected models ({detected.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {detected.map(m => (
                                    <span
                                        key={m}
                                        className="text-[10px] px-2 py-0.5 rounded font-mono"
                                        style={{
                                            backgroundColor: C.bg3,
                                            color: C.muted,
                                            border: `1px solid ${C.border}`,
                                        }}
                                    >
                                        {m}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Model list */}
                    {provider.models.length > 0 && (
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-[.07em] mb-1.5"
                                style={{ color: C.faint }}>
                                Available models
                            </p>
                            <div className="flex flex-col gap-1">
                                {provider.models.map(model => (
                                    <div
                                        key={model.id}
                                        className="flex items-center gap-3 px-3 py-2 rounded"
                                        style={{
                                            backgroundColor: C.bg3,
                                            border: `1px solid ${C.border}`,
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px]" style={{ color: C.text }}>
                                                    {model.label}
                                                </span>
                                                {model.capabilities.includes("reasoning") && (
                                                    <span
                                                        className="text-[9px] px-1.5 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: "#1f3a5f",
                                                            color: "#79c0ff",
                                                            border: "1px solid #1f4280",
                                                        }}
                                                    >
                                                        thinking
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[10px] font-mono" style={{ color: C.faint }}>
                                                    {(model.contextWindow / 1000).toFixed(0)}K ctx
                                                </span>
                                                {model.costPer1kInput !== undefined && model.costPer1kInput > 0 && (
                                                    <span className="text-[10px]" style={{ color: C.faint }}>
                                                        ${model.costPer1kInput}/1K in
                                                        · ${model.costPer1kOutput}/1K out
                                                    </span>
                                                )}
                                                {model.costPer1kInput === 0 && (
                                                    <span className="text-[10px]" style={{ color: C.green }}>
                                                        free
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Model selector widget ─────────────────────────────────────────────────────

const GlobalModelSelector: React.FC = () => {
    const store = useProviderStore();
    const { provider, modelId } = store.globalModel;
    const currentProv = PROVIDERS.find(p => p.name === provider);

    return (
        <div
            className="rounded-lg p-4"
            style={{
                backgroundColor: C.bg2,
                border: `1px solid ${C.border}`,
            }}
        >
            <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-medium" style={{ color: C.text }}>
                    Global default model
                </p>
                <span className="text-[11px]" style={{ color: C.faint }}>
                    All new conversations use this
                </span>
            </div>

            <div className="flex items-center gap-3">
                {/* Provider select */}
                <select
                    value={provider}
                    onChange={e => {
                        const newProvider = e.target.value as ProviderName;
                        const defaultModel = getDefaultModel(newProvider);
                        store.setGlobalModel({
                            provider: newProvider,
                            modelId: defaultModel?.id ?? "",
                            reasoningEnabled: false,
                        });
                    }}
                    className="px-2 py-1.5 rounded text-[12px] outline-none"
                    style={{
                        backgroundColor: C.bg3,
                        border: `1px solid ${C.border}`,
                        color: C.text,
                    }}
                >
                    {PROVIDERS.map(p => (
                        <option key={p.name} value={p.name}>{p.label}</option>
                    ))}
                </select>

                {/* Model select */}
                <select
                    value={modelId}
                    onChange={e => store.setGlobalModel({
                        ...store.globalModel,
                        modelId: e.target.value,
                    })}
                    className="flex-1 px-2 py-1.5 rounded text-[12px] outline-none"
                    style={{
                        backgroundColor: C.bg3,
                        border: `1px solid ${C.border}`,
                        color: C.text,
                    }}
                >
                    {currentProv?.models.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                    {(store.detectedModels[provider] ?? []).map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                {/* Reasoning toggle */}
                {currentProv?.models.find(m => m.id === modelId)
                    ?.capabilities.includes("reasoning") && (
                        <button
                            onClick={() => store.setGlobalModel({
                                ...store.globalModel,
                                reasoningEnabled: !store.globalModel.reasoningEnabled,
                            })}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors"
                            style={{
                                backgroundColor: store.globalModel.reasoningEnabled
                                    ? "#1f3a5f" : C.bg3,
                                color: store.globalModel.reasoningEnabled
                                    ? "#79c0ff" : C.faint,
                                border: `1px solid ${store.globalModel.reasoningEnabled
                                    ? "#1f4280" : C.border}`,
                            }}
                        >
                            <ZapIcon size={11} />
                            Thinking
                        </button>
                    )}
            </div>
        </div>
    );
};

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const [selectedProvider, setSelectedProvider] =
        useState<ProviderName | null>(null);

    const cloudProviders = PROVIDERS.filter(p => !p.isLocal);
    const localProviders = PROVIDERS.filter(p => p.isLocal);

    return (
        <div
            className="min-h-screen"
            style={{ backgroundColor: C.bg, color: C.text }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-4 px-8 py-4 border-b"
                style={{ borderColor: C.border, backgroundColor: C.bg2 }}
            >
                <Link
                    href="/"
                    className="text-[13px] font-semibold"
                    style={{ color: C.text }}
                >
                    Ayn<span style={{ color: C.green }}>drome</span>
                </Link>
                <span style={{ color: C.border }}>/</span>
                <div className="flex items-center gap-2">
                    <SettingsIcon size={14} style={{ color: C.muted }} />
                    <span className="text-[13px]" style={{ color: C.muted }}>
                        Settings
                    </span>
                </div>
                <div className="ml-auto">
                    <Link
                        href="/"
                        className="text-[11px] px-3 py-1.5 rounded transition-colors"
                        style={{
                            backgroundColor: C.bg3,
                            color: C.muted,
                            border: `1px solid ${C.border}`,
                        }}
                    >
                        ← Back to IDE
                    </Link>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-3xl mx-auto px-8 py-8 flex flex-col gap-8">

                {/* Global model */}
                <section>
                    <h2
                        className="text-[11px] font-medium uppercase tracking-[.07em] mb-3"
                        style={{ color: C.faint }}
                    >
                        Model selection
                    </h2>
                    <GlobalModelSelector />
                </section>

                {/* Cloud providers */}
                <section>
                    <h2
                        className="text-[11px] font-medium uppercase tracking-[.07em] mb-3"
                        style={{ color: C.faint }}
                    >
                        Cloud providers
                    </h2>
                    <div className="flex flex-col gap-2">
                        {cloudProviders.map(p => (
                            <ProviderCard
                                key={p.name}
                                provider={p}
                                isSelected={selectedProvider === p.name}
                                onSelect={() =>
                                    setSelectedProvider(
                                        selectedProvider === p.name ? null : p.name
                                    )
                                }
                            />
                        ))}
                    </div>
                </section>

                {/* Local providers */}
                <section>
                    <h2
                        className="text-[11px] font-medium uppercase tracking-[.07em] mb-3"
                        style={{ color: C.faint }}
                    >
                        Local providers
                    </h2>
                    <div className="flex flex-col gap-2">
                        {localProviders.map(p => (
                            <ProviderCard
                                key={p.name}
                                provider={p}
                                isSelected={selectedProvider === p.name}
                                onSelect={() =>
                                    setSelectedProvider(
                                        selectedProvider === p.name ? null : p.name
                                    )
                                }
                            />
                        ))}
                    </div>
                </section>

                {/* Danger zone */}
                <section>
                    <h2
                        className="text-[11px] font-medium uppercase tracking-[.07em] mb-3"
                        style={{ color: C.faint }}
                    >
                        Data
                    </h2>
                    <div
                        className="rounded-lg p-4"
                        style={{
                            backgroundColor: C.bg2,
                            border: `1px solid ${C.border}`,
                        }}
                    >
                        <p className="text-[12px] mb-3" style={{ color: C.muted }}>
                            API keys are stored only in your browser's localStorage.
                            They are never sent to Ayndrome servers.
                        </p>
                        <button
                            onClick={() => {
                                if (confirm("Clear all saved API keys?")) {
                                    useProviderStore.setState({ credentials: {} });
                                }
                            }}
                            className="text-[11px] px-3 py-1.5 rounded transition-colors"
                            style={{
                                backgroundColor: C.redBg,
                                color: C.red,
                                border: `1px solid ${C.red ?? "#4a2828"}`,
                            }}
                        >
                            Clear all API keys
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}