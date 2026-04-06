// // src/app/api/_middleware/auth.ts
// // Shared auth + rate limiting for all /api/* routes.
// // Call requireAuth(req) at the top of every route handler.

// import { NextRequest, NextResponse } from "next/server";

// // ── Token validation ──────────────────────────────────────────────────────────
// // We validate Clerk JWTs using the Clerk SDK.
// // Falls back to a header check for internal service calls.

// export async function requireAuth(
//     req: NextRequest,
// ): Promise<{ userId: string } | NextResponse> {
//     // Internal service calls (watcher bridge, etc.)
//     const internalSecret = req.headers.get("x-internal-secret");
//     if (
//         internalSecret &&
//         internalSecret === process.env.INTERNAL_SECRET
//     ) {
//         return { userId: "internal-service" };
//     }

//     // Clerk JWT from Authorization header
//     const token = req.headers
//         .get("authorization")
//         ?.replace("Bearer ", "")
//         .trim();

//     if (!token) {
//         return NextResponse.json(
//             { error: "Unauthorized — missing token" },
//             { status: 401 }
//         );
//     }

//     try {
//         const { verifyToken } = await import("@clerk/backend");

//         const payload = await verifyToken(token, {
//             secretKey: process.env.CLERK_SECRET_KEY!,
//         });

//         if (!payload?.sub) throw new Error("Invalid token payload");
//         return { userId: payload.sub };

//     } catch (err: any) {
//         console.error("[Auth] Token verification failed:", err.message);
//         return NextResponse.json(
//             { error: "Unauthorized — invalid token" },
//             { status: 401 }
//         );
//     }
// }

// // ── Rate limiting ─────────────────────────────────────────────────────────────
// // In-memory sliding window rate limiter.
// // For production use Redis (Upstash) — this works fine for single-server.

// type RateLimitEntry = {
//     count: number;
//     windowStart: number;
// };

// const rateLimitStore = new Map<string, RateLimitEntry>();

// const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
//     "/api/terminal": { maxRequests: 60, windowMs: 60_000 },   // 60/min
//     "/api/files": { maxRequests: 200, windowMs: 60_000 },   // 200/min
//     "/api/workspace": { maxRequests: 20, windowMs: 60_000 },   // 20/min
//     "default": { maxRequests: 100, windowMs: 60_000 },   // 100/min
// };

// export function checkRateLimit(
//     userId: string,
//     pathname: string,
// ): { allowed: boolean; retryAfter?: number } {
//     const config = RATE_LIMITS[pathname] ?? RATE_LIMITS["default"];
//     const key = `${userId}:${pathname}`;
//     const now = Date.now();

//     const entry = rateLimitStore.get(key);

//     if (!entry || now - entry.windowStart > config.windowMs) {
//         // New window
//         rateLimitStore.set(key, { count: 1, windowStart: now });
//         return { allowed: true };
//     }

//     if (entry.count >= config.maxRequests) {
//         const retryAfter = Math.ceil(
//             (entry.windowStart + config.windowMs - now) / 1000
//         );
//         return { allowed: false, retryAfter };
//     }

//     entry.count++;
//     return { allowed: true };
// }

// export function rateLimitResponse(retryAfter: number): NextResponse {
//     return NextResponse.json(
//         { error: "Rate limit exceeded", retryAfter },
//         {
//             status: 429,
//             headers: { "Retry-After": String(retryAfter) },
//         }
//     );
// }

// // ── Path traversal guard ──────────────────────────────────────────────────────
// // Call this on every file path received from the client.

// export function validateFilePath(
//     filePath: string,
//     workspacePath: string,
// ): { valid: boolean; reason?: string } {
//     if (!filePath) {
//         return { valid: false, reason: "Empty file path" };
//     }

//     // Reject null bytes
//     if (filePath.includes("\0")) {
//         return { valid: false, reason: "Null byte in path" };
//     }

//     // Reject absolute paths
//     if (filePath.startsWith("/") || filePath.match(/^[A-Za-z]:\\/)) {
//         return { valid: false, reason: "Absolute paths not allowed" };
//     }

//     // Reject traversal sequences
//     const normalized = filePath.replace(/\\/g, "/");
//     if (
//         normalized.includes("../") ||
//         normalized.includes("./..") ||
//         normalized.startsWith("..") ||
//         normalized.includes("/../")
//     ) {
//         return { valid: false, reason: "Path traversal not allowed" };
//     }

//     // Reject suspicious patterns
//     const dangerous = ["/etc/", "/proc/", "/sys/", "/root/", "~/.ssh", "~/.aws"];
//     if (dangerous.some(d => normalized.includes(d))) {
//         return { valid: false, reason: "Access to system paths not allowed" };
//     }

//     // Max path length
//     if (filePath.length > 500) {
//         return { valid: false, reason: "Path too long" };
//     }

//     return { valid: true };
// }

// // ── Payload size guard ────────────────────────────────────────────────────────

// export function validatePayloadSize(
//     content: string | undefined,
//     maxBytes: number = 2 * 1024 * 1024,  // 2MB default
// ): { valid: boolean; reason?: string } {
//     if (!content) return { valid: true };

//     const bytes = new TextEncoder().encode(content).length;
//     if (bytes > maxBytes) {
//         return {
//             valid: false,
//             reason: `Payload too large: ${(bytes / 1024 / 1024).toFixed(1)}MB (max ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
//         };
//     }
//     return { valid: true };
// }

// // ── Thread corruption recovery ────────────────────────────────────────────────

// export function safeParseThread(data: string): object | null {
//     try {
//         const parsed = JSON.parse(data);
//         if (typeof parsed !== "object" || parsed === null) return null;
//         return parsed;
//     } catch {
//         return null;
//     }
// }




// src/app/api/_middleware/auth.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// ── Rate limiting ─────────────────────────────────────────────────────────────

type RateLimitEntry = {
    count: number;
    windowStart: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
    "/api/terminal": { maxRequests: 60, windowMs: 60_000 },
    "/api/files": { maxRequests: 200, windowMs: 60_000 },
    "/api/workspace": { maxRequests: 20, windowMs: 60_000 },
    "default": { maxRequests: 100, windowMs: 60_000 },
};

export function checkRateLimit(
    userId: string,
    pathname: string,
): { allowed: boolean; retryAfter?: number } {
    const config = RATE_LIMITS[pathname] ?? RATE_LIMITS["default"];
    const key = `${userId}:${pathname}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > config.windowMs) {
        rateLimitStore.set(key, { count: 1, windowStart: now });
        return { allowed: true };
    }

    if (entry.count >= config.maxRequests) {
        const retryAfter = Math.ceil(
            (entry.windowStart + config.windowMs - now) / 1000
        );
        return { allowed: false, retryAfter };
    }

    entry.count++;
    return { allowed: true };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
    return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
        }
    );
}

// ── Path traversal guard ──────────────────────────────────────────────────────

export function validateFilePath(
    filePath: string,
    workspacePath: string,
): { valid: boolean; reason?: string } {
    if (!filePath) return { valid: false, reason: "Empty file path" };
    if (filePath.includes("\0")) return { valid: false, reason: "Null byte in path" };

    // if (filePath.startsWith("/") || filePath.match(/^[A-Za-z]:\\/)) {
    //     return { valid: false, reason: "Absolute paths not allowed" };
    // }

    const normalized = filePath.replace(/\\/g, "/");
    if (
        normalized.includes("../") ||
        normalized.includes("./..") ||
        normalized.startsWith("..") ||
        normalized.includes("/../")
    ) {
        return { valid: false, reason: "Path traversal not allowed" };
    }

    const dangerous = ["/etc/", "/proc/", "/sys/", "/root/", "~/.ssh", "~/.aws"];
    if (dangerous.some(d => normalized.includes(d))) {
        return { valid: false, reason: "Access to system paths not allowed" };
    }

    if (filePath.length > 500) {
        return { valid: false, reason: "Path too long" };
    }

    return { valid: true };
}

// ── Payload size guard ────────────────────────────────────────────────────────

export function validatePayloadSize(
    content: string | undefined,
    maxBytes: number = 2 * 1024 * 1024,
): { valid: boolean; reason?: string } {
    if (!content) return { valid: true };
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > maxBytes) {
        return {
            valid: false,
            reason: `Payload too large: ${(bytes / 1024 / 1024).toFixed(1)}MB (max ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
        };
    }
    return { valid: true };
}

// ── Main auth function ────────────────────────────────────────────────────────

export async function requireAuth(
    req: NextRequest,
): Promise<{ userId: string } | NextResponse> {

    // ── Internal service calls ─────────────────────────────────────────────
    const internalSecret = req.headers.get("x-internal-secret");
    if (
        internalSecret &&
        process.env.INTERNAL_SECRET &&
        internalSecret === process.env.INTERNAL_SECRET
    ) {
        return { userId: "internal-service" };
    }

    // ── Clerk session cookie (browser requests) ────────────────────────────
    // Read the __session or __clerk_db_jwt cookie directly.
    // This works even if Clerk can't detect proxy.ts by name.
    const sessionToken =
        req.cookies.get("__session")?.value ??
        req.cookies.get("__clerk_db_jwt")?.value;

    if (sessionToken) {
        try {
            const { verifyToken } = await import("@clerk/backend");
            const payload = await verifyToken(sessionToken, {
                secretKey: process.env.CLERK_SECRET_KEY!,
            });
            if (payload?.sub) {
                return { userId: payload.sub };
            }
        } catch {
            // Session cookie invalid or expired — fall through
        }
    }

    // ── Bearer token (external API clients) ───────────────────────────────
    const bearer = req.headers
        .get("authorization")
        ?.replace("Bearer ", "")
        .trim();

    if (bearer) {
        try {
            const { verifyToken } = await import("@clerk/backend");
            const payload = await verifyToken(bearer, {
                secretKey: process.env.CLERK_SECRET_KEY!,
            });
            if (payload?.sub) {
                return { userId: payload.sub };
            }
        } catch { }
    }

    return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
    );
}