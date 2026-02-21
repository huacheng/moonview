# Global Directory .summary.md Format

`.experiences/.summary.md` and `.references/.summary.md` serve as keyword indexes for fast file discovery. Overwritten on each new entry.

**Top-level `.experiences/.summary.md`** — indexes all type directories:

```markdown
# Experiences Index

| Type | Tasks | Keywords | Updated |
|------|-------|----------|---------|
| software | 5 | testing, API design, error handling | 2024-01-15 |
| dsp | 2 | FFT, audio filters, sample rate | 2024-01-20 |
```

**Per-type `.experiences/<type>/.summary.md`** — condensed summary of all experiences for that type:

```markdown
# software Experiences

## Key Patterns
- [Distilled recurring patterns across all completed tasks]

## Entries

| Module | Date | Key Learnings |
|--------|------|---------------|
| task-api-v2 | 2024-01-15 | REST versioning headers, Bull queue |
| task-auth | 2024-01-10 | JWT rotation, timing-safe compare |
```

**`.references/.summary.md`** — same table format:

```markdown
# References Index

| File | Domain/Topic | Keywords | Updated |
|------|-------------|----------|---------|
| express-middleware.md | backend | routing, middleware chain | 2024-01-15 |
```

Skills read the relevant `.summary.md` first, match keywords against their current task requirements, then drill into matched files. This avoids reading all files in the directory.

Topic filenames in `.references/` use kebab-case: `[a-z0-9]+(-[a-z0-9]+)*` (e.g., `express-middleware.md`, `ffmpeg-filters.md`). No uppercase, no underscores, no dots (except the `.md` extension).
