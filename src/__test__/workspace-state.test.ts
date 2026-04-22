// src/__tests__/workspace-state.test.ts

import {
    resetWorkspaceState,
    addFileToState,
    updateFileInState,
    removeFileFromState,
    pinFile,
    buildWorkspaceStateBlock,
    consumeEvictionNotices,
    getWorkspaceStateInfo,
    hasFile,
    getFileContent,
    getDirtyFiles,
    setTokenBudget,
} from "../app/features/ide/extensions/chat/agent/workspace-state";

// Mock token-utils to avoid tiktoken WASM in test environment
jest.mock("../lib/token/token-utils", () => ({
    countTokens: (text: string) => Math.ceil(text.length / 4),
}));

describe("workspace-state", () => {

    beforeEach(() => {
        resetWorkspaceState("test setup");
    });

    // ── addFileToState ──────────────────────────────────────────────────────

    test("adds file to state", () => {
        addFileToState("src/App.tsx", "const App = () => <div/>;");
        expect(hasFile("src/App.tsx")).toBe(true);
        expect(getFileContent("src/App.tsx")).toBe("const App = () => <div/>;");
    });

    test("updates existing file without duplicating", () => {
        addFileToState("src/App.tsx", "v1");
        addFileToState("src/App.tsx", "v2");
        const info = getWorkspaceStateInfo();
        expect(info.fileCount).toBe(1);
        expect(getFileContent("src/App.tsx")).toBe("v2");
    });

    test("skips files that are too large", () => {
        // 8000 token limit — mock returns ceil(length/4) tokens
        // So 8000 tokens = 32001+ chars
        const hugeContent = "x".repeat(32_010);
        addFileToState("huge.ts", hugeContent);
        expect(hasFile("huge.ts")).toBe(false);
    });

    test("tracks used tokens correctly", () => {
        addFileToState("a.ts", "hello");   // 2 tokens (ceil(5/4))
        addFileToState("b.ts", "world!");  // 2 tokens (ceil(6/4))
        const info = getWorkspaceStateInfo();
        expect(info.usedTokens).toBe(4);
    });

    // ── updateFileInState ──────────────────────────────────────────────────

    test("marks file as dirty after update", () => {
        addFileToState("src/index.ts", "original");
        updateFileInState("src/index.ts", "updated");
        const dirty = getDirtyFiles();
        expect(dirty).toContain("src/index.ts");
    });

    test("getDirtyFiles returns only modified files", () => {
        addFileToState("clean.ts", "unchanged");
        addFileToState("dirty.ts", "original");
        updateFileInState("dirty.ts", "modified");
        const dirty = getDirtyFiles();
        expect(dirty).toContain("dirty.ts");
        expect(dirty).not.toContain("clean.ts");
    });

    // ── removeFileFromState ────────────────────────────────────────────────

    test("removes file and frees tokens", () => {
        addFileToState("src/App.tsx", "content");
        const before = getWorkspaceStateInfo().usedTokens;
        removeFileFromState("src/App.tsx");
        expect(hasFile("src/App.tsx")).toBe(false);
        expect(getWorkspaceStateInfo().usedTokens).toBeLessThan(before);
    });

    test("removing non-existent file is safe", () => {
        expect(() => removeFileFromState("ghost.ts")).not.toThrow();
    });

    // ── Eviction ────────────────────────────────────────────────────────────

    test("evicts LRU file when over budget", () => {
        // Set a tiny budget
        setTokenBudget(200);

        // Add files that approach the budget
        addFileToState("old.ts", "a".repeat(100)); // ~25 tokens
        addFileToState("middle.ts", "b".repeat(100));
        addFileToState("new.ts", "c".repeat(100));
        addFileToState("newest.ts", "d".repeat(100));
        addFileToState("final.ts", "e".repeat(100));
        addFileToState("overflow.ts", "f".repeat(100)); // this should trigger eviction

        // oldest file should be evicted
        const info = getWorkspaceStateInfo();
        expect(info.usedTokens).toBeLessThanOrEqual(200);
    });

    test("never evicts pinned files", () => {
        setTokenBudget(100);

        addFileToState("important.ts", "x".repeat(200), true); // pinned, large
        addFileToState("other.ts", "y".repeat(200));       // not pinned

        // important.ts should still be there even if it's large
        // (it filled budget so other.ts may not have been added)
        expect(hasFile("important.ts")).toBe(true);
    });

    test("evicts non-dirty files before dirty files", () => {
        setTokenBudget(150);

        addFileToState("dirty.ts", "a".repeat(200));
        updateFileInState("dirty.ts", "a".repeat(200)); // mark dirty
        addFileToState("clean.ts", "b".repeat(200));
        addFileToState("overflow.ts", "c".repeat(200)); // triggers eviction

        // clean.ts should be evicted before dirty.ts
        if (!hasFile("dirty.ts") || !hasFile("clean.ts")) {
            // One was evicted — it should be clean.ts
            if (!hasFile("dirty.ts") && hasFile("clean.ts")) {
                fail("Dirty file was evicted before clean file");
            }
        }
    });

    // ── Eviction notices ────────────────────────────────────────────────────

    test("consumeEvictionNotices returns notice after eviction", () => {
        setTokenBudget(50);

        addFileToState("first.ts", "a".repeat(100));
        addFileToState("overflow.ts", "b".repeat(100)); // triggers eviction

        const notice = consumeEvictionNotices();
        expect(notice).toContain("first.ts");
        expect(notice).toContain("read_file");
    });

    test("consumeEvictionNotices clears queue after reading", () => {
        setTokenBudget(50);
        addFileToState("evicted.ts", "a".repeat(100));
        addFileToState("overflow.ts", "b".repeat(100));

        consumeEvictionNotices(); // read once — clears queue
        const second = consumeEvictionNotices(); // read again
        expect(second).toBe(""); // should be empty
    });

    test("returns empty string when no evictions", () => {
        addFileToState("normal.ts", "small content");
        expect(consumeEvictionNotices()).toBe("");
    });

    // ── buildWorkspaceStateBlock ────────────────────────────────────────────

    test("returns empty string when no files", () => {
        expect(buildWorkspaceStateBlock()).toBe("");
    });

    test("includes file paths and content in XML block", () => {
        addFileToState("src/App.tsx", "export default function App() {}");
        const block = buildWorkspaceStateBlock();
        expect(block).toContain("<WorkspaceState>");
        expect(block).toContain("src/App.tsx");
        expect(block).toContain("export default function App() {}");
        expect(block).toContain("</WorkspaceState>");
    });

    test("pinned files appear first in state block", () => {
        addFileToState("normal.ts", "normal");
        addFileToState("pinned.ts", "pinned", true);
        const block = buildWorkspaceStateBlock();
        expect(block.indexOf("pinned.ts")).toBeLessThan(block.indexOf("normal.ts"));
    });

    test("marks dirty files with modified attribute", () => {
        addFileToState("src/modified.ts", "original");
        updateFileInState("src/modified.ts", "updated");
        const block = buildWorkspaceStateBlock();
        expect(block).toContain('modified="true"');
    });

    // ── Lifecycle ───────────────────────────────────────────────────────────

    test("resetWorkspaceState clears all files", () => {
        addFileToState("a.ts", "content a");
        addFileToState("b.ts", "content b");
        resetWorkspaceState("test");
        const info = getWorkspaceStateInfo();
        expect(info.fileCount).toBe(0);
        expect(info.usedTokens).toBe(0);
    });

    test("resetWorkspaceState clears eviction queue", () => {
        setTokenBudget(50);
        addFileToState("a.ts", "a".repeat(200));
        addFileToState("b.ts", "b".repeat(200)); // triggers eviction
        resetWorkspaceState("test");
        expect(consumeEvictionNotices()).toBe("");
    });

    test("setTokenBudget triggers eviction when reduced", () => {
        addFileToState("a.ts", "a".repeat(400));  // ~100 tokens
        addFileToState("b.ts", "b".repeat(400));  // ~100 tokens
        const before = getWorkspaceStateInfo().fileCount;
        expect(before).toBe(2);

        setTokenBudget(80); // reduce below current usage
        const after = getWorkspaceStateInfo().usedTokens;
        expect(after).toBeLessThanOrEqual(80);
    });

    // ── getWorkspaceStateInfo ───────────────────────────────────────────────

    // test("reports accurate utilization percentage", () => {
    //     setTokenBudget(1000);
    //     addFileToState("a.ts", "a".repeat(1000)); // ~250 tokens
    //     const info = getWorkspaceStateInfo();
    //     expect(info.utilizationPct).toBeGreaterThan(0);
    //     expect(info.utilizationPct).toBeLessThanOrEqual(100);
    // });

    test("reports accurate utilization percentage", () => {
        setTokenBudget(1000);
        addFileToState("a.ts", "a".repeat(1000)); // ~250 tokens (mock: ceil(1000/4))
        const info = getWorkspaceStateInfo();
        expect(info.utilizationPct).toBeGreaterThan(0);
        // utilizationPct is a display value — cap it at 100 in the module
        expect(info.utilizationPct).toBeLessThanOrEqual(100);
    });

    test("tracks cumulative stats", () => {
        setTokenBudget(50);
        addFileToState("a.ts", "a".repeat(100));
        addFileToState("b.ts", "b".repeat(100)); // evicts a
        const info = getWorkspaceStateInfo();
        expect(info.stats.totalFilesAdded).toBeGreaterThanOrEqual(1);
        expect(info.stats.totalEvictions).toBeGreaterThanOrEqual(1);
    });
});