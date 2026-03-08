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

### task-ai (v1.2.1)

## I. Design Philosophy

**task-ai is a system that admits ignorance.** It doesn't pretend to know how large a task is, how many stages it needs, what security threats look like, what best practices apply, or even at what pace it should run. What it provides is a structured framework for emergence:

- **Task objectives emerge one step at a time** rather than being predefined (Progressive Evolution)
- **Domain knowledge precipitates from practice** and flows across tasks (Experience Distillation & Adoption Tracking)
- **Security defenses grow from 10 seed rules** toward unknown threats (Evolvable Injection Detection)
- **Runtime parameters converge from hardcoded defaults** toward type-specific experience (Adaptive Thresholds)

All emergent artifacts pass through review gates before solidification — candidate rules require `audit-validate`, experiences transition from `provisional` to `verified`, thresholds require statistical backing from post-loop learning. And when new understanding overturns old conclusions, the system has paths to re-evolve: experiences can be `invalidated`, rules can be overridden, `satisfied` can re-enter `planning`.

**Its terminal state is not "done" — it's "enough for now".**

### Core Principles

| Principle | Description |
|---|---|
| **Admit Ignorance** | Never predefine what can emerge from practice. Task stages, domain methodology, security rules, and runtime parameters all start as defaults and evolve through experience |
| **Three-Layer Emergence** | Tasks evolve (stages emerge), knowledge evolves (experiences distill and flow), security evolves (rules grow from seed baseline) |
| **File-as-Context** | Sub-commands share context through `.working/` directory files, not parameters or shared memory. Any skill can be invoked independently |
| **Gated Emergence** | Emergence ≠ permissiveness. Every artifact passes through review: D1-D6 six-dimension scoring, quality status transitions, audit validation |
| **Self-Adaptive** | Users configure nothing. All behavioral parameters have hardcoded fallbacks and converge from experience — the more tasks of the same type run, the better the system understands that type's rhythm |
| **Only Abandonment is Final** | `cancelled` is the only terminal state. `satisfied` is "temporarily enough" — re-enterable when understanding grows or requirements change |
| **Lessons Must Close the Loop** | Experiences aren't write-and-forget. Plans record adoption sources, highlight tracks adoption counts, reports summarize bidirectionally. Good lessons prove themselves through repeated adoption |
| **Security Baseline is Floor, Not Ceiling** | 10 injection detection categories are the seed baseline. Evolved rules can override any category or append new ones (11+). Security is continuous adversarial adaptation |

---

## II. Three Evolution Layers

### 1. Task Evolution — Progressive Stages

Stages emerge one at a time. No predefined `stage.total`. Each merge produces `evolving` status; the user decides the next direction or says "satisfied".

```
init → target → plan → check → exec → merge → report
         ↑                                    ↓
         └──── evolving (define next stage) ──┘
                    │
                    └──→ satisfied (re-enterable)
```

### 2. Knowledge Evolution — Experience Lifecycle

```
highlight writes experiences → plan reads & adopts → adoption_count increments
     ↓                              ↓                        ↓
provisional → verified         Adopted Experiences §    high adoption = proven lesson
     ↓                              ↓
invalidated (if misleading)    report summarizes both directions
```

Shared type profiles accumulate cross-task domain intelligence. Three writers: research (discovery), highlight (distillation), auto (execution metrics).

### 3. Security Evolution — Evolvable Rules

```
seed baseline (10 categories, injection-rules.md)
        +
evolved rules (.evolving-rules/sanitization/active/*.md)
        ↓ merge: evolved > seed (same category overrides, new categories append)
        ↓
merged ruleset applied to all external content
```

---

## III. Adaptive Behavior

All behavioral parameters start as hardcoded defaults and converge from experience:

| Parameter | Source | Fallback |
|---|---|---|
| Review thresholds | `.type-profile.md` Auto Adaptation | 0.70 / 0.60 / 0.75 / 0.80 |
| Retry limits | `.type-profile.md` Auto Adaptation | 3 / 2 / 3 |
| Mid-exec check interval | `.type-profile.md` Auto Adaptation | every 3 steps |
| Compaction threshold | `.type-profile.md` Auto Adaptation | 82% context window |

After each auto run, post-loop learning writes observed metrics back. Future tasks of the same type use experience-refined values.

---

## IV. 18 Sub-commands

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
| `highlight` | Experience distillation and adoption tracking |
| `report` | Generate completion report with adoption summary |

### System Commands

| Command | Role |
|---------|------|
| `read` | Safely ingest external knowledge (seed + evolved rules) |
| `security` | Pre-audit plans, verify high-risk commands |
| `auto` | Autonomous execution loop (adaptive thresholds) |
| `cancel` | Cancel task, clean up state |
| `list` | Query task inventory and status |
| `annotate` | Process interactive annotations |
| `summarize` | Regenerate context summaries |
| `library` | Knowledge base management and scheduled maintenance |

---

## V. Six-Dimension Gated Review (D1-D6)

| Dimension | Focus |
|-----------|-------|
| **D1 Correctness** | Requirements coverage, functional logic |
| **D2 Security** | Injection protection, permissions, concurrency |
| **D3 Reliability** | Error handling, fault recovery, idempotency |
| **D4 Performance** | Resource efficiency, I/O optimization |
| **D5 Architecture** | Module boundaries, extension points |
| **D6 Maintainability** | Readability, naming conventions |

### Gated Execution
```
Gate 1: D2 Security    ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 2: D1 Correctness ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 3: D3 Reliability ─── BLOCK < 0.5 ───→ Fix before proceeding
Gate 4: D4 + D5 + D6   ─── Optimization scoring (non-blocking)
```

### Dynamic Adaptation
Dimension weights auto-adapt based on task type:
1. Load from `.type-profile.md` "Audit Adaptation" section
2. Fallback to `.memory/.type-profiles/<type>.md`
3. Final fallback to seed tables in `check/references/`

---

## VI. Self-Evolution Infrastructure

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

| Check | Interval | Description |
|-------|----------|-------------|
| Staleness | 24h | Flag references older than 30 days |
| T3→T4 Validation | 24h | Auto-promote skills meeting production criteria |
| Security Rules Evolution | Core: 7d / Extended: 1d | Scan threats, sync evolving rules |
| Changelog Size | 24h | Warn if changelog exceeds 2000 lines |

---

## VII. Auto Mode — Four-Phase Flow

```
Phase 1: Target Definition (human-in-loop)
Phase 2: Planning (auto-review, adaptive thresholds from .type-profile.md)
Phase 3: Execution (auto-review, adaptive mid-exec check interval)
Phase 4: Finalization (merge → highlight → report → stop)
```

Post-loop learning writes execution metrics (retries, iterations, compaction count) back to `.type-profile.md` Auto Adaptation, enabling future tasks to run with experience-refined parameters.

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
*task-ai v1.2.1 — A system that admits ignorance and lets everything emerge from practice*
