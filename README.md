# Moonview

[中文文档](README_CN.md)

A Claude Code plugin marketplace for structured task lifecycle management.

> *"Standing on the moon, looking at Earth"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## Plugins

### ai-cli-task (v0.5.0)

Structured task lifecycle management with **14 skills** for AI-driven development. Git-integrated branch-per-task workflow with project/notebook hierarchy, domain-aware verification, knowledge library, and autonomous execution.

```
/moonview:ai-cli-task <subcommand> [args]
```

## Lifecycle

```
init → research(target) → plan → research(test) → verify → check → exec → merge → report
            ↑                ↑         ↑              ↑       ↑       ↑
            └──────────────── research callable at every phase ────────┘
```

Utility commands (available anytime): `auto` · `cancel` · `list` · `annotate` · `summarize` · `library`

### Skills (14)

| Skill | Tier | Description |
|-------|------|-------------|
| `init` | light | Create notebook — directory, `.index.json`, git branch, optional worktree |
| `research` | medium | Intelligence officer — target deepening, reference collection, type discovery |
| `plan` | heavy | Generate implementation plan from `.target.md` with domain-adapted methodology |
| `verify` | medium | Run domain-adapted tests, produce result files |
| `check` | heavy | Six-perspective audit at post-plan, mid-exec, post-exec checkpoints |
| `exec` | heavy | Execute plan step-by-step with per-step verification |
| `merge` | medium | Merge task branch to main with conflict resolution (up to 3 retries) |
| `report` | medium | Generate completion report, distill experience to knowledge library |
| `auto` | heavy | Autonomous loop: plan → verify → check → exec → merge → report |
| `cancel` | light | Cancel task, optionally cleanup worktree and branch |
| `list` | light | Query task status, dependency graph, status timeline (read-only) |
| `annotate` | medium | Process Plan panel annotations (Insert/Delete/Replace/Comment) |
| `summarize` | light | Regenerate `.summary.md` for context recovery |
| `library` | light | Knowledge library management (search/list/status/maintain) |

### Status State Machine

```
draft → planning → review → executing → complete
                 ↗            ↘
          re-planning    ←    blocked
```

8 statuses with validated transitions. Terminal states: `complete`, `cancelled`.

## Features

- **Project hierarchy** — `$NB_WORKSPACES_ROOT/<project>/<notebook>/` two-level organization
- **14 skills** — full lifecycle from init to report, plus utility commands
- **Domain-aware** — 19 seed types (software, science:\*, image-processing, video-production, DSP, literary, screenwriting, mechatronics, chip-design, ...) with auto-discovery and hybrid support (`data-pipeline|ml`)
- **Knowledge library** — `.library/.memory/` with experiences, references, type profiles, and thinking patterns across tasks
- **Git integration** — branch-per-task, worktree isolation for parallel execution, structured commit messages
- **Annotation-driven** — frontend Plan panel annotations processed into plan updates
- **Auto mode** — single-session autonomous orchestration with stall detection, context quota, plugin delegation
- **Six-perspective audit** — check skill evaluates plans and implementations from 6 independent viewpoints
- **Research intelligence** — standalone callable at every phase for domain knowledge, requirement deepening, testing methodology
- **Concurrency protection** — lockfile-based mutual exclusion with 6-priority lock ordering and stale lock recovery

## Installation

```bash
# Install from marketplace
claude plugin add huacheng/moonview
```

## Quick Start

```bash
# 1. Initialize a notebook under a project
/moonview:ai-cli-task init my-project auth-refactor --title "Refactor auth to JWT"

# 2. Write requirements in .target.md, then let research deepen them
/moonview:research my-project/auth-refactor --caller target

# 3. Generate plan
/moonview:plan auth-refactor --generate

# 4. Verify → check plan quality
/moonview:verify auth-refactor
/moonview:check auth-refactor --checkpoint post-plan

# 5. Execute the plan
/moonview:exec auth-refactor

# 6. Merge to main + generate report
/moonview:merge auth-refactor
/moonview:report auth-refactor

# Or run the full lifecycle automatically:
/moonview:auto auth-refactor --start
```

## Directory Structure

```
$NB_WORKSPACES_ROOT/
│
├── .library/                          # Shared knowledge library
│   ├── .changelog                     # Append-only write log
│   ├── .master-index.md               # Flat index of all library files
│   ├── .type-registry.md              # Known type registry (seed + auto-expanded)
│   └── .memory/                       # System-managed knowledge base
│       ├── .type-profiles/            # Shared domain methodology profiles
│       ├── .experiences/              # Cross-task experience (by type)
│       ├── .references/               # External reference materials (versioned)
│       └── .thinking/                 # Thinking CoT raw records + distilled patterns
│
├── project-a/
│   ├── .index.json                    # Project metadata
│   ├── notebook-1/
│   │   └── .working/                  # Task state files (system-managed)
│   │       ├── .index.json            # Task metadata (status/phase/type)
│   │       ├── .target.md             # Requirements (human-authored)
│   │       ├── .plan.md               # Implementation plan
│   │       ├── .type-profile.md       # Domain methodology (task-level)
│   │       ├── .summary.md            # Condensed context summary
│   │       ├── .analysis/             # Check evaluation history
│   │       ├── .test/                 # Test criteria & results
│   │       ├── .bugfix/               # Issue history
│   │       └── .notes/                # Research notes & execution log
│   └── notebook-2/
│       └── ...
│
└── project-b/
    └── ...
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` | Root directory for all projects and notebooks |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` | Shared knowledge library directory |

## Related

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — Web interface for Claude Code with Plan annotation panel and Chat editor

## License

MIT
