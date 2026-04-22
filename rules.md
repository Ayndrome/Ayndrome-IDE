# Commit Rules & Preferences

## Core Philosophy

> Commit early, commit often. Every feature, fix, and even trivial typo gets its own commit.
> This maximizes contribution graph activity and keeps history clean and reviewable.

## When to Commit

- Every new feature or sub-feature → commit immediately when working
- Every bug fix, no matter how small → commit
- Every refactor or code cleanup → commit
- Every UI tweak, style change, or copy edit → commit
- Every typo fix → commit
- Every config or dependency change → commit
- After every file added or deleted → commit

## Commit Message Format

```
<type>(<scope>): <short imperative description>

[optional body — when the why isn't obvious]
```

### Types

| Type       | When to use                              |
| ---------- | ---------------------------------------- |
| `feat`     | New feature or capability                |
| `fix`      | Bug fix                                  |
| `refactor` | Code restructure without behavior change |
| `style`    | UI/CSS changes, visual tweaks            |
| `chore`    | Config, deps, tooling, non-code changes  |
| `docs`     | Documentation, comments, README          |
| `test`     | Adding or updating tests                 |
| `perf`     | Performance improvements                 |

### Scope

Use the component or file area, e.g.:

- `chat`, `editor`, `diff`, `toolcard`, `lsp`, `api`, `store`, `terminal`, `auth`

### Examples

```
feat(diff): add real Myers diff stats to write_file tool result
fix(toolcard): collapse tool cards by default on all states
fix(diff): use correct state.doc.line(n).from for line highlights
feat(editor): add CM height constraint to prevent tab bar overflow
refactor(chat): replace gutter buttons with inline hunk action widgets
chore(deps): add diff library for Myers algorithm
docs(rules): add commit preferences and workflow rules
```

## Staging Rules

- **Always stage files by logical group** — don't mix unrelated changes in one commit
- One commit per feature/fix area, not one commit per file
- Group related files (e.g. store + component that uses it)
- Never commit everything in one giant commit

## Branching (for future)

- Work on `main` for now
- Create feature branches for large multi-day features
- Branch naming: `feat/short-description` or `fix/short-description`

## Frequency Targets

- Aim for **3–10 commits per work session**
- If a session has 0 commits, something went wrong
- Don't wait to "finish" a feature — commit working increments
