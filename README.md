# Task Analyzer

A Claude Code plugin that performs pre-execution task complexity analysis and routes to the most token-efficient execution path.

**Classify first, then route** — unlike blind model downgrades, Task Analyzer matches resources to task characteristics with precision.

## Installation

### From Marketplace

```bash
# Add marketplace source
/plugin marketplace add https://github.com/huacheng/task-analyzer

# Install the plugin
/plugin install task-analyzer
```

### Manual Installation

Clone the repository into your Claude Code plugins directory:

```bash
git clone https://github.com/huacheng/task-analyzer.git ~/.claude/plugins/local/task-analyzer
```

Then register it in `~/.claude/plugins/installed_plugins.json`:

```json
{
  "task-analyzer@local": [
    {
      "scope": "user",
      "installPath": "~/.claude/plugins/local/task-analyzer",
      "version": "1.0.0"
    }
  ]
}
```

## Usage

Invoke the skill with any of these triggers:

```
/task-analyzer refactor auth to use JWT
ta: add validation to the login form
task-analyze: refactor the database module
```

**Aliases:** `ta`, `task-analyze`, `analyze-task`, `task-plan`, `budget-plan`

## How It Works

Task Analyzer is a universal pre-execution complexity analyzer for the **entire Claude Code toolchain**:

- Native tools (Read / Edit / Write / Grep / Glob / Bash)
- Built-in agents (Explore / Plan / general-purpose / Bash agent)
- oh-my-claudecode (OMC) plugin agents
- MCP tools and other loaded plugin capabilities

### Step 1: Classify Complexity (L0–L4)

| Level | Name | Criteria | Examples |
|-------|------|----------|---------|
| **L0** | Trivial | Single file, <10 lines, obvious change | Fix typo, update config value, add import |
| **L1** | Simple | Single file, clear logic, <50 lines | Add a function, fix a clear bug, add validation |
| **L2** | Moderate | 2-3 files, straightforward pattern | Add API endpoint + handler, refactor one module |
| **L3** | Complex | 4+ files, cross-cutting concerns | New feature with DB + API + tests, major refactor |
| **L4** | Massive | System-wide, architectural, 10+ files | New subsystem, full stack feature, migration |

### Step 2: Route to Minimum-Cost Strategy

| Level | Strategy | Agents | Verification |
|-------|----------|--------|-------------|
| **L0** | Native tools directly | 0 | None |
| **L1** | Native tools or 1 lightweight agent | 0-1 | `lsp_diagnostics` |
| **L2** | 1-2 agents sequential | 1-2 | Build / test run |
| **L3** | 2-4 agents, may parallel | 2-4 | Full test suite + review |
| **L4** | Orchestration mode | 3-6 | Full verification protocol |

### Step 3: Output & Execute

```
[TASK ANALYSIS] L2: Add health endpoint with DB check
Strategy: single-agent
Toolchain: native+omc
Steps:
  1. Read existing route patterns -> Read tool
  2. Implement endpoint + handler -> executor-low:haiku
  3. Verify -> lsp_diagnostics + test run
Verification: build check
Est. overhead: low
```

## Tool Selection Layers

From cheapest to most expensive:

```
Layer 0: Native tools (Read/Edit/Write/Grep/Glob/Bash)
Layer 1: Built-in lightweight agents (Explore:haiku)
Layer 2: OMC low-tier agents (executor-low:haiku)
Layer 3: Built-in general agents (general-purpose:sonnet)
Layer 4: OMC mid-tier agents (executor:sonnet)
Layer 5: OMC high-tier agents (executor-high:opus)
Layer 6: Orchestration modes (ultrawork / autopilot / ralph)
```

## Quick Rules

| Rule | Description |
|------|-------------|
| **File Count** | Files to modify ≤ 1 → direct edit, no agent |
| **Known Path** | File path already known → `Read` directly, never Explore agent |
| **Keyword Search** | Use `Grep`/`Glob` directly, never Bash grep/find |
| **Batching** | Group related changes into ONE agent prompt (max 5 files) |
| **Verification** | Match to complexity (L0=none, L1=lsp_diagnostics, L2+=tests) |
| **Model Tier** | Try cheapest first (haiku → sonnet → opus), escalate on failure |
| **MCP Tools** | Call `lsp_diagnostics`, `ast_grep_search` directly, no agent needed |

## Anti-Waste Patterns

| Waste Pattern | Fix | Savings |
|---------------|-----|---------|
| Agent for single-file edit | Direct Edit tool | ~2.5K tokens |
| Opus for known-pattern task | Haiku/Sonnet | ~5K tokens |
| Explore agent for known path | Read tool directly | ~1.8K tokens |
| Architect verify for L0-L1 | Skip or lsp_diagnostics | ~4.5K tokens |
| Per-file agent spawning | Batch into one agent | ~2.5K × (N-1) tokens |

## Integration with OMC Modes

Task Analyzer works as a **pre-processor** for OMC orchestration modes:

| Mode | Task Analyzer Role |
|------|-------------------|
| **ecomode** | Classifies first, ecomode further downgrades tiers |
| **ultrawork** | Decides IF parallelism is worth it |
| **ralph** | Optimizes agent selection per iteration |
| **autopilot** | Pre-screens before autopilot planning |

Without OMC installed, Task Analyzer is equally effective via native tools and built-in agents.

## Compared to Ecomode

| Aspect | Task Analyzer | Ecomode |
|--------|--------------|---------|
| Scope | All tools | OMC agents only |
| Approach | Classify first, then route | Blindly downgrade tiers |
| Direct edits | Yes, skips agents for L0-L1 | Still delegates |
| Batching | Groups related files | No batching |
| Without OMC | Fully functional | Not applicable |

**Best together:** Task Analyzer + Ecomode provides maximum token efficiency.

## License

MIT
