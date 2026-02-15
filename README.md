# Moonview

[中文文档](README_CN.md)

A Claude Code plugin marketplace for structured task lifecycle management.

> *"Standing on the moon, looking at Earth"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## Plugins

### ai-cli-task

Structured task lifecycle management with 13 sub-commands. Git-integrated branch-per-task workflow with worktree support, annotation-driven planning, and autonomous execution loop.

```
/ai-cli-task:<subcommand> [args]
```

#### Sub-commands

| Command | Description |
|---------|-------------|
| `init` | Create task module — directory, `.index.json`, git branch, optional worktree |
| `plan` | Generate implementation plan from `.target.md` |
| `research` | Collect external domain knowledge to `.references/` |
| `check` | Decision gate at 3 checkpoints: post-plan, mid-exec, post-exec |
| `verify` | Run domain-adapted tests/verification, produce result files |
| `exec` | Execute plan step-by-step with per-step verification |
| `merge` | Merge task branch to main with conflict resolution (up to 3 retries) |
| `report` | Generate completion report + distill experience to knowledge base |
| `auto` | Autonomous loop: plan → check → exec → merge → report |
| `cancel` | Cancel task, optionally cleanup worktree and branch |
| `list` | Query task status and dependency relationships (read-only) |
| `annotate` | Process Plan panel annotations (separated from plan) |
| `summarize` | Rebuild `.summary.md` context summary |

#### Task Lifecycle

```
init → plan → check → exec → check → merge → report
               ↑        ↓
             re-plan ←──┘ (on issues)
```

Every task lives in a `AiTasks/<module>/` directory with structured metadata, and runs on a dedicated `task/<module>` git branch.

#### Features

- **State machine** — 8 statuses (draft/planning/review/executing/re-planning/complete/blocked/cancelled) with validated transitions, no deadlocks
- **Git integration** — branch-per-task, worktree isolation for parallel execution
- **Annotation-driven** — frontend Plan panel annotations (Insert/Delete/Replace/Comment) processed into plan updates
- **Auto mode** — single-session autonomous orchestration with stall detection, context quota management, and safety limits
- **Multi-domain** — 18+ task types (software, image-processing, video-production, DSP, data-pipeline, infrastructure, ml, literary, screenwriting, science:\*, mechatronics, ai-skill, chip-design, ...)
- **Experience KB** — lessons from completed tasks distilled to `AiTasks/.experiences/` for cross-task learning
- **Reference library** — external domain knowledge collected to `AiTasks/.references/` during research
- **Concurrency protection** — lockfile-based mutual exclusion with stale lock recovery

## Installation

```bash
# Add marketplace source
/plugin marketplace add huacheng/moonview

# Install plugin
/plugin install ai-cli-task@moonview
```

## Quick Start

```bash
# 1. Initialize a task
/ai-cli-task:init auth-refactor --title "Refactor auth to JWT"

# 2. Write requirements in AiTasks/auth-refactor/.target.md, then generate plan
/ai-cli-task:plan auth-refactor --generate

# 3. Review plan quality
/ai-cli-task:check auth-refactor --checkpoint post-plan

# 4. Execute the plan
/ai-cli-task:exec auth-refactor

# 5. Verify completion
/ai-cli-task:check auth-refactor --checkpoint post-exec

# 6. Merge to main
/ai-cli-task:merge auth-refactor

# 7. Generate report
/ai-cli-task:report auth-refactor

# Or run the full lifecycle automatically:
/ai-cli-task:auto auth-refactor --start
```

## AiTasks/ Directory Structure

```
AiTasks/
├── .index.json                # Root index (task module listing)
├── .experiences/              # Cross-task knowledge base (by domain type)
│   ├── .summary.md            # Experience file index
│   └── <type>.md
├── .references/               # External reference materials (by topic)
│   ├── .summary.md            # Reference file index
│   └── <topic>.md
└── <module>/
    ├── .index.json            # Task metadata (status, phase, timestamps, deps)
    ├── .target.md             # Requirements (human-authored)
    ├── .plan.md               # Implementation plan
    ├── .summary.md            # Condensed context summary
    ├── .report.md             # Completion report
    ├── .analysis/             # Evaluation history
    ├── .test/                 # Test criteria & results
    ├── .bugfix/               # Issue history
    └── .notes/                # Research notes
```

## Related

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — Web terminal for Claude Code with Plan annotation panel and Chat editor

## License

MIT
