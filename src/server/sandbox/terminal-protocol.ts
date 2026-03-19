// src/server/sandbox/terminal-protocol.ts
// Shared message types — imported by both terminal-server.ts and TerminalPanel.tsx
// Keep this file framework-agnostic (no Node or browser APIs)

// Browser → Server messages
export type ClientMessage =
    | { type: "input"; data: string }
    | { type: "resize"; cols: number; rows: number }
    | { type: "ping" };

// Server → Browser messages
export type ServerMessage =
    | { type: "output"; data: string }
    | { type: "ready" }
    | { type: "error"; message: string }
    | { type: "exit"; code: number }
    | { type: "pong" };