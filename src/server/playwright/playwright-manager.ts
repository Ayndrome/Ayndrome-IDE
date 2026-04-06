import { chromium, Browser, BrowserContext, Page } from "playwright";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';


// ── Singleton browser ─────────────────────────────────────────────────────────
let _browser: Browser | null = null;


async function getBrowser(): Promise<Browser> {
    if (_browser?.isConnected()) return _browser;
    _browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    });

    console.log("[Playwright] Browser launched");
    return _browser;
}

// ── Session registry ──────────────────────────────────────────────────────────
// One context per workspace — preserves cookies/localStorage across calls


type PlaywrightSession = {
    context: BrowserContext;
    workspaceId: string;
    createdAt: number;
    lastUsedAt: number;
};

const sessions = new Map<string, PlaywrightSession>();

async function getSession(workspaceId: string): Promise<BrowserContext> {
    const existing = sessions.get(workspaceId);

    if (existing) {
        existing.lastUsedAt = Date.now();
        return existing.context;
    }


    const browser = await getBrowser();
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        ignoreHTTPSErrors: true,
    });


    sessions.set(workspaceId, {
        context,
        workspaceId,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
    });

    return context;


}


// ── Screenshot dir ────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.join(os.tmpdir(), "ayndrome-screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function screenshotPath(name: string): string {
    return path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScreenshotResult = {

    base64: string;
    width: number;
    height: number;
    url: string;
    timestamp: number;
    filePath: string;

};

export type PageStateResult = {

    screenshot: ScreenshotResult;
    consoleErrors: string[];
    networkErrors: string[];
    domSnapshot: string;
    title: string;
    url: string;

};

export type InteractionStep =
    | { action: "click"; selector: string }
    | { action: "type"; selector: string; text: string }
    | { action: "navigate"; url: string }
    | { action: "wait"; selector: string; timeoutMs?: number }
    | { action: "waitForUrl"; pattern: string }
    | { action: "hover"; selector: string }
    | { action: "select"; selector: string; value: string }
    | { action: "press"; key: string }
    | { action: "screenshot" }
    | { action: "scroll"; selector?: string; direction: "up" | "down" }
    | { action: "clear"; selector: string }
    | { action: "assert"; selector: string; text?: string; visible?: boolean };


export type InteractionResult = {
    steps: Array<{ step: InteractionStep; success: boolean; error?: string; screenshotBase64?: string }>;
    finalScreenshot: ScreenshotResult;
    passed: boolean;
    errors: string[];
};


export type TestResult = {
    passed: number;
    failed: number;
    skipped: number;
    output: string;
    duration: number;
    failures: Array<{ test: string; error: string; screenshotPath?: string }>;
};

// ── Core: take screenshot ─────────────────────────────────────────────────────

export async function takeScreenshot(opts: {
    workspaceId: string;
    url: string;
    fullPage?: boolean;
    viewport?: { width: number; height: number };
    waitFor?: "load" | "networkidle" | "domcontentloaded";
    selector?: string;   // screenshot specific element
}): Promise<ScreenshotResult> {
    const {
        workspaceId,
        url,
        fullPage = false,
        viewport = { width: 1280, height: 800 },
        waitFor = "networkidle",
        selector,
    } = opts;

    const context = await getSession(workspaceId);

    // Update viewport if needed
    for (const page of context.pages()) {
        await page.setViewportSize(viewport);
    }

    const page = context.pages()[0] ?? await context.newPage();
    await page.setViewportSize(viewport);

    // Navigate if different URL
    if (page.url() !== url) {
        await page.goto(url, {
            waitUntil: waitFor,
            timeout: 30_000,
        });
    } else {
        await page.waitForLoadState(waitFor, { timeout: 10_000 }).catch(() => { });
    }

    const outPath = screenshotPath(`${workspaceId}-screenshot`);
    let buffer: Buffer;

    if (selector) {
        const el = await page.$(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        buffer = await el.screenshot();
    } else {
        buffer = await page.screenshot({ fullPage, path: outPath });
    }

    if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, buffer);

    return {
        base64: buffer.toString("base64"),
        width: viewport.width,
        height: viewport.height,
        url: page.url(),
        timestamp: Date.now(),
        filePath: outPath,
    };
}



// ── Core: capture full page state ─────────────────────────────────────────────

export async function capturePageState(opts: {
    workspaceId: string;
    url: string;
    viewport?: { width: number; height: number };
}): Promise<PageStateResult> {
    const { workspaceId, url, viewport = { width: 1280, height: 800 } } = opts;

    const context = await getSession(workspaceId);
    const page = context.pages()[0] ?? await context.newPage();
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // Collect console errors
    const consoleHandler = (msg: any) => {
        if (msg.type() === "error" || msg.type() === "warn") {
            consoleErrors.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
        }
    };

    // Collect network errors
    const networkHandler = (res: any) => {
        if (res.status() >= 400) {
            networkErrors.push(`${res.status()} ${res.url()}`);
        }
    };

    page.on("console", consoleHandler);
    page.on("response", networkHandler);

    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait a tick for any late console errors
    await page.waitForTimeout(500);

    page.off("console", consoleHandler);
    page.off("response", networkHandler);

    // DOM snapshot — simplified structure, not full HTML
    const domSnapshot = await page.evaluate(() => {
        const simplify = (el: Element, depth: number): string => {
            if (depth > 4) return "";
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : "";
            const cls = el.className && typeof el.className === "string"
                ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
                : "";
            const text = el.children.length === 0
                ? el.textContent?.trim().slice(0, 40) ?? ""
                : "";
            const textStr = text ? ` "${text}"` : "";
            const children = Array.from(el.children)
                .slice(0, 8)
                .map(c => "  ".repeat(depth) + simplify(c, depth + 1))
                .filter(Boolean)
                .join("\n");
            return `${tag}${id}${cls}${textStr}${children ? "\n" + children : ""}`;
        };
        return simplify(document.body, 0);
    });

    const screenshot = await takeScreenshot({ workspaceId, url, viewport });

    return {
        screenshot,
        consoleErrors,
        networkErrors,
        domSnapshot: domSnapshot.slice(0, 3000),
        title: await page.title(),
        url: page.url(),
    };
}


// ── Core: run interaction script ──────────────────────────────────────────────

export async function runInteractionScript(opts: {
    workspaceId: string;
    url: string;
    steps: InteractionStep[];
    viewport?: { width: number; height: number };
    screenshotOnEachStep?: boolean;
}): Promise<InteractionResult> {
    const {
        workspaceId,
        url,
        steps,
        viewport = { width: 1280, height: 800 },
        screenshotOnEachStep = false,
    } = opts;

    const context = await getSession(workspaceId);
    const page = context.pages()[0] ?? await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    const results: InteractionResult["steps"] = [];
    const errors: string[] = [];

    for (const step of steps) {
        let success = true;
        let error: string | undefined;
        let shotBase64: string | undefined;

        try {
            switch (step.action) {

                case "click": {
                    await page.waitForSelector(step.selector, { timeout: 8_000 });
                    await page.click(step.selector);
                    break;
                }

                case "type": {
                    await page.waitForSelector(step.selector, { timeout: 8_000 });
                    await page.fill(step.selector, step.text);
                    break;
                }

                case "clear": {
                    await page.waitForSelector(step.selector, { timeout: 8_000 });
                    await page.fill(step.selector, "");
                    break;
                }

                case "navigate": {
                    await page.goto(step.url, { waitUntil: "networkidle", timeout: 20_000 });
                    break;
                }

                case "wait": {
                    await page.waitForSelector(
                        step.selector,
                        { timeout: step.timeoutMs ?? 10_000 }
                    );
                    break;
                }

                case "waitForUrl": {
                    await page.waitForURL(new RegExp(step.pattern), { timeout: 15_000 });
                    break;
                }

                case "hover": {
                    await page.waitForSelector(step.selector, { timeout: 8_000 });
                    await page.hover(step.selector);
                    break;
                }

                case "select": {
                    await page.waitForSelector(step.selector, { timeout: 8_000 });
                    await page.selectOption(step.selector, step.value);
                    break;
                }

                case "press": {
                    await page.keyboard.press(step.key);
                    break;
                }

                case "scroll": {
                    if (step.selector) {
                        const el = await page.$(step.selector);
                        if (el) await el.scrollIntoViewIfNeeded();
                    } else {
                        await page.evaluate((dir) => {
                            window.scrollBy(0, dir === "down" ? 500 : -500);
                        }, step.direction);
                    }
                    break;
                }

                case "assert": {
                    if (step.visible !== undefined) {
                        const el = await page.$(step.selector);
                        const isVisible = el !== null && await el.isVisible();
                        if (isVisible !== step.visible) {
                            throw new Error(
                                `Element ${step.selector} visibility: expected ${step.visible}, got ${isVisible}`
                            );
                        }
                    }
                    if (step.text !== undefined) {
                        const el = await page.$(step.selector);
                        if (!el) throw new Error(`Element not found: ${step.selector}`);
                        const text = await el.textContent() ?? "";
                        if (!text.includes(step.text)) {
                            throw new Error(
                                `Expected "${step.text}" in element text, got "${text.slice(0, 100)}"`
                            );
                        }
                    }
                    break;
                }

                case "screenshot": {
                    const buf = await page.screenshot();
                    shotBase64 = buf.toString("base64");
                    break;
                }
            }

            // Optional per-step screenshot
            if (screenshotOnEachStep && step.action !== "screenshot") {
                const buf = await page.screenshot();
                shotBase64 = buf.toString("base64");
            }

        } catch (err: any) {
            success = false;
            error = err.message;
            errors.push(`Step "${step.action}": ${err.message}`);

            // Always screenshot on failure
            try {
                const buf = await page.screenshot();
                shotBase64 = buf.toString("base64");
            } catch { }
        }

        results.push({ step, success, error, screenshotBase64: shotBase64 });

        // Stop on first failure for assertion steps
        if (!success && step.action === "assert") break;
    }

    const finalShot = await takeScreenshot({ workspaceId, url: page.url(), viewport });

    return {
        steps: results,
        finalScreenshot: finalShot,
        passed: errors.length === 0,
        errors,
    };
}



// ── Core: run Playwright test file ────────────────────────────────────────────

export async function runPlaywrightTests(opts: {
    workspaceId: string;
    testFile?: string;    // specific file, or run all
    pattern?: string;    // grep pattern for test names
    timeout?: number;
    onChunk?: (chunk: string) => void;
}): Promise<TestResult> {
    const {
        workspaceId,
        testFile,
        pattern,
        timeout = 60_000,
        onChunk,
    } = opts;

    const { execInSandbox } = await import("../sandbox/sandbox-manager");

    // Write a minimal playwright config into the workspace if not present
    const configCmd = `
        test -f /workspace/playwright.config.ts || cat > /workspace/playwright.config.ts << 'EOF'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },
});
EOF
    `;

    await execInSandbox(workspaceId, configCmd, { cwd: "/workspace" });

    // Build the test command
    const parts = ["npx", "playwright", "test"];
    if (testFile) parts.push(testFile);
    if (pattern) parts.push("--grep", `"${pattern}"`);
    parts.push("--reporter=json");

    const command = parts.join(" ");
    const start = Date.now();

    let rawOutput = "";
    const result = await execInSandbox(workspaceId, command, {
        cwd: "/workspace",
        timeoutMs: timeout,
        onStdout: (chunk) => {
            rawOutput += chunk;
            onChunk?.(chunk);
        },
        onStderr: (chunk) => {
            rawOutput += chunk;
            onChunk?.(chunk);
        },
    });

    const duration = Date.now() - start;

    // Parse JSON reporter output
    try {
        const jsonStart = rawOutput.indexOf("{");
        if (jsonStart !== -1) {
            const jsonStr = rawOutput.slice(jsonStart);
            const report = JSON.parse(jsonStr);

            const failures: TestResult["failures"] = [];
            let passed = 0;
            let failed = 0;
            let skipped = 0;

            for (const suite of report.suites ?? []) {
                for (const spec of suite.specs ?? []) {
                    for (const test of spec.tests ?? []) {
                        const status = test.results?.[0]?.status;
                        if (status === "passed") passed++;
                        else if (status === "skipped") skipped++;
                        else {
                            failed++;
                            failures.push({
                                test: spec.title,
                                error: test.results?.[0]?.error?.message ?? "Unknown error",
                                screenshotPath: test.results?.[0]?.attachments
                                    ?.find((a: any) => a.name === "screenshot")?.path,
                            });
                        }
                    }
                }
            }

            return { passed, failed, skipped, output: rawOutput, duration, failures };
        }
    } catch { }

    // Fallback — parse from text output
    const passMatch = rawOutput.match(/(\d+) passed/);
    const failMatch = rawOutput.match(/(\d+) failed/);
    const skipMatch = rawOutput.match(/(\d+) skipped/);

    return {
        passed: parseInt(passMatch?.[1] ?? "0", 10),
        failed: parseInt(failMatch?.[1] ?? "0", 10),
        skipped: parseInt(skipMatch?.[1] ?? "0", 10),
        output: rawOutput,
        duration,
        failures: [],
    };
}


// ── Dev server: wait until ready ──────────────────────────────────────────────

export async function waitUntilReady(opts: {
    url: string;
    timeoutMs?: number;
    successStatus?: number;
    pattern?: string;   // optional text pattern in response body
    onProgress?: (msg: string) => void;
}): Promise<{ ready: boolean; timeMs: number; error?: string }> {
    const {
        url,
        timeoutMs = 30_000,
        successStatus = 200,
        pattern,
        onProgress,
    } = opts;

    const start = Date.now();
    const INTERVAL = 500;

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (res.status === successStatus) {
                if (pattern) {
                    const body = await res.text();
                    if (!body.includes(pattern)) {
                        await new Promise(r => setTimeout(r, INTERVAL));
                        continue;
                    }
                }
                const timeMs = Date.now() - start;
                onProgress?.(`Server ready at ${url} (${timeMs}ms)`);
                return { ready: true, timeMs };
            }
        } catch { }

        const elapsed = Date.now() - start;
        onProgress?.(`Waiting for ${url}… (${Math.round(elapsed / 1000)}s)`);
        await new Promise(r => setTimeout(r, INTERVAL));
    }

    return {
        ready: false,
        timeMs: Date.now() - start,
        error: `Server not ready after ${timeoutMs}ms at ${url}`,
    };
}

// ── Port detector ─────────────────────────────────────────────────────────────
// Extracts port number from dev server output

export function detectPort(output: string): number | null {
    const patterns = [
        /localhost:(\d+)/,
        /port\s+(\d+)/i,
        /:(\d{4,5})\b/,
        /http:\/\/[^:]+:(\d+)/,
    ];
    for (const re of patterns) {
        const match = output.match(re);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export async function closeSession(workspaceId: string): Promise<void> {
    const session = sessions.get(workspaceId);
    if (session) {
        await session.context.close();
        sessions.delete(workspaceId);
    }
}

export async function cleanupIdleSessions(): Promise<void> {
    const IDLE_MS = 20 * 60 * 1000;
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        if (now - session.lastUsedAt > IDLE_MS) {
            await session.context.close().catch(() => { });
            sessions.delete(id);
            console.log(`[Playwright] Closed idle session: ${id}`);
        }
    }
}

export async function shutdown(): Promise<void> {
    for (const session of sessions.values()) {
        await session.context.close().catch(() => { });
    }
    sessions.clear();
    await _browser?.close().catch(() => { });
    _browser = null;
}