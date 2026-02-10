---
name: task-analyzer
description: Task complexity grading (L0-L4) with automatic token-efficient execution path selection (native tools > low-tier agents > high-tier agents)
triggers: [ta, task-analyze, analyze-task, task-plan, budget-plan]
matching: fuzzy
---

<Purpose>
Task Analyzer is a universal pre-execution complexity analyzer for the **entire Claude Code toolchain** — native tools (Read/Edit/Write/Grep/Glob/Bash), built-in agents (Explore/Plan/general-purpose/Bash agent), oh-my-claudecode (OMC) plugin agents, MCP tools, and any other loaded plugin capabilities.

Core principle: **classify first, then route**. Assess task complexity, then pick the minimum-cost path that can deliver the required quality. Unlike ecomode (which blindly downgrades model tiers), Task Analyzer matches resources to task characteristics with precision.
</Purpose>

<Use_When>
- Before starting any non-trivial task (automatically or explicitly)
- User says "ta", "task-analyze", "analyze-task", "task-plan", "budget-plan"
- You're unsure whether to do directly or delegate
- A task has multiple viable approaches and you want the cheapest effective one
- User is concerned about token usage / subscription quota
</Use_When>

<Do_Not_Use_When>
- Task is obviously trivial (typo fix, single config line change) — just do it
- User explicitly requested a specific mode (ralph, ultrawork, autopilot) — respect their choice
- Emergency debugging where speed matters more than cost
</Do_Not_Use_When>

<Why_This_Exists>
Common token waste patterns in Claude Code sessions:

1. **Unnecessary agent spawning**: Single-file edit triggers agent spawn (~3K+ overhead)
2. **Model over-selection**: Using opus for tasks haiku handles fine (~5x cost difference)
3. **Redundant verification**: Running full architect verification on trivial changes (~5K wasted)
4. **Over-parallelization**: Spawning 2 agents for small tasks cheaper done sequentially (~3K wasted)
5. **Redundant exploration**: Using Explore agent when file path is already known (~2K wasted)
6. **Per-file spawning**: Splitting related file changes into N agents instead of batching (~2.5K × (N-1))
7. **Tool mismatch**: Using Bash grep instead of Grep tool, Bash cat instead of Read tool

Task Analyzer eliminates all of the above through pre-execution analysis.
</Why_This_Exists>

<Execution_Policy>
- This skill is an ANALYZER, not an executor — it outputs a plan, then you follow it
- Classification must happen BEFORE any agent delegation
- When in doubt, classify DOWN (cheaper is better when quality is equal)
- The plan output is a binding contract — follow it, don't upgrade mid-execution
- Only escalate AFTER a lower-tier approach fails (lazy escalation)
</Execution_Policy>

<Steps>

## Step 1: Classify Task Complexity

Analyze the user's request and assign ONE complexity level:

| Level | Name | Criteria | Examples |
|-------|------|----------|---------|
| **L0** | Trivial | Single file, <10 lines, obvious change | Fix typo, update config value, add import |
| **L1** | Simple | Single file, clear logic, <50 lines | Add a function, fix a clear bug, add validation |
| **L2** | Moderate | 2-3 files, straightforward pattern | Add API endpoint + handler, refactor one module |
| **L3** | Complex | 4+ files, cross-cutting concerns, design decisions | New feature with DB + API + tests, major refactor |
| **L4** | Massive | System-wide, architectural, 10+ files | New subsystem, full stack feature, migration |

**Classification rules:**
- Count files that will be MODIFIED (not read)
- If a clear pattern exists in the codebase, classify one level DOWN
- If requirements are ambiguous, classify one level UP (need exploration/planning)
- "Fix all X" with unknown scope = L2 minimum (need exploration first)

## Step 2: Map to Execution Strategy

### Tool Selection Layers (lowest to highest cost)

```
Layer 0: Native tools directly (Read/Edit/Write/Grep/Glob/Bash)
Layer 1: Built-in lightweight agents (Explore:haiku / Bash agent)
Layer 2: OMC low-tier agents (executor-low:haiku / architect-low:haiku)
Layer 3: Built-in general agents (general-purpose:sonnet / Plan:sonnet)
Layer 4: OMC mid-tier agents (executor:sonnet / architect-medium:sonnet)
Layer 5: OMC high-tier agents (executor-high:opus / architect:opus)
Layer 6: Orchestration modes (ultrawork / autopilot / ralph)
```

### Complexity → Strategy Mapping

| Level | Strategy | Agents | Tool Layer | Verification |
|-------|----------|--------|------------|-------------|
| **L0** | Native tools directly | 0 | Layer 0 | None (eyeball check) |
| **L1** | Native tools or 1 lightweight agent | 0-1 | Layer 0-2 | `lsp_diagnostics` / simple test |
| **L2** | 1-2 agents sequential | 1-2 | Layer 2-4 | Build check / test run |
| **L3** | 2-4 agents, may parallel | 2-4 | Layer 3-5 | Full test suite + architect-low review |
| **L4** | Orchestration mode | 3-6 | Layer 4-6 | Full verification protocol |

## Step 3: Select Specific Tools/Agents

**Principle: use native tools over agents, use lower tiers over higher tiers.**

### Universal Tool Selection (works without OMC)

| Need | First Choice (cheapest) | Fallback | Never Use |
|------|------------------------|----------|-----------|
| Read a single file | `Read` tool directly | — | Bash `cat`, Explore agent |
| Search for keywords | `Grep` tool | — | Bash `grep`/`rg` |
| Find files by pattern | `Glob` tool | — | Bash `find`/`ls` |
| Edit known file < 10 lines | `Edit` tool | — | Any agent |
| Write new file | `Write` tool | — | Bash `echo`/`cat` |
| Execute commands | `Bash` tool | — | — |
| Open-ended code search | Built-in `Explore` agent (haiku) | OMC `explore` (haiku) | OMC `explore-high` (opus) |
| Multi-step autonomous task | Built-in `general-purpose` agent | OMC `executor` (sonnet) | — |

### OMC Agent Selection (when oh-my-claudecode is installed)

| Need | First Choice | Escalate To | Avoid |
|------|-------------|-------------|-------|
| Simple code change | Direct Edit/Write | `executor-low` (haiku) | `executor` (sonnet) |
| Standard code change | `executor-low` (haiku) | `executor` (sonnet) | `executor-high` (opus) |
| Complex refactor | `executor` (sonnet) | `executor-high` (opus) | — |
| Quick code question | Read + answer directly | `architect-low` (haiku) | `architect` (opus) |
| Design analysis | `architect-low` (haiku) | `architect-medium` (sonnet) | `architect` (opus) |
| Complex debugging | `architect-medium` (sonnet) | `architect` (opus) | — |
| Documentation | `writer` (haiku) | — | Any higher tier |
| UI component | `designer-low` (haiku) | `designer` (sonnet) | `designer-high` (opus) |
| Type checking | `lsp_diagnostics` directly | `build-fixer-low` (haiku) | `build-fixer` (sonnet) |
| Security review | `security-reviewer-low` (haiku) | `security-reviewer` (opus) | — |
| Data analysis | `scientist-low` (haiku) | `scientist` (sonnet) | `scientist-high` (opus) |

### Built-in Agent Selection (non-OMC)

| Need | Built-in Agent | Model Param | Use Case |
|------|---------------|-------------|----------|
| File/code search | `Explore` | haiku | Codebase exploration, find files |
| Implementation planning | `Plan` | sonnet | Design implementation approach |
| General multi-step task | `general-purpose` | sonnet | General execution without OMC |
| Command execution | `Bash` agent | haiku | Multi-step shell operations |
| Code review | `feature-dev:code-reviewer` | — | PR / code quality review |
| Architecture exploration | `feature-dev:code-explorer` | — | Deep understanding of existing code |
| Architecture design | `feature-dev:code-architect` | — | Feature architecture blueprint |

## Step 4: Output the Plan

Output a concise execution plan in this format:

```
[TASK ANALYSIS] L{level}: {task summary}
Strategy: {direct / single-agent / multi-agent / orchestration}
Toolchain: {native / native+omc / native+builtin / full}
Steps:
  1. {action} -> {tool or agent:model}
  2. {action} -> {tool or agent:model}
Verification: {method}
Est. overhead: {low / medium / high}
```

Then EXECUTE the plan immediately.

</Steps>

<Tool_Usage>
**Native-first principle (applies to ALL scenarios, not just OMC):**
- L0-L1 tasks: Use Read/Edit/Write directly, do NOT spawn any agent
- Type checking: Call `lsp_diagnostics` directly, not build-fixer agent
- File structure: Call `lsp_document_symbols` directly, not explore agent
- Known file paths: Use `Read` directly, not Explore/explore agent
- Keyword search: Use `Grep`/`Glob` directly, not any agent

**Agent spawn rules (only for L2+):**
- Only spawn agents when the task genuinely requires autonomous multi-step execution
- Always pass `model` parameter explicitly (haiku/sonnet/opus)
- Batch related file changes into ONE agent prompt (max 5 files per batch)
- Independent tasks can be spawned in parallel; dependent tasks run sequentially

**MCP tools — call directly (no agent intermediary needed):**
- `lsp_hover`, `lsp_goto_definition`: Quick type lookups
- `lsp_diagnostics`: Single-file error checking
- `ast_grep_search`: Structural code pattern search
- `python_repl`: Quick data computation / verification
</Tool_Usage>

<Escalation_And_Stop_Conditions>
- L0/L1 direct edit fails (syntax error, wrong logic) → escalate to L2 (spawn one haiku agent)
- Haiku agent produces incorrect code → retry with sonnet (don't jump to opus)
- Task turns out more complex than classified → RE-CLASSIFY and output a new plan
- User explicitly requests a higher-tier approach → respect their choice but note cost difference
- NEVER escalate preemptively — try the cheaper approach first, escalate only on failure
</Escalation_And_Stop_Conditions>

<Advanced>

## Anti-Waste Pattern Reference

| Waste Pattern | Token Cost | Fix | Savings |
|---------------|-----------|-----|---------|
| Agent for single-file edit | ~3K+ | Direct Edit tool | ~2.5K per occurrence |
| Opus for known-pattern task | ~8K | Haiku/Sonnet | ~5K per task |
| Explore agent for known file path | ~2K | Read tool directly | ~1.8K per file |
| Architect verify for L0-L1 | ~5K | Skip or lsp_diagnostics | ~4.5K per task |
| Per-file agent spawning | ~3K × N | Batch into one agent | ~2.5K × (N-1) |
| 2 small tasks in parallel agents | ~6K (2 agents) | Sequential in one agent | ~3K |
| Re-reading files already in context | ~1K+ | Reference previous read | ~1K per file |
| Bash grep/cat/find instead of native tools | ~0.5K | Use Grep/Read/Glob | UX + ~0.3K |
| general-purpose agent for simple lookup | ~2K | Direct Grep + Read | ~1.5K |

## Integration with OMC Modes (only when oh-my-claudecode is installed)

Task Analyzer works as a PRE-PROCESSOR for OMC modes:

| OMC Mode | Task Analyzer Role |
|----------|-------------------|
| **ecomode** | Task Analyzer classifies first, ecomode further downgrades model tiers |
| **ultrawork** | Task Analyzer decides IF parallelism is worth it, ultrawork executes |
| **ralph** | Task Analyzer optimizes agent selection in each iteration |
| **autopilot** | Task Analyzer pre-screens before autopilot's own planning |

**Without OMC installed**, Task Analyzer is equally effective — it routes directly via native tools and built-in agents.

## Session-Wide Efficiency Rules

When Task Analyzer is active, these rules apply to ALL subsequent operations:

1. **3-Second Rule**: If you can think through it in ~3 seconds, do it directly — no agent
2. **File Count Rule**: Files to modify ≤ 1 → direct edit, no agent
3. **Known Path Rule**: If file path is already known/mentioned, never use Explore/explore agent
4. **Batch Rule**: Group related changes into one agent, max 5 files per batch
5. **Lazy Escalation**: Always try the cheaper tier first, escalate only on failure
6. **Skip Verify for L0**: Trivial changes don't need architect verification
7. **Context Reuse**: If you already read a file, reference it — don't re-read in agent
8. **Tool Correctness**: Use dedicated tools (Grep/Read/Glob) instead of Bash equivalents

</Advanced>

Task: {{ARGUMENTS}}
