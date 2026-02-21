# Design: Notebook MEMORY.md Initialization

**Date:** 2026-02-21

## Summary

When a notebook is created, generate a `MEMORY.md` file in its workspace
directory. The file records the shared library directory path (relative) and
its purpose. Claude reads this file at session start via a short, fixed
`--append-system-prompt` instruction.

---

## Requirements

1. Each new notebook workspace gets a `MEMORY.md` on creation.
2. `MEMORY.md` records the shared library directory using a **relative path**
   from the notebook's workspace (e.g. `../_library`).
3. Content is written in English and explains the library's purpose (read &
   write access, cross-notebook sharing).
4. Claude reads `MEMORY.md` at the start of every session via system prompt
   instruction — no content is inlined into the command-line argument.
5. The system prompt instruction survives conversation compaction; Claude is
   asked to preserve library directory information in any summaries.
6. All built-in Claude tools are explicitly enabled (`--tools default`).

---

## MEMORY.md Template

```markdown
# MEMORY

## Shared Library Directory

Path (relative to this workspace): `../_library`

This is the shared library directory accessible to all notebooks.
You can both read from and write to this directory.
Use it to store datasets, scripts, configuration files, and other
resources that should be shared across notebooks.
```

The relative path is computed dynamically with `path.relative(workspaceDir, libraryDir)`.

---

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `packages/server/src/workspace.ts` | Add `initWorkspaceMemory(workspaceDir)` |
| `packages/server/src/claude-process.ts` | Add `systemPrompt` param; add `--append-system-prompt` and `--tools default` flags |
| `packages/server/src/session.ts` | Read `MEMORY.md` on session create; pass content hint as system prompt |
| `packages/server/src/routes/notebooks.ts` | Call `initWorkspaceMemory` in `POST /api/notebooks/create` |

---

### 1. `workspace.ts` — `initWorkspaceMemory`

New async function:

```ts
export async function initWorkspaceMemory(workspaceDir: string): Promise<void> {
  const libraryDir = getLibraryDir();
  const relPath = path.relative(workspaceDir, libraryDir);
  const content = `# MEMORY\n\n## Shared Library Directory\n\nPath (relative to this workspace): \`${relPath}\`\n\nThis is the shared library directory accessible to all notebooks.\nYou can both read from and write to this directory.\nUse it to store datasets, scripts, configuration files, and other\nresources that should be shared across notebooks.\n`;
  await writeFile(path.join(workspaceDir, 'MEMORY.md'), content, 'utf-8');
}
```

---

### 2. `claude-process.ts` — system prompt + tools flags

`ClaudeProcess` constructor receives an optional `systemPrompt` string.
Spawn args addition:

```ts
'--tools', 'default',
...(systemPrompt ? ['--append-system-prompt', systemPrompt] : []),
```

---

### 3. `session.ts` — inject system prompt at session creation

In `createSession`, after `gitManager.ensureRepo()`:

```ts
const MEMORY_SYSTEM_PROMPT =
  'At the start of each session, read the MEMORY.md file in your ' +
  'working directory. It contains important context, including the ' +
  'shared library directory path. When summarizing this conversation, ' +
  'always preserve the shared library directory information.';
```

Pass this constant to `new ClaudeProcess(cwd, MEMORY_SYSTEM_PROMPT)`.

---

### 4. `routes/notebooks.ts` — write MEMORY.md on notebook creation

After `notebookStore.save(notebookPath, notebook)`:

```ts
await initWorkspaceMemory(workspaceDir);
```

---

## Data Flow

```
POST /api/notebooks/create
  └─ ensureWorkspaceDir(slug)       → creates ~/nb-workspaces/<slug>/
  └─ notebookStore.save(...)        → writes <slug>.notebook.json
  └─ initWorkspaceMemory(dir)       → writes MEMORY.md  ← NEW
  └─ sessionManager.createSession(...)
       └─ new ClaudeProcess(cwd, SYSTEM_PROMPT)
            └─ spawn claude -p ... --tools default --append-system-prompt "..."
```

---

## Compact Preservation

The `--append-system-prompt` text is part of Claude's system prompt, which is
**never included in conversation compaction**. Even after `/compact`, Claude
retains the instruction to read `MEMORY.md` and to preserve library directory
info in summaries.
