// src/__tests__/task-tracker.test.ts
// Tests for task state detection

import { analyzeTaskContext } from "../app/features/ide/extensions/chat/agent/task-tracker";
import type { ChatMessage } from "../app/features/ide/extensions/chat/types/types";

function userMsg(content: string): ChatMessage {
  return { role: "user", content } as any;
}

function assistantMsg(content: string): ChatMessage {
  return {
    role: "assistant",
    displayContent: content,
    reasoning: "",
    anthropicReasoning: null,
  } as any;
}

function toolSuccess(name: string, content: string, params?: any): ChatMessage {
  return {
    role: "tool",
    type: "success",
    id: `t-${Math.random()}`,
    name,
    content,
    rawParams: params ?? {},
    params,
    result: content,
  } as any;
}

function toolError(name: string, content: string): ChatMessage {
  return {
    role: "tool",
    type: "tool_error",
    id: `t-${Math.random()}`,
    name,
    content,
    rawParams: {},
    params: {},
    result: content,
  } as any;
}

describe("task-tracker", () => {
  test("greeting after completed task → intent: greeting", () => {
    const messages = [
      userMsg("Fix the bug in server.ts"),
      toolSuccess("read_file", "content..."),
      toolSuccess("write_file", "Wrote server.ts", { filePath: "server.ts" }),
      assistantMsg("Done! Fixed the Record<string,> type error in server.ts."),
      userMsg("hii"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.currentIntent).toBe("greeting");
  });

  test("greeting → shouldRespondWithoutTools = true", () => {
    const messages = [
      userMsg("Create a todo app"),
      toolSuccess("write_file", "Wrote app/page.tsx", {
        filePath: "app/page.tsx",
      }),
      assistantMsg("Created the todo app in app/page.tsx"),
      userMsg("hii"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.currentIntent).toBe("greeting");
    expect(result.contextBlock).toContain("Do NOT continue");
    expect(result.contextBlock).toContain("Do NOT call any tools");
  });

  test("completed task marked as COMPLETED", () => {
    const messages = [
      userMsg("Fix server.ts"),
      toolSuccess("read_file", "content"),
      toolSuccess("write_file", "Wrote server.ts", { filePath: "server.ts" }),
      assistantMsg("Fixed! Changed Record<string,> to Record<string, string>."),
      userMsg("create todo app"),
    ];
    const result = analyzeTaskContext(messages);
    const firstTask = result.tasks[0];
    expect(firstTask?.status).toBe("completed");
  });

  test("stuck loop detected as FAILED", () => {
    const messages = [
      userMsg("Create movie app"),
      toolSuccess("list_directory", "Contents of /workspace:\n"),
      toolSuccess("list_directory", "Contents of /workspace:\n"),
      toolSuccess("list_directory", "Contents of /workspace:\n"),
      toolSuccess("list_directory", "Contents of /workspace:\n"),
      assistantMsg("(empty)"),
      userMsg("create netflix clone"),
    ];
    const result = analyzeTaskContext(messages);
    const firstTask = result.tasks[0];
    expect(firstTask?.stuckDetected).toBe(true);
    expect(firstTask?.status).toBe("failed");
  });

  test("abandoned task marked as ABANDONED", () => {
    const messages = [
      userMsg("Create movie app"),
      toolError("run_terminal", "EACCES permission denied"),
      toolError("run_terminal", "EACCES permission denied"),
      assistantMsg("(empty)"),
      userMsg("create netflix clone instead"), // new task
    ];
    const result = analyzeTaskContext(messages);
    const firstTask = result.tasks[0];
    expect(["abandoned", "failed"]).toContain(firstTask?.status);
  });

  test("context block mentions previous failed tasks for new task", () => {
    const messages = [
      userMsg("Create netflix clone"),
      toolError("run_terminal", "OCI runtime error: not a directory"),
      toolError("run_terminal", "OCI runtime error: Cwd must be absolute"),
      assistantMsg("I encountered errors creating the directory."),
      userMsg("try again, make a netflix-clone folder"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.contextBlock).toContain("TASK 1");
    expect(result.contextBlock).toContain("CURRENT REQUEST");
  });

  test("continue intent detected", () => {
    const messages = [
      userMsg("Build a todo app"),
      toolError("run_terminal", "EACCES error"),
      assistantMsg("I couldn't complete this due to permission issues."),
      userMsg("continue from where you left off"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.currentIntent).toBe("continue");
  });

  test("question intent detected", () => {
    const messages = [
      userMsg("Create a todo app"),
      toolSuccess("write_file", "Wrote app/page.tsx", {
        filePath: "app/page.tsx",
      }),
      assistantMsg("Created todo app."),
      userMsg("What does the useState hook do?"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.currentIntent).toBe("question");
  });

  test("empty thread returns no tasks", () => {
    const result = analyzeTaskContext([]);
    expect(result.tasks).toHaveLength(0);
    expect(result.contextBlock).toBe("");
  });

  test("context block is compact — under 500 tokens for 5 tasks", () => {
    const messages = [
      userMsg("Task 1"),
      assistantMsg("Done task 1"),
      userMsg("Task 2"),
      toolError("run_terminal", "error"),
      assistantMsg("failed"),
      userMsg("Task 3"),
      toolSuccess("write_file", "wrote", { filePath: "a.ts" }),
      assistantMsg("done"),
      userMsg("Task 4"),
      assistantMsg("done"),
      userMsg("Task 5 — what should I do next?"),
    ];
    const result = analyzeTaskContext(messages);
    expect(result.tokenEstimate).toBeLessThan(500);
  });
});
