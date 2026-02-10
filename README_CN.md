# Task Analyzer（任务分析器）

一个 Claude Code 插件，在执行前对任务进行复杂度分析，并路由到最省 token 的执行路径。

**先分级，再路由** — 不同于盲目降级模型，Task Analyzer 根据任务特征精确匹配资源。

## 安装

### 从 Marketplace 安装

```bash
# 添加 marketplace 源
/plugin marketplace add https://github.com/huacheng/task-analyzer

# 安装插件
/plugin install task-analyzer
```

### 手动安装

将仓库克隆到 Claude Code 插件目录：

```bash
git clone https://github.com/huacheng/task-analyzer.git ~/.claude/plugins/local/task-analyzer
```

然后在 `~/.claude/plugins/installed_plugins.json` 中注册：

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

## 使用方式

通过以下任意触发词调用：

```
/task-analyzer refactor auth to use JWT
ta: add validation to the login form
task-analyze: refactor the database module
```

**别名：** `ta`, `task-analyze`, `analyze-task`, `task-plan`, `budget-plan`

## 工作原理

Task Analyzer 是一个通用的预执行复杂度分析器，覆盖**整个 Claude Code 工具链**：

- 原生工具（Read / Edit / Write / Grep / Glob / Bash）
- 内置 agent（Explore / Plan / general-purpose / Bash agent）
- oh-my-claudecode (OMC) 插件 agent
- MCP 工具及其他已加载的插件能力

### 第一步：分级复杂度（L0–L4）

| 等级 | 名称 | 标准 | 示例 |
|------|------|------|------|
| **L0** | Trivial | 单文件, <10 行, 明显变更 | 修错别字, 改配置值, 加 import |
| **L1** | Simple | 单文件, 逻辑清晰, <50 行 | 加函数, 修明确 bug, 加验证 |
| **L2** | Moderate | 2-3 文件, 模式明确 | 加 API endpoint + handler, 重构单模块 |
| **L3** | Complex | 4+ 文件, 横切关注点 | 新功能含 DB + API + tests, 大型重构 |
| **L4** | Massive | 系统级, 架构性, 10+ 文件 | 新子系统, 全栈功能, 迁移 |

### 第二步：路由到最低成本策略

| 等级 | 策略 | Agent 数量 | 验证方式 |
|------|------|-----------|---------|
| **L0** | 原生工具直接操作 | 0 | 无 |
| **L1** | 原生工具或 1 个轻量 agent | 0-1 | `lsp_diagnostics` |
| **L2** | 1-2 个 agent 顺序执行 | 1-2 | 构建 / 测试运行 |
| **L3** | 2-4 个 agent，可能并行 | 2-4 | 完整测试套件 + 审查 |
| **L4** | 编排模式 | 3-6 | 完整验证协议 |

### 第三步：输出并执行

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

## 工具选择层级

从最便宜到最贵：

```
Layer 0: 原生工具 (Read/Edit/Write/Grep/Glob/Bash)
Layer 1: 内置轻量 agent (Explore:haiku)
Layer 2: OMC 低tier agent (executor-low:haiku)
Layer 3: 内置通用 agent (general-purpose:sonnet)
Layer 4: OMC 中tier agent (executor:sonnet)
Layer 5: OMC 高tier agent (executor-high:opus)
Layer 6: 编排模式 (ultrawork / autopilot / ralph)
```

## 快速规则

| 规则 | 说明 |
|------|------|
| **文件数** | 要修改的文件 ≤ 1 → 直接编辑，不用 agent |
| **已知路径** | 文件路径已知 → 直接 `Read`，绝不用 Explore agent |
| **关键字搜索** | 直接用 `Grep`/`Glob`，绝不用 Bash grep/find |
| **批处理** | 相关变更合入一个 agent prompt（最多 5 文件） |
| **验证** | 匹配复杂度（L0=无, L1=lsp_diagnostics, L2+=tests） |
| **模型 tier** | 先试最便宜（haiku → sonnet → opus），仅失败时升级 |
| **MCP 工具** | 直接调用 `lsp_diagnostics`, `ast_grep_search`，无需 agent |

## 反浪费模式

| 浪费模式 | 修复方法 | 节省 |
|---------|---------|------|
| Agent 做单文件编辑 | 直接 Edit 工具 | ~2.5K tokens |
| Opus 做已知模式任务 | Haiku/Sonnet | ~5K tokens |
| Explore agent 查已知路径 | 直接 Read 工具 | ~1.8K tokens |
| L0-L1 做 Architect 验证 | 跳过或 lsp_diagnostics | ~4.5K tokens |
| 逐文件 spawn agent | 批处理到一个 agent | ~2.5K × (N-1) tokens |

## 与 OMC 模式集成

Task Analyzer 作为 OMC 编排模式的**预处理器**：

| 模式 | Task Analyzer 角色 |
|------|-------------------|
| **ecomode** | 先分级，ecomode 再进一步降级 tier |
| **ultrawork** | 决定是否值得并行化 |
| **ralph** | 优化每次迭代的 agent 选择 |
| **autopilot** | 在 autopilot 规划前做预筛选 |

未安装 OMC 时，Task Analyzer 通过原生工具和内置 agent 同样有效。

## 与 Ecomode 对比

| 方面 | Task Analyzer | Ecomode |
|------|--------------|---------|
| 范围 | 全工具链 | 仅 OMC agent |
| 方式 | 先分级再路由 | 盲目降级 tier |
| 直接编辑 | 是，L0-L1 跳过 agent | 仍委派给 agent |
| 批处理 | 合并相关文件 | 无批处理意识 |
| 无 OMC | 完全可用 | 不适用 |

**最佳组合：** Task Analyzer + Ecomode 一起使用提供最高 token 效率。

## 许可证

MIT
