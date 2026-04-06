// src/app/api/model-providers/models/route.ts
// Autodetects available models from local endpoints (Ollama, LM Studio).

import { NextRequest, NextResponse } from "next/server";
import { ProviderName } from "@/src/lib/model-provider/provider-registry";

export async function POST(req: NextRequest) {
    try {
        const { provider, endpoint } = await req.json() as {
            provider: ProviderName;
            endpoint: string;
        };

        const base = endpoint?.replace(/\/$/, "");

        if (provider === "ollama") {
            const res = await fetch(`${base}/api/tags`);
            if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
            const data = await res.json();
            const models = (data.models ?? []).map((m: any) => m.name as string);
            return NextResponse.json({ models });
        }

        if (provider === "lmstudio") {
            const res = await fetch(`${base}/v1/models`);
            if (!res.ok) throw new Error(`LM Studio returned ${res.status}`);
            const data = await res.json();
            const models = (data.data ?? []).map((m: any) => m.id as string);
            return NextResponse.json({ models });
        }

        return NextResponse.json({ models: [] });

    } catch (err: any) {
        return NextResponse.json({ models: [], error: err.message });
    }
}