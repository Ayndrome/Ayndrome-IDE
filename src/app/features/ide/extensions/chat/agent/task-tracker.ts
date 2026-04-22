// src/app/features/ide/extensions/chat/agent/task-tracker.ts
// Analyzes message history to build a task state map.
// Runs locally, zero LLM calls, <5ms.
// Produces a compact <TaskContext> block for system prompt injection.

import type { ChatMessage } from "../types/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "completed" // agent finished, sent summary, no failures
  | "failed" // agent gave up or hit unrecoverable error
  | "abandoned" // user moved on mid-task
  | "in_progress" // currently executing
  | "pending"; // just started, no tool calls yet

export type TaskRecord = {
  index: number; // task number in this thread (1-based)
  userMessage: string; // the original user request (truncated)
  status: TaskStatus;
  summary: string; // what happened (compact, ~50 tokens)
  turnStart: number; // message index where task started
  turnEnd: number; // message index where task ended
  toolCallCount: number; // how many tool calls were made
  successCount: number; // how many succeeded
  failureCount: number; // how many failed
  stuckDetected: boolean; // was the agent stuck in a loop?
  filesModified: string[]; // files that were written/created
  lastError?: string; // last error message if failed/abandoned
};

export type TaskContextResult = {
  tasks: TaskRecord[];
  currentTask: TaskRecord | null;
  currentIntent: "greeting" | "question" | "new_task" | "continue" | "unknown";
  contextBlock: string; // ready to inject into system prompt
  tokenEstimate: number;
};

// ── Intent classifier ─────────────────────────────────────────────────────────

function classifyCurrentIntent(
  userMessage: string,
  previousTasks: TaskRecord[],
): TaskContextResult["currentIntent"] {
  const msg = userMessage.trim().toLowerCase();
  const tokenEst = Math.ceil(msg.length / 4);

  // Short messages
  if (tokenEst <= 10) {
    const greetings =
      /^(hi+|hello|hey|what'?s up|howdy|yo|sup|hii+|good (morning|evening|afternoon))!?$/;
    if (greetings.test(msg)) return "greeting";
  }

  // Explicit continuation
  const continuePatterns = [
    /continue/i,
    /resume/i,
    /keep going/i,
    /where (were|was) (we|you)/i,
    /what (were|was) (we|you) doing/i,
    /carry on/i,
    /proceed/i,
    /finish (it|that|the)/i,
    /complete (it|that|the)/i,
  ];
  if (continuePatterns.some((p) => p.test(msg))) return "continue";

  // Questions
  const questionPatterns = [
    /^(what|how|why|when|where|who|which|does|is|are|can|could|should|would|will)\b/i,
    /\?$/,
  ];
  if (questionPatterns.some((p) => p.test(msg)) && tokenEst < 30)
    return "question";

  // If all previous tasks are done and this is a new request
  if (previousTasks.length > 0 && tokenEst > 10) return "new_task";

  return "unknown";
}

// ── Task boundary detection ───────────────────────────────────────────────────
// Determines where one task ends and another begins in message history

function findTaskBoundaries(messages: ChatMessage[]): number[] {
  const boundaries: number[] = [0]; // first user message always starts a task

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    const content = typeof msg.content === "string" ? msg.content : "";
    if (!content.trim()) continue;

    // Large code pastes are NOT new tasks — they're context for current task
    const tokenEst = Math.ceil(content.length / 3.5);
    if (tokenEst > 200) continue; // user pasted code — skip

    // These indicate a NEW task boundary
    const newTaskSignals = [
      // Explicit new requests
      /^(create|build|make|add|fix|write|implement|generate|set up|configure)/i,
      // Retry / rephrase patterns (user is issuing a new variant of a request)
      /^(try again|retry|try a different|try another|rephrase|rewrite|redo|do it again|attempt again|give it another|one more time)/i,
      // Change of subject with substantial length (lowered from 15 → 8 to catch short retries)
      tokenEst > 8 &&
        !/^(yes|no|ok|okay|sure|thanks|great|cool|hii?|hello|hey)/i.test(
          content,
        ),
    ];

    const prevUserMsgs = messages.slice(0, i).filter((m) => m.role === "user");
    if (
      prevUserMsgs.length > 0 &&
      newTaskSignals.some((s) => (typeof s === "boolean" ? s : s.test(content)))
    ) {
      boundaries.push(i);
    }
  }

  return boundaries;
}

// ── Task status analyzer ──────────────────────────────────────────────────────

function analyzeTaskStatus(
  messages: ChatMessage[],
  startIdx: number,
  endIdx: number,
): Omit<TaskRecord, "index" | "userMessage" | "turnStart" | "turnEnd"> {
  const taskMessages = messages.slice(startIdx, endIdx);
  let toolCallCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let lastError = "";
  const filesModified: string[] = [];
  const toolCallKeys = new Map<string, number>(); // for stuck detection

  // Scan tool messages
  for (const msg of taskMessages) {
    if (msg.role !== "tool") continue;

    if (msg.type === "success") {
      toolCallCount++;
      successCount++;

      // Track files modified
      if (
        (msg.name === "write_file" || msg.name === "create_file") &&
        msg.params
      ) {
        const p = msg.params as any;
        const filePath = (p.filePath ?? p.dirPath ?? "").replace(
          /^\/workspace\//,
          "",
        );
        if (filePath && !filesModified.includes(filePath)) {
          filesModified.push(filePath);
        }
      }

      // Stuck detection: same tool + same key params called 3+ times
      const key = `${msg.name}:${JSON.stringify((msg.params as any) ?? {})}`;
      const count = (toolCallKeys.get(key) ?? 0) + 1;
      toolCallKeys.set(key, count);
    } else if (msg.type === "tool_error" || msg.type === "invalid_params") {
      toolCallCount++;
      failureCount++;
      lastError =
        typeof msg.content === "string" ? msg.content.slice(0, 200) : "";
    }
  }

  const stuckDetected = [...toolCallKeys.values()].some((v) => v >= 3);

  // Determine status from assistant messages
  const assistantMessages = taskMessages.filter((m) => m.role === "assistant");
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const lastContent = (lastAssistant?.displayContent ?? "").toLowerCase();

  // Completion signals
  const completionSignals = [
    /\b(done|complete|finished|created|fixed|added|installed|set up|implemented|written)\b/i,
    /\b(successfully|all set|ready|working)\b/i,
  ];

  // Failure signals
  const failureSignals = [
    /\b(sorry|unable|failed|can'?t|couldn'?t|error|permission denied)\b/i,
    /\b(giving up|stuck|cannot proceed|doesn'?t work)\b/i,
  ];

  let status: TaskStatus = "abandoned";

  if (toolCallCount === 0 && assistantMessages.length === 0) {
    status = "pending";
  } else if (stuckDetected) {
    status = "failed";
  } else if (
    failureCount > successCount &&
    failureSignals.some((p) => p.test(lastContent))
  ) {
    status = "failed";
  } else if (
    completionSignals.some((p) => p.test(lastContent)) &&
    failureCount === 0
  ) {
    status = "completed";
  } else if (toolCallCount > 0 && successCount > failureCount) {
    // Had some success but didn't finish — abandoned by user sending new message
    status = "abandoned";
  } else if (toolCallCount > 0 && failureCount > 0) {
    status = "failed";
  }

  // Build compact summary
  let summary = "";
  if (status === "completed") {
    const fileList = filesModified.slice(0, 3).join(", ");
    summary =
      filesModified.length > 0
        ? `Completed. Modified: ${fileList}${filesModified.length > 3 ? ` +${filesModified.length - 3} more` : ""}.`
        : lastContent.slice(0, 100) || "Completed successfully.";
  } else if (status === "failed") {
    summary = stuckDetected
      ? `Failed — agent stuck in loop (${[...toolCallKeys.entries()].find(([, v]) => v >= 3)?.[0]?.split(":")?.[0] ?? "tool"} called 3+ times).`
      : `Failed — ${lastError.slice(0, 120) || "unrecoverable error"}.`;
  } else if (status === "abandoned") {
    const fileList = filesModified.slice(0, 2).join(", ");
    summary =
      `Abandoned mid-task. ${toolCallCount} tool calls (${successCount} ok, ${failureCount} failed).` +
      (filesModified.length > 0
        ? ` Partial work: ${fileList}.`
        : " No files written.");
  }

  return {
    status,
    summary,
    toolCallCount,
    successCount,
    failureCount,
    stuckDetected,
    filesModified,
    lastError: lastError || undefined,
  };
}

// ── Main: analyze full thread ─────────────────────────────────────────────────

export function analyzeTaskContext(messages: ChatMessage[]): TaskContextResult {
  // Filter to meaningful messages
  const meaningful = messages.filter(
    (m) => m.role !== "checkpoint" && m.role !== "interrupted_tool",
  );

  if (meaningful.length === 0) {
    return {
      tasks: [],
      currentTask: null,
      currentIntent: "unknown",
      contextBlock: "",
      tokenEstimate: 0,
    };
  }

  // Find task boundaries
  const boundaries = findTaskBoundaries(meaningful);

  // Last boundary is the current task
  const tasks: TaskRecord[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx = boundaries[b + 1] ?? meaningful.length;

    // Find the user message that started this task
    const startMsg = meaningful[startIdx];
    const userContent =
      startMsg?.role === "user"
        ? typeof startMsg.content === "string"
          ? startMsg.content
          : ""
        : "";

    // Skip large code pastes as task starters
    if (Math.ceil(userContent.length / 3.5) > 200) continue;

    const trimmedMsg =
      userContent.length > 80 ? userContent.slice(0, 77) + "..." : userContent;

    const analysis = analyzeTaskStatus(meaningful, startIdx, endIdx);

    tasks.push({
      index: tasks.length + 1,
      userMessage: trimmedMsg,
      turnStart: startIdx,
      turnEnd: endIdx,
      ...analysis,
    });
  }

  // Current task = last in list (still in progress or just started)
  const currentTask = tasks[tasks.length - 1] ?? null;

  // Classify intent of current message
  const currentMsg = meaningful[meaningful.length - 1];
  const currentContent =
    currentMsg?.role === "user"
      ? typeof currentMsg.content === "string"
        ? currentMsg.content
        : ""
      : "";

  const previousTasks = tasks.slice(0, -1); // all except current
  const currentIntent = classifyCurrentIntent(currentContent, previousTasks);

  // Build context block
  const contextBlock = buildTaskContextBlock(
    tasks,
    currentIntent,
    currentContent,
  );
  const tokenEstimate = Math.ceil(contextBlock.length / 3.5);

  console.log(
    `[TaskTracker] Analyzed ${tasks.length} tasks | ` +
      `current intent: ${currentIntent} | ` +
      `~${tokenEstimate} tokens`,
  );

  return {
    tasks,
    currentTask,
    currentIntent,
    contextBlock,
    tokenEstimate,
  };
}

// ── Build context block for injection ────────────────────────────────────────

function buildTaskContextBlock(
  tasks: TaskRecord[],
  currentIntent: TaskContextResult["currentIntent"],
  currentMessage: string,
): string {
  if (tasks.length === 0) return "";

  const previousTasks = tasks.slice(0, -1);
  const lines: string[] = ["<TaskContext>"];

  // Only include previous tasks (not current)
  if (previousTasks.length > 0) {
    lines.push("Previous tasks in this thread:");
    lines.push("");

    for (const task of previousTasks) {
      const statusIcon =
        task.status === "completed"
          ? "✓"
          : task.status === "failed"
            ? "✗"
            : task.status === "abandoned"
              ? "~"
              : "?";

      lines.push(
        `TASK ${task.index} [${task.status.toUpperCase()}]: ` +
          `"${task.userMessage}"`,
      );
      lines.push(`  ${statusIcon} ${task.summary}`);
      if (task.filesModified.length > 0 && task.status !== "completed") {
        lines.push(
          `  Partial files: ${task.filesModified.slice(0, 3).join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  // Current task guidance
  lines.push("CURRENT REQUEST:");

  switch (currentIntent) {
    case "greeting":
      lines.push(
        `"${currentMessage.trim()}" — This is a greeting or casual message.`,
      );
      lines.push(
        "Respond conversationally. " +
          "Do NOT continue or restart any previous tasks. " +
          "Do NOT call any tools. " +
          "If the user wants to resume work, they will ask explicitly.",
      );
      break;

    case "question":
      lines.push(
        `"${currentMessage.slice(0, 100).trim()}" — This is a question.`,
      );
      lines.push(
        "Answer the question directly. " +
          "Do NOT automatically start executing code or calling tools " +
          "unless the question specifically asks you to do something.",
      );
      break;

    case "continue":
      const lastIncomplete = tasks
        .slice()
        .reverse()
        .find((t) => t.status === "failed" || t.status === "abandoned");
      if (lastIncomplete) {
        lines.push(
          `Continuing TASK ${lastIncomplete.index}: "${lastIncomplete.userMessage}"`,
        );
        lines.push(
          `Previous attempt: ${lastIncomplete.summary}. ` +
            `Try a different approach this time.`,
        );
      } else {
        lines.push(
          "User asked to continue but all previous tasks are complete.",
        );
        lines.push("Ask the user what they'd like to work on.");
      }
      break;

    case "new_task":
      lines.push(
        `"${currentMessage.slice(0, 100).trim()}" — This is a NEW task.`,
      );
      if (
        previousTasks.some(
          (t) => t.status === "abandoned" || t.status === "failed",
        )
      ) {
        lines.push(
          "Previous unfinished tasks above are CLOSED — do not attempt to resume them. " +
            "Focus entirely on this new request.",
        );
      }
      break;

    case "unknown":
    default:
      lines.push(`"${currentMessage.slice(0, 100).trim()}"`);
      lines.push(
        "Interpret this message carefully. " +
          "If it's a new task, start fresh. " +
          "If it's a follow-up to the most recent task, " +
          "reference the context above.",
      );
      break;
  }

  lines.push("</TaskContext>");
  return lines.join("\n");
}

// ── Quick check: should agent respond without tools? ─────────────────────────

export function shouldRespondWithoutTools(
  intent: TaskContextResult["currentIntent"],
): boolean {
  return intent === "greeting" || intent === "question";
}
