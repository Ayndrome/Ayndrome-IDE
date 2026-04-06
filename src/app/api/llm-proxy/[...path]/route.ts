// src/app/api/llm-proxy/[...path]/route.ts
// Server-side proxy for LLM API calls.
// Solves CORS: browser → our server → provider API → stream response back.
// The first path segment is the provider name, the rest is forwarded.
//
// Example: POST /api/llm-proxy/anthropic/v1/messages
//   → forwards to POST https://api.anthropic.com/v1/messages

import { NextRequest } from "next/server";

const PROVIDER_BASES: Record<string, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
    google: "https://generativelanguage.googleapis.com",
    deepseek: "https://api.deepseek.com",
    xai: "https://api.x.ai",
    groq: "https://api.groq.com/openai",
    mistral: "https://api.mistral.ai",
    openrouter: "https://openrouter.ai/api",
};

// Headers that should NOT be forwarded to the upstream provider
const STRIP_HEADERS = new Set([
    "host",
    "connection",
    "transfer-encoding",
    "keep-alive",
    "upgrade",
    "expect",
    "content-length", // recalculated by fetch
]);

async function proxyRequest(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path } = await params;
    const [provider, ...rest] = path;

    const baseUrl = PROVIDER_BASES[provider];
    if (!baseUrl) {
        return new Response(
            JSON.stringify({ error: `Unknown provider: ${provider}` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    // Build target URL with query params preserved
    const targetPath = rest.join("/");
    const search = req.nextUrl.search; // includes leading "?"
    const targetUrl = `${baseUrl}/${targetPath}${search}`;

    // Forward headers (strip hop-by-hop headers)
    const fwdHeaders = new Headers();
    req.headers.forEach((value, key) => {
        if (!STRIP_HEADERS.has(key.toLowerCase())) {
            fwdHeaders.set(key, value);
        }
    });

    // Read body (for POST/PUT/PATCH)
    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
        body = await req.text();
    }

    try {
        const upstream = await fetch(targetUrl, {
            method: req.method,
            headers: fwdHeaders,
            body: body || undefined,
        });

        // Build response headers (forward content-type and other useful headers)
        const responseHeaders = new Headers();
        const forwardResponseHeaders = [
            "content-type",
            "x-request-id",
            "anthropic-ratelimit-requests-limit",
            "anthropic-ratelimit-requests-remaining",
            "x-ratelimit-limit-requests",
            "x-ratelimit-remaining-requests",
        ];
        for (const h of forwardResponseHeaders) {
            const v = upstream.headers.get(h);
            if (v) responseHeaders.set(h, v);
        }

        // Stream the response body directly back to the client
        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: `Proxy error: ${err.message}` }),
            { status: 502, headers: { "Content-Type": "application/json" } },
        );
    }
}

export const POST = proxyRequest;
export const GET = proxyRequest;

// Next.js config: no body size limit, streaming enabled
export const runtime = "nodejs";
export const maxDuration = 120;
