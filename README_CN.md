# Moonview

[English](README.md)

一个 Claude Code 插件市场，提供结构化的任务生命周期管理。

> *"站在月球看地球"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## 插件

### ai-cli-task

结构化任务生命周期管理，包含 13 个子命令。Git 集成的 branch-per-task 工作流，支持 worktree 并行执行、批注驱动的规划，以及自主执行循环。

```
/ai-cli-task:<subcommand> [args]
```

#### 子命令

| 命令 | 说明 |
|------|------|
| `init` | 创建任务模块 — 目录、`.index.json`、git 分支、可选 worktree |
| `plan` | 从 `.target.md` 生成实施计划 |
| `research` | 收集外部领域知识到 `.references/` |
| `check` | 3 个检查点的决策门：post-plan、mid-exec、post-exec |
| `verify` | 运行领域适配的测试/验证，产出结果文件 |
| `exec` | 按步骤执行计划，每步验证 |
| `merge` | 合并任务分支到 main，冲突解决（最多 3 次重试） |
| `report` | 生成完成报告 + 提炼经验到知识库 |
| `auto` | 自主循环：plan → check → exec → merge → report |
| `cancel` | 取消任务，可选清理 worktree 和分支 |
| `list` | 查询任务状态与依赖关系（只读） |
| `annotate` | 处理 Plan 面板批注（从 plan 分离） |
| `summarize` | 重建 `.summary.md` 上下文摘要 |

#### 任务生命周期

```
init → plan → check → exec → check(mid) → verify → check(post) → merge → report
  research↗     ↑        ↓                   ↓         ↓
               re-plan ←──┴──────────────────┴─────────┘（遇到问题时）
```

每个任务存放在 `AiTasks/<module>/` 目录中，包含结构化元数据，运行在独立的 `task/<module>` git 分支上。

#### 特性

- **状态机** — 8 个状态（draft/planning/review/executing/re-planning/complete/blocked/cancelled），经过验证的转换规则，无死锁
- **Git 集成** — branch-per-task，worktree 隔离实现并行执行
- **批注驱动** — 前端 Plan 面板批注（插入/删除/替换/评注）处理为计划更新
- **Auto 模式** — 单会话自主编排，支持停滞检测、上下文配额管理和安全限制
- **多领域** — 18+ 任务类型（软件、图像处理、视频制作、DSP、数据管道、基础设施、机器学习、文学、编剧、科学、机电、AI 技能、芯片设计……）
- **经验知识库** — 已完成任务的经验提炼到 `AiTasks/.experiences/`，支持跨任务学习
- **参考资料库** — 研究阶段收集的外部领域知识存放在 `AiTasks/.references/`
- **并发保护** — 基于锁文件的互斥，支持过期锁恢复

## 安装

```bash
# 添加 marketplace 源
/plugin marketplace add huacheng/moonview

# 安装插件
/plugin install ai-cli-task@moonview
```

## 快速开始

```bash
# 1. 初始化任务
/ai-cli-task:init auth-refactor --title "重构认证为 JWT"

# 2. 在 AiTasks/auth-refactor/.target.md 中编写需求，然后生成计划
/ai-cli-task:plan auth-refactor --generate

# 3. 审查计划质量
/ai-cli-task:check auth-refactor --checkpoint post-plan

# 4. 执行计划
/ai-cli-task:exec auth-refactor

# 5. 验证完成情况
/ai-cli-task:check auth-refactor --checkpoint post-exec

# 6. 合并到 main
/ai-cli-task:merge auth-refactor

# 7. 生成报告
/ai-cli-task:report auth-refactor

# 或者自动运行完整生命周期：
/ai-cli-task:auto auth-refactor --start
```

## AiTasks/ 目录结构

```
AiTasks/
├── .index.json                # 根索引（任务模块列表）
├── .experiences/              # 跨任务知识库（按领域类型分类）
│   ├── .summary.md            # 经验文件索引
│   └── <type>.md
├── .references/               # 外部参考资料（按主题分类）
│   ├── .summary.md            # 参考文件索引
│   └── <topic>.md
└── <module>/
    ├── .index.json            # 任务元数据（状态、阶段、时间戳、依赖）
    ├── .target.md             # 需求目标（人工编写）
    ├── .plan.md               # 实施计划
    ├── .summary.md            # 压缩上下文摘要
    ├── .report.md             # 完成报告
    ├── .analysis/             # 评估历史
    ├── .test/                 # 测试标准与结果
    ├── .bugfix/               # 问题历史
    └── .notes/                # 研究笔记
```

## 相关项目

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — Claude Code 网页终端，包含 Plan 批注面板和 Chat 编辑器

## 许可证

MIT
