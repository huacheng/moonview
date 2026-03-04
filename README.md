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

### task-ai (v0.9.7)

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
- **Experience → Skill Promotion**: Verified experiences automatically become reusable skills
- **Dynamic Dimension Adaptation**: Audit weights auto-adjust based on task type
- **Rule Evolution Loop**: External threat intelligence feeds into active security rules

---

## II. Core Concepts

### Task as Notebook
Every task is bound to an independent Notebook structure with:
- `.target.md` — Progressive objectives (multi-stage support)
- `.plan.md` — Implementation plan with VH stubs
- `.working/` — Execution artifacts and state
- `.analysis/` — Six-dimension audit reports

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
| `library` | Knowledge base management |

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

### Experience → Skill Pipeline
```
Verified Experience (usage_count >= 3, quality_status = verified)
        ↓
    highlight scope=promote
        ↓
    Candidate Skill + Trust Report
        ↓
    check --checkpoint skill-review (Gated D1-D6)
        ↓
    Activated Skill (Trust Tier T2+)
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

---

## VI. Quick Start

```bash
# 1. Initialize
/task-ai:init my-project auth-refactor --title "Refactor auth to JWT"

# 2. Define objectives
/task-ai:target auth-refactor

# 3. Generate plan
/task-ai:plan auth-refactor --generate

# 4. Gated review
/task-ai:check auth-refactor --checkpoint post-plan

# 5. Execute
/task-ai:exec auth-refactor

# 6. Complete
/task-ai:merge auth-refactor
/task-ai:highlight auth-refactor
/task-ai:report auth-refactor

# Or run fully autonomous:
/task-ai:auto auth-refactor --start
```

---

## VII. Runtime Infrastructure

### Core Modules

| Module | Role |
|--------|------|
| `state.py` | State machine with atomic locking |
| `lib.sh` | Shared runtime utilities |
| `yaml_parser.py` | Unified YAML parsing for rules |
| `rule-loader.sh` | Dynamic rule loading |

### Environment Variables

| Variable | Default |
|----------|---------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` |

---

## Related

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — Web interface with Plan annotation panel

## License

MIT

---
*task-ai v0.9.7 — Self-evolving task lifecycle management*
