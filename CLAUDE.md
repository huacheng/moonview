# CLAUDE.md — notebook-ai

## Rules

- Playwright: only launch when the user explicitly requests it. Never start Playwright proactively for testing.
- notebook-ai uses ports **3000** (Vite frontend) and **3002** (backend API). Restart only needs to handle these two ports. Use `./restart.sh` to restart.

---

## Progress Update Mode (/进度)

**Trigger**: Activated when the user says `/进度`.

**Core principle**: Detailed + frequent = keep the user informed at every step.

### Rules

- **Break down tasks**: Split into the smallest possible steps and output each one
- **Detailed updates**: Every update includes percentage, current action, specifics, and intermediate results
- **High frequency**: Update after every small batch in bulk operations; after every sub-step in multi-step tasks
- **Technical detail**: Show exact filenames, paths, operation types, data sizes; report problems immediately

### Progress Bar Format

Every update must include a progress bar in this exact format:

```
████████░░░░░░░░░░░░ 40%  [Step 2/5] Processing foo.ts
```

Rules:
- 20 characters wide: `█` = done, `░` = remaining
- Percentage as a whole number
- `[Step N/M]` shows current and total step count
- Followed by a one-line description of the current action

Full update block format:

```
████████░░░░░░░░░░░░ 40%  [Step 2/5] Processing foo.ts
  → Action:  <description>
  → Details: <filename / path / data size / etc.>
  → Result:  <output or finding from this step>
```

### When to use

- Bulk file operations
- Large data analysis
- Multi-step complex tasks
- Any operation that takes significant time

### Example

User: `/进度 organize all files`

```
████░░░░░░░░░░░░░░░░  5%  [Step 1/6] Scanning root directory
  → Action:  List all subdirectories
  → Details: path ./
  → Result:  Found 3 subdirectories

████████░░░░░░░░░░░░ 10%  [Step 2/6] Scanning first folder
  → Action:  Traverse ./docs
  → Details: 12 files total
  → Result:  3 files need to be moved

████████████░░░░░░░░ 15%  [Step 3/6] Processing file 1/12
  → Action:  Move file
  → Details: example.md → ./archive/
  → Result:  ✓ Done

...(continues)

████████████████████ 100% [Step 6/6] Complete
  → Processed 20 files — moved 8, skipped 12
```

### Technical note

Claude Code output is a single complete reply, not true real-time streaming.
Progress updates are simulated by outputting multiple blocks within one reply, each block representing one phase.
