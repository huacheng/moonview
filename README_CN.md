# Moonview

[English](README.md)

一个 Claude Code 插件市场，提供结构化的任务生命周期管理。

> *"站在月球看地球"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## 插件

### ai-cli-task (v0.5.0)

结构化任务生命周期管理，包含 **14 个技能**，面向 AI 驱动开发。Git 集成的 branch-per-task 工作流，支持项目/笔记本层级、领域感知验证、知识库和自主执行。

```
/moonview:ai-cli-task <subcommand> [args]
```

## 生命周期

```
init → research(target) → plan → research(test) → verify → check → exec → merge → report
            ↑                ↑         ↑              ↑       ↑       ↑
            └──────────────── research 可在任意阶段独立调用 ────────────┘
```

辅助命令（随时可用）：`auto` · `cancel` · `list` · `annotate` · `summarize` · `library`

### 技能（14 个）

| 技能 | 层级 | 说明 |
|------|------|------|
| `init` | light | 创建笔记本 — 目录、`.index.json`、git 分支、可选 worktree |
| `research` | medium | 情报官 — 目标深化、参考收集、类型发现 |
| `plan` | heavy | 从 `.target.md` 生成实施计划，采用领域适配方法论 |
| `verify` | medium | 运行领域适配测试，生成结果文件 |
| `check` | heavy | 六视角审计：post-plan、mid-exec、post-exec 三个检查点 |
| `exec` | heavy | 按步骤执行计划，每步验证 |
| `merge` | medium | 合并任务分支到 main，冲突解决（最多 3 次重试） |
| `report` | medium | 生成完成报告，提炼经验到知识库 |
| `auto` | heavy | 自主循环：plan → verify → check → exec → merge → report |
| `cancel` | light | 取消任务，可选清理 worktree 和分支 |
| `list` | light | 查询任务状态、依赖图、状态时间线（只读） |
| `annotate` | medium | 处理 Plan 面板批注（插入/删除/替换/评注） |
| `summarize` | light | 重建 `.summary.md` 上下文摘要 |
| `library` | light | 知识库管理（search / list / status / maintain） |

### 状态机

```
draft → planning → review → executing → complete
                 ↗            ↘
          re-planning    ←    blocked
```

8 个状态，经过验证的转换规则。终态：`complete`、`cancelled`。

## 特性

- **项目层级** — `$NB_WORKSPACES_ROOT/<project>/<notebook>/` 两级组织结构
- **14 个技能** — 从 init 到 report 的完整生命周期，加辅助命令
- **领域感知** — 19 个种子类型（software、science:\*、image-processing、video-production、DSP、literary、screenwriting、mechatronics、chip-design 等），支持自动发现和混合类型（`data-pipeline|ml`）
- **知识库** — `.library/.memory/` 存储跨任务经验、外部参考、类型方法论和思维模式
- **Git 集成** — branch-per-task，worktree 隔离实现并行执行，结构化提交信息
- **批注驱动** — 前端 Plan 面板批注处理为计划更新
- **Auto 模式** — 单会话自主编排，支持停滞检测、上下文配额、插件委托
- **六视角审计** — check 从 6 个独立视角评估计划和实施
- **研究情报** — 每个阶段都可独立调用，用于领域知识、需求深化、测试方法论
- **并发保护** — 基于锁文件的互斥，6 级锁优先级排序，过期锁恢复

## 安装

```bash
# 从市场安装
claude plugin add huacheng/moonview
```

## 快速开始

```bash
# 1. 在项目下初始化笔记本
/moonview:ai-cli-task init my-project auth-refactor --title "重构认证为 JWT"

# 2. 在 .target.md 中编写需求，然后让 research 深化
/moonview:research my-project/auth-refactor --caller target

# 3. 生成计划
/moonview:plan auth-refactor --generate

# 4. 验证 → 审查计划质量
/moonview:verify auth-refactor
/moonview:check auth-refactor --checkpoint post-plan

# 5. 执行计划
/moonview:exec auth-refactor

# 6. 合并到 main + 生成报告
/moonview:merge auth-refactor
/moonview:report auth-refactor

# 或者自动运行完整生命周期：
/moonview:auto auth-refactor --start
```

## 目录结构

```
$NB_WORKSPACES_ROOT/
│
├── .library/                          # 共享知识库
│   ├── .changelog                     # 追加写入日志
│   ├── .master-index.md               # 所有库文件扁平索引
│   ├── .type-registry.md              # 类型注册表（种子 + 自动扩展）
│   └── .memory/                       # 系统管理知识库
│       ├── .type-profiles/            # 共享领域方法论
│       ├── .experiences/              # 跨任务经验（按类型分类）
│       ├── .references/               # 外部参考资料（版本化）
│       └── .thinking/                 # Thinking CoT 原始记录 + 蒸馏模式
│
├── project-a/
│   ├── .index.json                    # 项目元数据
│   ├── notebook-1/
│   │   └── .working/                  # 任务状态文件（系统管理）
│   │       ├── .index.json            # 任务元数据（status/phase/type）
│   │       ├── .target.md             # 需求目标（人工编写）
│   │       ├── .plan.md               # 实施计划
│   │       ├── .type-profile.md       # 领域方法论（任务级）
│   │       ├── .summary.md            # 压缩上下文摘要
│   │       ├── .analysis/             # check 评估历史
│   │       ├── .test/                 # 测试准则与结果
│   │       ├── .bugfix/               # 问题修复历史
│   │       └── .notes/                # 研究笔记与执行日志
│   └── notebook-2/
│       └── ...
│
└── project-b/
    └── ...
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` | 所有项目和笔记本的根目录 |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` | 共享知识库目录 |

## 相关项目

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — Claude Code 网页界面，包含 Plan 批注面板和 Chat 编辑器

## 许可证

MIT
