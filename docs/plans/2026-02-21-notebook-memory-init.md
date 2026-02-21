# Notebook MEMORY.md Initialization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a notebook is created, write a `MEMORY.md` into its workspace with the shared library path; inject a short system prompt at session start so Claude reads this file automatically.

**Architecture:** Four small, focused changes: (1) a new `initWorkspaceMemory` utility in `workspace.ts`; (2) `ClaudeProcess` gains an optional `systemPrompt` arg passed via `--append-system-prompt`; (3) `--tools default` is added to the spawn args; (4) the `POST /api/notebooks/create` route writes `MEMORY.md` before creating the session.

**Tech Stack:** Node.js, TypeScript, Express, Vitest (tests at `packages/*/src/**/*.test.ts`, run with `pnpm vitest run`)

---

### Task 1: Add `initWorkspaceMemory` to `workspace.ts`

**Files:**
- Modify: `packages/server/src/workspace.ts`
- Create: `packages/server/src/__tests__/workspace.test.ts`

**Step 1: Write the failing test**

Create `packages/server/src/__tests__/workspace.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'fs/promises';
import os from 'os';
import path from 'path';

// Override the workspace root so initWorkspaceMemory uses our tmpDir layout.
// The library dir is <workspaceRoot>/_library, notebooks are <workspaceRoot>/<slug>.
// We fake this by making workspaceDir a sibling of _library under tmpRoot.

let tmpRoot: string;
let workspaceDir: string;
let libraryDir: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  workspaceDir = path.join(tmpRoot, 'my-notebook');
  libraryDir = path.join(tmpRoot, '_library');
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(libraryDir, { recursive: true });
  // Point NB_WORKSPACE_DIR at our tmpRoot so getLibraryDir() returns the right path.
  process.env['NB_WORKSPACE_DIR'] = tmpRoot;
});

afterEach(async () => {
  delete process.env['NB_WORKSPACE_DIR'];
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('initWorkspaceMemory', () => {
  it('creates MEMORY.md in the workspace directory', async () => {
    const { initWorkspaceMemory } = await import('../workspace.js');
    await initWorkspaceMemory(workspaceDir);

    const content = await readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('# MEMORY');
  });

  it('writes a relative path from workspace to the library', async () => {
    const { initWorkspaceMemory } = await import('../workspace.js');
    await initWorkspaceMemory(workspaceDir);

    const content = await readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf-8');
    // Relative path from workspaceDir to libraryDir = ../_library
    expect(content).toContain('../_library');
  });

  it('content mentions read and write access', async () => {
    const { initWorkspaceMemory } = await import('../workspace.js');
    await initWorkspaceMemory(workspaceDir);

    const content = await readFile(path.join(workspaceDir, 'MEMORY.md'), 'utf-8');
    expect(content).toMatch(/read.*write|write.*read/i);
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
pnpm vitest run packages/server/src/__tests__/workspace.test.ts
```

Expected: FAIL — `initWorkspaceMemory` is not exported from `workspace.js`.

**Step 3: Implement `initWorkspaceMemory` in `workspace.ts`**

Add these imports at the top of `packages/server/src/workspace.ts`:

```ts
import { mkdirSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';   // add writeFile to existing import if needed
```

> `mkdirSync` and `existsSync` are already imported. Add `writeFile` to the `fs/promises` import if it isn't there yet. Then add at the end of the file:

```ts
/**
 * Writes a MEMORY.md file into the workspace directory, recording the
 * shared library directory path relative to the workspace.
 * Safe to call multiple times — overwrites any existing MEMORY.md.
 */
export async function initWorkspaceMemory(workspaceDir: string): Promise<void> {
  const libraryDir = getLibraryDir();
  const relPath = path.relative(workspaceDir, libraryDir);
  const content =
    `# MEMORY\n\n` +
    `## Shared Library Directory\n\n` +
    `Path (relative to this workspace): \`${relPath}\`\n\n` +
    `This is the shared library directory accessible to all notebooks.\n` +
    `You can both read from and write to this directory.\n` +
    `Use it to store datasets, scripts, configuration files, and other\n` +
    `resources that should be shared across notebooks.\n`;
  await writeFile(path.join(workspaceDir, 'MEMORY.md'), content, 'utf-8');
}
```

**Step 4: Run test to confirm it passes**

```bash
pnpm vitest run packages/server/src/__tests__/workspace.test.ts
```

Expected: PASS (3 tests).

**Step 5: Typecheck**

```bash
cd packages/server && pnpm typecheck
```

Expected: no errors.

**Step 6: Commit**

```bash
git add packages/server/src/workspace.ts packages/server/src/__tests__/workspace.test.ts
git commit -m "feat: add initWorkspaceMemory to write MEMORY.md in notebook workspace"
```

---

### Task 2: Add `--append-system-prompt` to `ClaudeProcess`

**Files:**
- Modify: `packages/server/src/claude-process.ts`

No new tests needed — `ClaudeProcess` spawns an external binary; spawn args are verified at integration level.

**Step 1: Update the constructor and `start` method**

In `packages/server/src/claude-process.ts`, change the class definition:

```ts
// Before:
export class ClaudeProcess {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  constructor(private readonly cwd: string) {}
```

```ts
// After:
export class ClaudeProcess {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  constructor(
    private readonly cwd: string,
    private readonly systemPrompt?: string,
  ) {}
```

**Step 2: Update the `spawn` call inside `start`**

Find the `spawn` call (around line 42) and update the args array:

```ts
// Before:
this.proc = spawn(
  'claude',
  [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ],
  { ... },
);
```

```ts
// After:
this.proc = spawn(
  'claude',
  [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    ...(this.systemPrompt ? ['--append-system-prompt', this.systemPrompt] : []),
  ],
  { ... },
);
```

**Step 3: Typecheck**

```bash
cd packages/server && pnpm typecheck
```

Expected: no errors.

**Step 4: Commit**

```bash
git add packages/server/src/claude-process.ts
git commit -m "feat: add --append-system-prompt support to ClaudeProcess"
```

---

### Task 3: Pass system prompt constant in `session.ts`

**Files:**
- Modify: `packages/server/src/session.ts`

**Step 1: Add the constant and update `ClaudeProcess` instantiation**

At the top of `packages/server/src/session.ts`, after the imports, add:

```ts
const MEMORY_SYSTEM_PROMPT =
  'At the start of each session, read the MEMORY.md file in your ' +
  'working directory. It contains important context, including the ' +
  'shared library directory path. When summarizing this conversation, ' +
  'always preserve the shared library directory information.';
```

Then find the `ClaudeProcess` instantiation inside `createSession` (around line 123):

```ts
// Before:
claudeProcess: new ClaudeProcess(cwd),
```

```ts
// After:
claudeProcess: new ClaudeProcess(cwd, MEMORY_SYSTEM_PROMPT),
```

**Step 2: Typecheck**

```bash
cd packages/server && pnpm typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add packages/server/src/session.ts
git commit -m "feat: inject MEMORY.md system prompt into Claude process at session start"
```

---

### Task 4: Call `initWorkspaceMemory` in the create route

**Files:**
- Modify: `packages/server/src/routes/notebooks.ts`

**Step 1: Add the import**

At the top of `packages/server/src/routes/notebooks.ts`, add `initWorkspaceMemory` to the workspace import:

```ts
// Before:
import {
  titleToSlug,
  uniqueSlug,
  ensureWorkspaceDir,
  getNotebookFilePath,
} from '../workspace.js';
```

```ts
// After:
import {
  titleToSlug,
  uniqueSlug,
  ensureWorkspaceDir,
  getNotebookFilePath,
  initWorkspaceMemory,
} from '../workspace.js';
```

**Step 2: Call it in `POST /api/notebooks/create`**

Inside the `create` route handler, after `await notebookStore.save(notebookPath, notebook)` (around line 158), add:

```ts
await notebookStore.save(notebookPath, notebook);
await initWorkspaceMemory(workspaceDir);   // ← add this line
```

**Step 3: Typecheck**

```bash
cd packages/server && pnpm typecheck
```

Expected: no errors.

**Step 4: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add packages/server/src/routes/notebooks.ts
git commit -m "feat: write MEMORY.md when creating a new notebook workspace"
```

---

### Task 5: Smoke test end-to-end

**Step 1: Restart the server**

```bash
./restart.sh
```

**Step 2: Create a new notebook via the UI** and check that `MEMORY.md` exists in its workspace:

```bash
ls ~/nb-workspaces/*/MEMORY.md
cat ~/nb-workspaces/*/MEMORY.md
```

Expected: file exists and contains `../_library` relative path.

**Step 3: Verify the Claude process starts with the new flags**

```bash
ps aux | grep 'claude.*tools'
```

Expected: process includes `--tools default --append-system-prompt`.
