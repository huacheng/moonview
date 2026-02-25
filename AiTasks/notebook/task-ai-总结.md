# task-ai 项目总结

> 版本: v0.6.0 | 日期: 2026-02-24

## 一、概述

task-ai 是一套**纯 Markdown 指令驱动**的任务生命周期管理框架，作为 Claude Code 插件运行。通过 14 个子命令（skills）管理从任务初始化到完成报告的完整生命周期，支持领域自适应验证、跨任务知识复用和自主执行。

**入口命令**: `/moonview:task-ai <subcommand> [args]`

---

## 二、14 个子命令

### 核心生命周期（按执行顺序）

| 子命令 | 模型层级 | 可委派 | 职责 |
|--------|---------|--------|------|
| `init` | light | 是 | 初始化 notebook 工作目录、git 分支、可选 worktree |
| `research` | medium | 是 | 情报收集——目标深化、领域参考、类型发现（任意阶段可独立调用） |
| `plan` | heavy | 否 | 从 `.target.md` 生成实施计划 `.plan.md` |
| `verify` | medium | 是 | 运行领域适配测试，生成结果文件 |
| `check` | heavy | 否 | 计划/执行评审（post-plan / mid-exec / post-exec 三个检查点） |
| `exec` | heavy | 否 | 按计划逐步执行实施 |
| `merge` | medium | 否 | 合并任务分支到 main，处理冲突 |
| `report` | medium | 是 | 生成完成报告，蒸馏经验到 library |

### 辅助命令（随时可用）

| 子命令 | 模型层级 | 可委派 | 职责 |
|--------|---------|--------|------|
| `auto` | heavy | — | 自主执行循环（单会话编排，通过 `.auto-signal` 路由） |
| `cancel` | light | 是 | 取消任务，清理状态 |
| `list` | light | 是 | 只读查询任务状态和依赖关系 |
| `annotate` | medium | 否 | 处理 Plan 面板的插入/删除/替换/评论批注 |
| `summarize` | light | 是 | 重新生成 `.summary.md` 压缩上下文 |
| `library` | light | 是 | 知识库管理（search/list/status/maintain） |

### 典型生命周期流

```
init → research(target) → plan → research(test) → verify → check → exec → merge → report
            ↑                ↑         ↑              ↑       ↑       ↑
            └──────────────── research 可在任意阶段独立调用 ─────────────────────┘
```

---

## 三、状态机（8 状态 20 转换）

### 状态定义

| 状态 | 含义 |
|------|------|
| `draft` | 初始态，任务目标已定义 |
| `planning` | 正在生成/修订实施计划 |
| `review` | 计划已通过 check 评审，等待执行 |
| `executing` | 正在逐步实施 |
| `re-planning` | 执行中发现需要修订计划 |
| `blocked` | 被依赖项或问题阻塞 |
| **`complete`** | 终态——完成并合并 |
| **`cancelled`** | 终态——已取消 |

### 状态转换图

```
                         ┌───────────────────────────────────────┐
                         │            cancel (任意非终态)          │
                         ▼                                       │
                    ┌──────────┐                                 │
                    │cancelled │ (终态)                           │
                    └──────────┘                                 │
                                                                 │
    ┌─────────┐  plan/annotate   ┌──────────┐  check PASS   ┌──────┐
    │  draft  │ ───────────────→ │ planning │ ────────────→ │review│
    └─────────┘                  └──────────┘               └──────┘
                                   │  ↑  │                    │  │
                            plan   │  │  │ check              │  │ plan/
                          (self)───┘  │  │ BLOCKED            │  │ annotate
                                      │  ▼                    │  │
                               plan   │ ┌─────────┐          │  │
                                 ┌────┘ │ blocked  │──plan──→ │  │
                                 │      └─────────┘          │  │
                                 │        ▲                   │  ▼
                                 │        │ check         ┌────────────┐
                                 │        │ BLOCKED       │re-planning │
                                 │        │               └────────────┘
                                 │        │  check PASS ↗    ↑  │
                                 │        │                plan  │
                                 │        │              (self)──┘
                                 │        │ check REPLAN      │
                                 ▼        │                   │
                           ┌──────────────┴──┐                │
                  exec ──→ │   executing     │────────────────┘
                           └─────────────────┘
                                  │
                                merge
                                  ▼
                           ┌──────────┐
                           │ complete │ (终态)
                           └──────────┘
```

### 完整转换表（20 条）

| # | 源状态 | 目标状态 | 触发 | 备注 |
|---|--------|----------|------|------|
| 1 | draft | planning | plan | |
| 2 | draft | planning | annotate | |
| 3 | draft | cancelled | cancel | |
| 4 | planning | planning | plan | self-loop: 修订 |
| 5 | planning | review | check PASS | |
| 6 | planning | blocked | check BLOCKED | |
| 7 | planning | cancelled | cancel | |
| 8 | review | executing | exec | |
| 9 | review | re-planning | plan | |
| 10 | review | cancelled | cancel | |
| 11 | executing | re-planning | check REPLAN | |
| 12 | executing | blocked | check BLOCKED | |
| 13 | executing | complete | merge | |
| 14 | executing | cancelled | cancel | |
| 15 | re-planning | re-planning | plan | self-loop: 进一步修订 |
| 16 | re-planning | review | check PASS | |
| 17 | re-planning | blocked | check BLOCKED | |
| 18 | re-planning | cancelled | cancel | |
| 19 | blocked | planning | plan | |
| 20 | blocked | cancelled | cancel | |

### 关键设计约束

1. **必过 review 门禁**: `exec` 只能从 `review` 进入，不可跳过 `check`
2. **必过 ACCEPT 门禁**: `merge` 要求 `check post-exec` 返回 ACCEPT
3. **re-planning 必须重新评审**: 从 `re-planning` 回 `review` 必须经过 `check PASS`
4. **cancel 全局可达**: 所有非终态都可 `cancel` → `cancelled`
5. **无死锁**: 每个非终态至少有 1 条出边
6. **终态无出边**: `complete` 和 `cancelled` 不接受任何状态变更命令

### phase 子状态（仅 re-planning 使用）

| phase 值 | 设置者 | 含义 |
|----------|--------|------|
| `needs-plan` | check REPLAN | 需要重新生成计划 |
| `needs-check` | plan（在 re-planning 态完成后） | 计划已重生成，需要重新评审 |

---

## 四、目录结构

### 路径变量

| 变量 | 含义 | 示例 |
|------|------|------|
| `NB_WORKSPACES_ROOT` | 环境变量，工作区根目录 | `/home/user/nb-workspaces` |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` | 共享知识库 |
| `NB_TASK_WORKING` | `$NB_WORKSPACES_ROOT/<project>/<notebook>/.working/` | notebook 级工作目录（内部计算） |
| `NB_PROJECT_DELIVERABLES` | `$NB_WORKSPACES_ROOT/<project>/.deliverables/` | project 级交付物目录（内部计算） |

`NB_TASK_WORKING` 和 `NB_PROJECT_DELIVERABLES` 不是环境变量，而是子命令在接收 `<project>/<notebook>` 参数后内部计算的路径。

### 核心目录树

```
$NB_WORKSPACES_ROOT/
│
├── .library/                           # 跨任务共享知识库
│   ├── .changelog                      # 追加写入日志（gitignore）
│   ├── .master-index.md                # 所有库文件扁平索引
│   ├── .type-registry.md               # 任务类型注册表
│   └── .memory/                        # 系统知识库
│       ├── .type-profiles/             # 共享域方法论
│       ├── .experiences/               # 跨任务经验（按 type 分类）
│       ├── .references/                # 外部参考资料（版本化）
│       └── .thinking/                  # CoT 记录 + 蒸馏模式
│           ├── raw/                    # L0 原始记录（gitignore）
│           └── patterns/               # L1 蒸馏模式（git 追踪）
│
├── <project>/
│   ├── .index.json                     # 项目元数据
│   ├── .deliverables/                  # project 级交付物目录（所有 notebook 共享）
│   │   └── <notebook>/
│   │       └── .report.md             # 完成报告
│   └── <notebook>/
│       └── .working/                   # 任务状态文件（$NB_TASK_WORKING）
│           ├── .index.json             # 任务元数据（status/phase/type...）
│           ├── .target.md              # 需求目标（人工编写）
│           ├── .plan.md                # 实施计划（plan 生成）
│           ├── .type-profile.md        # 任务级域方法论
│           ├── .summary.md             # 压缩上下文摘要
│           ├── .auto-signal            # 自动循环进度信号（临时，gitignore）
│           ├── .analysis/              # check 评估历史
│           ├── .test/                  # 测试标准与结果
│           │   ├── <date>-vh-stubs.*           # VH stub 文件
│           │   ├── <date>-vh-baseline.md       # VH 初始失败记录
│           │   ├── <date>-cumulative-green.jsonl  # CGG 累积快照
│           │   └── <date>-hil-snapshots/       # HIL 审批快照
│           ├── .bugfix/                # 执行期间 bug 修复记录
│           └── .notes/                 # 研究笔记与执行日志
```

### .index.json 核心字段

```json
{
  "title": "任务标题",
  "type": "software|data-pipeline|ml|...",
  "status": "draft|planning|review|executing|re-planning|complete|blocked|cancelled",
  "phase": "" | "needs-plan" | "needs-check",
  "completed_steps": 0,
  "depends_on": ["module-name"],
  "branch": "task/notebook-name"
}
```

---

## 五、.auto-signal 信号协议

### 信号格式

```json
{
  "step": "exec",
  "result": "(done)",
  "next": "verify",
  "checkpoint": "post-exec",
  "iteration": 3,
  "compaction_count": 0,
  "vfp_cycles_completed": 5,
  "timestamp": "2026-02-24T12:00:00Z"
}
```

### 信号白名单

| 字段 | 允许值 |
|------|--------|
| `step` | plan, check, exec, merge, report, research, verify, annotate |
| `result` | PASS, NEEDS_REVISION, ACCEPT, NEEDS_FIX, REPLAN, BLOCKED, CONTINUE, (generated), (done), (mid-exec), (step-N), (blocked), (hil-pending), (collected), (sufficient), (o1-collected), (o2-collected), (o3-collected), (objective-complete), (pass), (fail), (partial), (processed), success, conflict, rejected |
| `next` | plan, check, exec, merge, report, research, verify, annotate, (stop) |
| `checkpoint` | (空), post-plan, post-research, post-o1/o2/o3, mid-exec, post-exec, quick, full, step-N, regression, dependency-blocked, no-accept |

### auto 路由表（核心路径）

| 当前 step | result | 路由 next | 状态变化 |
|-----------|--------|-----------|----------|
| plan | (generated) | verify | planning |
| verify | (pass) | check | — |
| check post-plan | PASS | exec | → review |
| check post-plan | NEEDS_REVISION | plan | = planning |
| exec | (done) | verify | — |
| check post-exec | ACCEPT | merge | — |
| check post-exec | NEEDS_FIX | exec | = executing |
| check post-exec | REPLAN | plan | → re-planning |
| merge | success | report | → complete |
| report | (done) | (stop) | = complete |

### result 值命名约定

| 格式 | 使用者 | 示例 |
|------|--------|------|
| `UPPERCASE` | check（判断类） | PASS, ACCEPT, NEEDS_FIX, REPLAN, BLOCKED |
| `(lowercase)` | plan, exec, verify, research, report, annotate | (generated), (done), (pass), (collected) |
| `lowercase` | merge（git 操作） | success, conflict, rejected |

---

## 六、模型路由

auto 模式根据子命令的认知需求选择不同模型层级，并可通过 Task subagent 委派轻量任务：

| 层级 | 模型映射 | 认知特征 |
|------|---------|---------|
| heavy | opus | 架构推理、代码生成、深度评估 |
| medium | sonnet | 结构化流程、搜索收集、冲突解决 |
| light | haiku | 机械操作、只读查询、简单状态变更 |

**委派规则**: `auto_delegatable: true` 的子命令可被 auto 循环通过 Task subagent 委派给对应层级模型。委派通过文件通信（不依赖会话记忆），失败时回退到内联执行。

---

## 七、并发控制

### 锁机制

- 所有锁使用 `O_CREAT | O_EXCL` 原子创建
- 锁文件内容: `{ pid, session, timestamp }`
- 过期锁恢复: rename → `.lock.stale.<pid>`（原子），然后重试

### 锁顺序（防死锁，6 级优先级）

| 优先级 | 锁 | 持有者 |
|--------|-----|--------|
| 1 (最先) | `.working/.lock` | plan, exec, check, merge, research, annotate, cancel |
| 2 | `.type-profiles/.lock` | research, report |
| 3 | `.experiences/.lock` | report, exec, verify, check |
| 4 | `.references/.lock` | research, exec, check |
| 5 | `.thinking/patterns/.lock` | report |
| 6 (最后) | `.changelog.lock` | 任何库写入者（极短持有） |

**规则**: 严格按升序获取、降序释放。不可持有低优先级锁时尝试获取高优先级锁。

---

## 八、类型系统

### 已知类型（14 种 seed-type）

software, data-pipeline, ml, science, infrastructure, mechatronics, chip-design, dsp, image-processing, video-production, literary, documentation, ai-skill, screenwriting

### 类型特征

- research 阶段自动发现，支持混合类型（管道分隔，如 `data-pipeline|ml`）
- 每种类型有 Phase Intelligence 文件（`init/references/seed-types/<type>.md`），定义 plan/verify/check/exec 的领域适配方法论
- 共享类型方法论存储在 `.library/.memory/.type-profiles/<type>.md`

---

## 九、Git 集成

| 约定 | 格式 |
|------|------|
| 分支名 | `task/<notebook-name>` |
| 提交格式 | `task-ai(<module>):<type> <description>` |
| Worktree | `.worktrees/task-<notebook-name>` |

**提交类型**: init, plan, check, research, verify, annotate, summarize, exec, feat, fix, refactor, merge, report, cancel, maintain

---

## 十、框架文件统计

| 分类 | 数量 |
|------|------|
| 根文件 | 3（plugin.json, marketplace.json, REFERENCE-INDEX.md） |
| 入口 + 共享引用 | 14（commands/ 下 1 + 13，含 verification-first-protocol.md） |
| SKILL.md | 14（每子命令一个） |
| 技能引用文件 | 24（分布在各 skills/*/references/） |
| **总计** | **55 个 .md 文件** |

### 插件目录结构

```
task-ai/
├── plugin.json
├── marketplace.json
├── REFERENCE-INDEX.md
├── commands/
│   ├── task-ai.md                  # 入口
│   └── references/                 # 13 个共享引用
│       ├── annotation-format.md
│       ├── changelog-consumption-protocol.md
│       ├── concurrency.md
│       ├── depends-on-format.md
│       ├── directory-convention.md
│       ├── git-details.md
│       ├── library-write-protocol.md
│       ├── lifecycle-hooks.md
│       ├── model-routing.md
│       ├── state-matrix.md
│       ├── summary-formats.md
│       ├── type-field.md
│       └── verification-first-protocol.md  # VFP v1.0 权威协议
├── skills/                         # 14 个子命令
│   ├── init/    (+ 14 seed-type 引用)
│   ├── research/
│   ├── plan/    (+ type-profiling 引用)
│   ├── verify/
│   ├── check/   (+ six-perspective-audit 引用)
│   ├── exec/
│   ├── merge/
│   ├── report/
│   ├── auto/    (+ 4 个引用: backend-api, context-quota, plugin-delegation, stall-detection)
│   ├── cancel/
│   ├── list/
│   ├── annotate/ (+ annotation-processing 引用)
│   ├── summarize/
│   └── library/  (+ 4 个引用: blocked-sources, injection-rules, quality-rubric, write-protocol)
└── .dev/                           # 框架自测基础设施
    ├── validate.sh                 # 入口（--level/--json/--regression/--snapshot/--self-check）
    ├── contracts/                  # 18 个契约脚本 + 2 个公共库
    │   ├── lib.sh / lib.py
    │   ├── L1 ×7 (静态结构)
    │   ├── L2 ×7 (语义一致)
    │   ├── L3 ×3 (集成契约)
    │   └── Meta ×1 (self-check)
    └── fixtures/                   # 5 个 fixture + 3 个 baseline 快照
        ├── expected-states.json    # 8 状态 20 转换
        ├── expected-signals.json   # 信号白名单
        ├── expected-artifacts.json # 数据流契约
        ├── phase-expectations.json # Phase 边界预期
        ├── terminology-blocklist.txt
        ├── phase0-baseline.jsonl   # Red baseline (508/65/37)
        ├── phase1-baseline.jsonl   # 协议抽取后 (530/48/37)
        ├── phase2-baseline.jsonl   # 术语迁移后 (555/0/37)
        └── phase3-baseline.jsonl   # 领域泛化后 (558/0/35)
```

---

## 十一、VFP 重构

已从 TDD 纪律升级为 **Verification-First Protocol (VFP)**，详见 `task-ai-重构方案.md`。

### 重构 4 层

| 层面 | 核心产出 | 状态 |
|------|---------|------|
| VFP 协议 | `verification-first-protocol.md` — 唯一权威验证规则源 | 已完成 |
| CGG 回归防护 | Cumulative Green Gate — 数据流 + 协议定义 | 已完成 |
| HIL 人工验证 | Human-in-the-Loop — 嵌入 exec 流程，复用 auto 信号暂停 | 已完成 |
| 框架自测 | `.dev/validate.sh` — bash+python 三层契约测试 | 全绿运行 |

### 完成进度

| Phase | 内容 | PASS | FAIL | WARN | 状态 |
|-------|------|------|------|------|------|
| Phase 0 | 基础设施 + Red baseline | 508 | 65 | 37 | 已完成 |
| Phase 1 | 协议抽取 + 目录/锁/索引更新 | 530 | 48 | 37 | 已完成 |
| Bug fix | init step-numbering + git `maintain` type | 534 | 44 | 37 | 已完成 |
| Phase 2 | TDD→VFP 术语全面迁移 + 数据流闭合 + P0/P1 seed-type VC 节 | 555 | 0 | 37 | 已完成 |
| Phase 3 | P2 seed-type VC + research VFP 感知 + plugin-delegation 拆分 | 558 | 0 | 35 | 已完成 |
| Phase 4 | 全量验证 + 进度文档更新 | **558** | **0** | **35** | **已完成** |

### 当前验证结果

```
L1（静态结构）: 305 PASS, 0 FAIL, 12 WARN — 全部通过
L2（语义一致）: 109 PASS, 0 FAIL,  9 WARN — 全部通过（P2 seed-type 新增 2 PASS）
L3（集成契约）:  53 PASS, 0 FAIL, 14 WARN — 全部通过
Meta（自检）:    91 PASS, 0 FAIL,  0 WARN — 全覆盖

总计: 558 PASS, 0 FAIL, 35 WARN — 全部 Phase 完成，0 回归
```

### 已完成的关键改动

| 改动类型 | 文件数 | 内容 |
|----------|--------|------|
| 新建协议文件 | 1 | `verification-first-protocol.md` (VFP v1.0) |
| 参考文件更新 | 3 | directory-convention + concurrency + REFERENCE-INDEX |
| SKILL.md 术语迁移 | 5 | auto/check/exec/plan/verify (11 类旧术语→VFP) |
| 数据流修复 | 4 | auto/check/exec/verify (9 条 VFP artifact 产消闭合) |
| seed-type VC 节 | 5 | software/data-pipeline/ml (P0-P1) + documentation/infrastructure (P2) |
| research VFP 感知 | 1 | research/SKILL.md step 10d/10g 增加 VC 收集 |
| plugin-delegation 拆分 | 1 | `tdd` → `vh-generation` + `vh-verification`，泛化触发条件 |
| bug 修复 | 2 | init step-numbering + git-details maintain type |
| 自测基础设施 | 25+ | `.dev/` 全部文件 + 4 个 baseline 快照 |

### 35 WARN 分类

| 类别 | 数量 | 说明 |
|------|------|------|
| step-numbering: 无编号步骤 | 2 | auto/library 设计上不用编号步骤 |
| state-matrix: 非标准表格 | 8 | 8 个 SKILL 用 code block 描述转换 |
| git-commit: 无 commit type | 2 | auto 继承子命令 / list 只读 |
| seed-completeness: 缺 VC 节 | 9 | P3 类型按需补充 |
| protocol-compliance: 无 § 引用 | 1 | 可选：SKILL.md 可添加 `§` 协议节引用 |
| signal-routing: 无显式路由 | 13 | 上下文路由，不适合硬编码 |
