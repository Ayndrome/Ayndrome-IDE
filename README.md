<div align="center">

# Ayndrome IDE

**A modern, AI-native code editor built for the browser.**  
Write, review, and ship code with an embedded AI agent that reads, edits, and explains your codebase — right inside the editor.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![CodeMirror](https://img.shields.io/badge/CodeMirror-6-orange)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ What is Ayndrome IDE?

Ayndrome IDE is a web-based code editor with a built-in AI chat agent. Unlike traditional AI coding assistants that live in a sidebar, the agent here has **direct access to your workspace** — it can read files, write changes, run terminal commands, and search your codebase. Every edit appears in the editor with a diff view you can accept or reject hunk-by-hunk.

### Core Features

| Feature              | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| 🤖 **AI Agent**      | Multi-step agent loop with tool use (read/write/search/terminal)     |
| 📝 **Code Editor**   | CodeMirror 6 with syntax highlighting, LSP, indentation markers      |
| 🔍 **Diff Review**   | Per-hunk accept/reject with Myers diff algorithm                     |
| 🧠 **Multi-Model**   | Switch between Claude, GPT-4, Gemini, and OpenRouter models          |
| 💬 **Chat UI**       | Collapsible tool cards, streaming responses, file mentions (`@file`) |
| 📁 **File Explorer** | Browse and open workspace files inline                               |
| 🖥️ **Terminal**      | Sandboxed terminal execution via the agent                           |
| 🔌 **LSP**           | TypeScript and Python language server support                        |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- A [Convex](https://convex.dev) project (for database + auth)
- API keys for your chosen LLM provider

### 1. Clone the repo

```bash
git clone https://github.com/Ayndrome/Ayndrome-IDE.git
cd Ayndrome-IDE/ayndrome_ide
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# LLM Providers (add whichever you use)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
```

### 4. Set up Convex

```bash
npx convex dev
```

### 5. Run the development server

```bash
# Start Next.js + the local AI proxy server together
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗂️ Project Structure

```
ayndrome_ide/
├── src/
│   ├── app/
│   │   ├── api/                    # Next.js API routes (files, auth)
│   │   ├── features/
│   │   │   └── ide/
│   │   │       ├── components/     # CodeEditor, FileExplorer, TabManager
│   │   │       └── extensions/
│   │   │           ├── chat/       # AI agent, ChatThreadService, ToolCard
│   │   │           │   └── agent/  # diff-engine, task-tracker, workspace-state
│   │   │           └── editor/     # diff-decoration, LSP, streaming-writer
│   │   └── settings/               # Model + provider settings page
│   ├── lib/
│   │   ├── model-provider/         # Model router and provider registry
│   │   └── token/                  # Token counting utilities
│   ├── server/
│   │   ├── lsp/                    # LSP manager and WebSocket server
│   │   └── sandbox/                # Terminal sandbox manager
│   └── store/                      # Zustand stores (editor, diff, chat, IDE)
├── convex/                         # Convex schema, queries, mutations
├── server.ts                       # Express proxy server for LLM API calls
└── src/proxy.ts                    # CORS bypass proxy for browser→LLM
```

---

## 🧩 How the AI Agent Works

1. **User sends a message** in the chat panel
2. **ChatThreadService** builds a context block (open files, workspace state) and sends it to the LLM
3. **LLM responds** with text and/or tool calls (`read_file`, `write_file`, `run_terminal`, etc.)
4. **Tool implementations** execute the calls against the workspace
5. For `write_file`: the Myers diff engine computes `+added/-removed` lines, injects diff decorations into the CodeMirror editor, and shows an accept/reject UI
6. **Loop continues** until the task is done or the step limit is reached

---

## 🛠️ Available Scripts

| Script               | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start Next.js dev server + LLM proxy |
| `npm run dev:server` | Start only the Express proxy server  |
| `npm run build`      | Build for production                 |
| `npm run start`      | Start production server              |
| `npm run lint`       | Run ESLint                           |
| `npm test`           | Run Jest unit tests                  |

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/Ayndrome-IDE.git
cd Ayndrome-IDE/ayndrome_ide
npm install
```

### 2. Pick something to work on

- Check open issues for bugs or feature requests
- Look for `good first issue` labels

### 3. Branch and commit

```bash
git checkout -b feat/your-feature-name
# Make your changes
git commit -m "feat(scope): short description of what you did"
```

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat` – new feature
- `fix` – bug fix
- `refactor` – code restructure
- `style` – visual/CSS change
- `docs` – documentation
- `test` – tests
- `chore` – config/tooling

### 4. Open a Pull Request

Push your branch and open a PR against `main`. Describe what you changed and why.

---

## 🏗️ Tech Stack

| Layer     | Technology                                                   |
| --------- | ------------------------------------------------------------ |
| Framework | [Next.js 15](https://nextjs.org) (App Router)                |
| Language  | TypeScript 5                                                 |
| Editor    | [CodeMirror 6](https://codemirror.net)                       |
| Database  | [Convex](https://convex.dev)                                 |
| Auth      | [Clerk](https://clerk.com)                                   |
| State     | [Zustand](https://zustand-demo.pmnd.rs)                      |
| AI SDK    | [Vercel AI SDK](https://sdk.vercel.ai)                       |
| Diff      | [diff](https://github.com/kpdecker/jsdiff) (Myers algorithm) |
| Styling   | Tailwind CSS + shadcn/ui                                     |

---

## 📄 License

MIT © [Ayndrome](https://github.com/Ayndrome)
