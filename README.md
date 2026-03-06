# Moonview

[中文文档](README_CN.md)

A plugin marketplace for structured task lifecycle management.

> *"Standing on the moon, looking at Earth"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## Installation

```bash
# Claude Code
claude plugin add huacheng/moonview

# Gemini CLI
gemini plugin add huacheng/moonview

# Codex CLI
codex plugin add huacheng/moonview
```

## Plugins

### task-ai (v1.0.0)

## I. Design Philosophy

task-ai is a **self-evolving task lifecycle framework** built on three core principles:

### 1. Verification-First Development
Every change follows the **VFP Protocol** (Verification-First Protocol):
- **VH** (Verification Hypothesis): Define failure baselines before implementation
- **HS** (Hypothesis Satisfied): Verify success after implementation
- **CGG** (Cumulative Green Gate): Every modification passes full regression

### 2. Gated Quality Assurance
The **Six-Dimension Audit** runs through sequential gates, not parallel scoring:
```
Gate 1: D2 Security    ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 2: D1 Correctness ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 3: D3 Reliability ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 4: D4 + D5 + D6   ─── Optimization scoring (non-blocking)
```

This ensures critical issues are fixed before optimization concerns are even evaluated.

### 3. Self-Evolving Intelligence
The framework learns and adapts:
- **Experience → Skill Promotion**: Verified experiences automatically become reusable skills through a four-tier trust pipeline (T1→T2→T3→T4)
- **Dynamic Dimension Adaptation**: Audit weights auto-adjust based on task type
- **Rule Evolution Loop**: External threat intelligence feeds into active security rules
- **Scheduled Maintenance**: Automated cron-driven staleness checks, skill validation, and security evolution

---

## II. Core Concepts

### Task as Notebook
Every task is bound to an independent Notebook structure with:
- `.target.md` — Progressive objectives (multi-stage support)
- `.plan.md` — Implementation plan with VH stubs
- `.working/` — Execution artifacts and state
- `.analysis/` — Six-dimension audit reports

### Shared Knowledge Library
Cross-task knowledge base at `$NB_WORKSPACES_LIBRARY/`:
- `.memory/.references/` — Validated external knowledge
- `.memory/.experiences/` — Distilled task insights
- `.skills/` — Three-tier skill directory (`.candidates/` → `.drafts/` → `.active/`)
- `.changelog` — Append-only audit trail

### Scope-Based Commands
Commands operate at different scopes:
- **`scope=context`** — Conversation-level review (no file output)
- **`scope=lifecycle`** — Full task lifecycle audit
- **`scope=skill`** — Skill validation and promotion
- **`scope=rules`** — Security rule evolution

---

## III. 18 Sub-commands

### Lifecycle Commands

| Command | Role |
|---------|------|
| `init` | Initialize working directory and git branch |
| `target` | Define/refine progressive objectives |
| `research` | Intelligence collection, type discovery |
| `plan` | Generate implementation plan with VH stubs |
| `verify` | Run domain-adapted tests (VH/CGG) |
| `check` | Gated six-dimension review |
| `exec` | Step-by-step execution following VFP |
| `merge` | Merge task branch to main |
| `highlight` | Experience distillation and skill promotion |
| `report` | Generate completion report |

### System Commands

| Command | Role |
|---------|------|
| `read` | Safely ingest external knowledge |
| `security` | Pre-audit plans, verify high-risk commands |
| `auto` | Autonomous execution loop |
| `cancel` | Cancel task, clean up state |
| `list` | Query task inventory and status |
| `annotate` | Process interactive annotations |
| `summarize` | Regenerate context summaries |
| `library` | Knowledge base management and scheduled maintenance |

---

## IV. Six-Dimension Audit

| Dimension | Focus |
|-----------|-------|
| **D1 Correctness** | Requirements coverage, functional logic |
| **D2 Security** | Injection protection, permissions, concurrency |
| **D3 Reliability** | Error handling, fault recovery, idempotency |
| **D4 Performance** | Resource efficiency, I/O optimization |
| **D5 Architecture** | Module boundaries, extension points |
| **D6 Maintainability** | Readability, naming conventions |

### Dynamic Adaptation
Dimension weights auto-adapt based on task type:
1. Load from `.type-profile.md` "Audit Adaptation" section
2. Fallback to `.memory/.type-profiles/<type>.md`
3. Final fallback to seed tables in `check/references/`

---

## V. Self-Evolution Infrastructure

### Skill Trust Pipeline (T1 → T4)

```
T1 Candidate (.skills/.candidates/)
    ↓  check --checkpoint skill-review (L2, score ≥ 0.70)
T2 Draft (.skills/.drafts/)
    ↓  check --checkpoint skill-deep-review (L3, score ≥ 0.85)
T3 Active (.skills/.active/)
    ↓  Production validation (usage_count ≥ 3, zero REPLAN failures)
T4 Production-Validated (.skills/.active/, trust_tier: T4)
```

All promotions are fully LLM-automated — no human review gates.

### Rule Evolution Loop
```
External Intelligence → research --caller audit → candidates/*.yaml
                                    ↓
                      check --checkpoint audit-validate
                                    ↓ (precision >= 0.80)
                              active/*.yaml
                                    ↓
                 Automatic loading by security/read/check
```

### Scheduled Maintenance

Automated cron-driven maintenance runs four checks daily:

| Check | Interval | Description |
|-------|----------|-------------|
| Staleness | 24h | Flag references older than 30 days |
| T3→T4 Validation | 24h | Auto-promote skills meeting production criteria |
| Security Rules Evolution | Core: 7d / Extended: 1d | Scan threats, sync evolving rules |
| Changelog Size | 24h | Warn if changelog exceeds 2000 lines |

```bash
# Auto-configure cron (daily at 03:00, version-independent path)
/task-ai:library maintain --install-cron

# Remove cron entry
/task-ai:library maintain --uninstall-cron
```

---

## VI. Runtime Infrastructure

### Core Modules

| Module | Role |
|--------|------|
| `state.py` | State machine with atomic locking |
| `frontmatter.py` | Frontmatter parsing for SKILL.md and experiences |
| `lib.sh` | Shared runtime utilities |
| `rebuild-index.py` | Index builder for `.memory/` and `.skills/` |
| `core-rule-auto.sh` | Security rules LLM-driven evolution pipeline |
| `rule-loader.sh` | Dynamic rule loading |

### Environment Variables

| Variable | Default |
|----------|---------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` |

---

## Prerequisites

task-ai is tightly integrated with [notebook-ai](https://github.com/huacheng/notebook-ai) — the web-based notebook platform that provides the task execution UI, file viewer, and annotation panel. **notebook-ai must be running** for task-ai to function properly.

```bash
# Start notebook-ai first
git clone https://github.com/huacheng/notebook-ai.git
cd notebook-ai && ./restart.sh
```

## License

MIT

---
*task-ai v1.0.0 — Self-evolving task lifecycle management*
