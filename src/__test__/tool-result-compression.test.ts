// // src/__tests__/tool-result-compression.test.ts

// import { convertMessagesToLLMWithCompression } from
//     "../app/features/ide/extensions/chat/ChatThreadService";
// import type { ChatMessage } from "../app/features/ide/extensions/chat/types/types";

// function makeToolMsg(name: string, content: string, index: number): ChatMessage {
//     return {
//         role: "tool",
//         type: "success",
//         id: `tool-${index}`,
//         name: name as any,
//         content,
//         rawParams: {},
//         params: {},
//         result: content,
//     } as any;
// }

// function makeUserMsg(content: string): ChatMessage {
//     return { role: "user", content } as any;
// }

// function makeAssistantMsg(content: string): ChatMessage {
//     return { role: "assistant", displayContent: content, reasoning: "", anthropicReasoning: null } as any;
// }

// describe("convertMessagesToLLMWithCompression", () => {
//     test("keeps recent tool results verbatim", () => {
//         const messages: ChatMessage[] = [
//             makeUserMsg("fix the bug"),
//             makeToolMsg("read_file", "line 1\nline 2\nline 3", 1),
//         ];
//         const result = convertMessagesToLLMWithCompression(messages, "agent");
//         const toolResult = result.find(m => m.role === "tool");
//         expect(toolResult).toBeTruthy();
//         const content = (toolResult!.content as any)[0].output.value;
//         expect(content).toBe("line 1\nline 2\nline 3");
//     });

//     test("compresses old read_file results", () => {
//         // Create 10 turns of history so old results get compressed
//         const messages: ChatMessage[] = [];
//         for (let i = 0; i < 10; i++) {
//             messages.push(makeUserMsg(`message ${i}`));
//             messages.push(makeAssistantMsg(`response ${i}`));
//             const bigContent = Array(50).fill(`line ${i}`).join("\n");
//             messages.push(makeToolMsg("read_file", bigContent, i));
//         }
//         messages.push(makeUserMsg("final message"));

//         const result = convertMessagesToLLMWithCompression(messages, "agent");

//         // First tool result (oldest) should be compressed or evicted
//         const toolResults = result.filter(m => m.role === "tool");
//         const firstToolContent = (toolResults[0]?.content as any)?.[0]?.output?.value ?? "";

//         // Should not contain all 50 lines of the original
//         const lineCount = firstToolContent.split("\n").length;
//         expect(lineCount).toBeLessThan(50);
//     });

//     // test("skips checkpoint and interrupted_tool messages", () => {
//     //     const messages: ChatMessage[] = [
//     //         makeUserMsg("test"),
//     //         { role: "checkpoint", type: "user_edit", snapshotByPath: {}, userModifications: { snapshotByPath: {} } } as any,
//     //         { role: "interrupted_tool", name: "read_file" } as any,
//     //         makeAssistantMsg("ok"),
//     //     ];
//     //     const result = convertMessagesToLLMWithCompression(messages, "agent");
//     //     expect(result.every(m => m.role !== "tool")).toBe(true);
//     // });
// });