# task-ai 重构方案：Verification-First Protocol 全栈升级

> 文档版本: v1.1 | 日期: 2026-02-24
> 状态: **实施完成** — Phase 0-4 全部完成 (558 PASS, 0 FAIL, 35 WARN)

---

## 一、背景与目标

task-ai 是一套纯 Markdown 指令驱动的 14 子命令框架（56 个 .md 文件），通过 SKILL.md 定义各子命令的执行步骤、状态转换和信号协议。已完成 TDD 纪律集成（commit `8a4322a`），在 plan/exec/verify/check/auto 5 个 SKILL.md 中增加了 Red/Green/Refactor 验证步骤。

### 重构目标

将 Red/Green TDD 思想泛化为 **Verification-First Protocol (VFP)**，从四个层面系统升级框架：

| 层面 | 解决什么 | 核心产出 |
|------|---------|---------|
| **VFP 协议** | TDD 逻辑散落 5 个文件，无权威定义 | `verification-first-protocol.md` — 唯一权威规则源 |
| **CGG 回归防护** | 渐进式实现中无法检测已通过步骤的回归 | Cumulative Green Gate — 单调绿进保证 |
| **HIL 人工验证** | 主观质量（视觉/体验/叙事）无验证框架，且 CGG 会导致人工 O(N²) | Human-in-the-Loop — 嵌入 exec 已有流程，复用 auto 信号暂停 |
| **框架自测** | 56 个 .md 文件的隐式契约无法被验证 | `.dev/validate.sh` — bash+python 三层契约测试 |

### 升级策略

**硬升级**，不考虑向后兼容。老任务模块需重新走 plan 流程。

### 路径变量

| 变量 | 解析规则 | 示例值 |
|------|---------|--------|
| `NB_WORKSPACES_ROOT` | 环境变量，全局唯一 | `/home/user/nb-workspaces` |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` | `/home/user/nb-workspaces/.library` |
| `NB_TASK_WORKING` | `$NB_WORKSPACES_ROOT/<project>/<notebook>/.working/` — notebook 级别，每个 notebook 不同 | `project-a/auth-refactor/.working/` |
| `NB_PROJECT_DELIVERABLES` | `$NB_WORKSPACES_ROOT/<project>/.deliverables/` — project 级别，同项目不同 notebook 共享 | `project-a/.deliverables/` |

`NB_TASK_WORKING` 和 `NB_PROJECT_DELIVERABLES` 不是环境变量，而是子命令在接收 `<project>` 和 `<notebook>` 参数后内部计算的路径。每个 notebook 的工作目录独立，但同一 project 下的所有 notebook 共享同一个交付物目录。

> **注意**：当前框架中 deliverables 在 notebook 级别（`<notebook>/[deliverables-dir]/`），此次重构将其上移至 project 级别（`<project>/.deliverables/`），所有 notebook 的交付产出按 notebook 名分子目录存放。

### 核心概念速览

| 概念 | 旧名 | 含义 |
|------|------|------|
| Verification Hypothesis (VH) | Red stub | 预期失败的验证条件，在实现前定义 |
| Hypothesis Satisfied (HS) | Green | 验证条件通过 |
| Cumulative Green Gate (CGG) | — | 每步 HS 后，重新验证所有已通过 VH 仍然成立 |
| Consolidation | Refactor | 通过后的代码/产物整理 |
| VH Baseline | Red baseline | 所有 VH 的初始失败状态记录 |
| Approval Snapshot | — | 人工通过 HIL-VH 时记录的产物参照状态 |
| CGG Proxy | — | 用产物 diff 替代人工判断的 CGG 回归检测 |
| VFP Cycle | TDD cycle | 一次完整的 VH → HS → CGG → Consolidation |

---

## 二、问题清单

> 按六维归属分组（正确性 / 安全性 / 可靠性 / 性能 / 架构 / 可维护性）。每个问题标注解决方案所在章节。

### 正确性

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P10 | 非 software 类型的 VH 不可"运行"（exit code 判定），需领域专属转换方法 | 高 | §3.1 VH 三种验证模式 |
| P7 | plugin `tdd` 槽触发条件假设测试已存在，无法覆盖 Red-phase 委派 | 中 | §3.4.3 plugin-delegation 拆分 |
| P17 | 公共库 `parse_md_table()` 不处理 backtick code span 内的 pipe | 高 | §3.6.2 `split_table_row()` |
| P19 | `expected-states.json` 缺少 7 条转换（5 cancel + 2 self-loop） | 高 | 附录 B fixtures 已修正 |
| P21 | plugin-delegation.md Integration Summary 表仍引用旧 `tdd` 槽 | 中 | §4 Phase 3.5 |
| P23 | auto/references/ 引用 `.auto-signal` 旧字段名 `tdd_cycles_completed` | 中 | §4 Phase 2.6 |
| P25 | 需要人工判断的 VH（视觉/体验/主观质量）无验证模式 | 高 | §3.3 HIL |

### 安全性

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P5 | `concurrency.md` 未覆盖 VFP 多步操作的锁协议；VH stub 可能含注入内容 | 中 | §3.1 净化规则 + §4 Phase 1.3 |
| P13 | validate.sh bash 解析 markdown 时 shell 元字符可能导致意外执行 | 中 | §3.6.2 `safe_read()` + `--fix --confirm` |

### 可靠性

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P11 | VH stub 生成失败无降级路径，plan 流程卡死 | 高 | §3.1 VH Generation Fallback |
| P12 | 测试 runner 崩溃 vs 测试失败未区分，误判为 Red | 高 | §3.1 Three-State Exit Code |
| P24 | 渐进式 Red→Green 无法区分"预期 Red"与"回归引入新 Red" | 高 | §3.2 CGG |
| P26 | CGG 对人工 VH 的回归检测会导致 O(N²) 人工工作量 | 高 | §3.3 CGG Proxy |

### 性能

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P14 | protocol + VC 节 ≈ 额外 300 行上下文，auto 长运行加速 compaction | 中 | §3.1 协议控制 150 行内 |

### 架构

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P1 | TDD 逻辑散落 5 个 SKILL.md 中，无单一权威定义 | 高 | §3.1 VFP 协议 |
| P2 | Red/Green 仅限 software 类型，其他类型无验证先行纪律 | 高 | §3.1 Applicability + §3.4 领域适配 |
| P4 | `directory-convention.md` 未记载 VFP 新增文件模式 | 中 | §4 Phase 1.2 |
| P6 | `research` 子命令无 VFP 感知，不收集 Verification Cycle 方法论 | 中 | §3.4.2 research VFP 感知 |
| P8 | `software.md` seed-type 无 TDD 方法论 | 中 | §3.4.1 seed-type VC 节 |
| P15 | 验证器自身无人验证，新增文件无对应契约时无检测 | 中 | §3.6.1 `--self-check` |
| P27 | deliverables 在 notebook 级别，缺少 project 级共享交付物目录；工作目录和交付物目录无变量名 | 中 | §1 路径变量 + §4 Phase 1.2 |

### 可维护性

| # | 问题 | 严重度 | 解决方案 |
|---|------|--------|---------|
| P3 | 框架本身（56 个 .md 文件）无法被测试验证 | 高 | §3.6 框架自测 |
| P9 | 术语不统一：5 个文件用不同名称指代同一概念 | 低 | §3.1 Terminology 表 + §3.6 terminology.sh |
| P16 | 双文件编辑模式（SKILL.md + protocol）增加认知负担 | 中 | §3.5 改造原则：SKILL.md 保留执行指令 |
| P18 | 公共库缺少 `strip_code_blocks()` 共享函数 | 中 | §3.6.2 公共库 |
| P20 | 缺少 5 个契约脚本 | 中 | §3.6.3 契约脚本清单 |
| P22 | SKILL.md `## Git` 节 commit message 含旧术语 | 低 | §4 Phase 2.1 |

---

## 三、设计方案

### 3.1 VFP 协议：`commands/references/verification-first-protocol.md`

**定位**：唯一权威的验证先行纪律定义。所有 SKILL.md 引用此文件而非内嵌规则。protocol 控制在 150 行内，示例移至 seed-type。

#### Applicability

- 当 `.type-profile.md` 包含 `## Verification Cycle` 节时，VFP 适用
- 缺少该节 → VFP 不适用，退回标准验证流程
- `software` 类型始终适用（seed-type 保证 Verification Cycle 存在）

#### VH 验证模式

| 模式 | 判定方式 | 适用类型 |
|------|----------|----------|
| **executable** | 运行命令 → exit code 判定 | software, data-pipeline, infrastructure |
| **inspectable** | Claude 读取产物 → 按验收标准判定 | documentation, ml, dsp |
| **human** | 人工判断产物质量 → approve/reject。CGG 由 Proxy 替代人工 | literary, screenwriting, image-processing, video-production |

seed-type 声明 `mode: executable`、`mode: inspectable` 或 `mode: mixed`（mixed = 部分 auto + 部分 human，通过 `human_vhs` 列表标注）。

#### Three-State Exit Code Protocol（executable 模式）

| Exit Code | 含义 | 处理 |
|-----------|------|------|
| 0 | HS satisfied (Green) | 记录通过，进入 CGG → Consolidation |
| 1 | VH unsatisfied (Red) | 正常 Red（实现前），或 NEEDS_FIX（实现后） |
| >1 / signal / timeout | Infrastructure failure | `INFRA_ERROR`，重试一次，仍失败 → signal `(mid-exec)` |

#### VH Generation Rules

1. 每个 plan step 的验证点 → 至少 1 个 VH stub
2. Stub 必须包含：描述、断言占位、失败标记 `// VH: not implemented`
3. 语言/框架由 type-profile 或项目约定决定
4. Stub 内容必须经过 `injection-rules.md` 九类净化
5. 生成后运行/验证一次，确认全部失败 → 写入 baseline

#### VH Generation Fallback

当 VH 生成失败（语言不支持、无测试框架、编译错误）时：
1. 写 `.test/<date>-vh-baseline.md`，标记 `generation_failed: true` + 原因
2. plan 正常继续，baseline 记录 VH total = 0
3. exec 跳过 VH/HS 确认步骤
4. check 评级为 N/A（非 Low）

#### VH→HS Transition Rules

1. 实现前运行 step-specific VH → 期望全部失败（VH 确认）
2. 意外通过 → 记录警告，不阻塞
3. 实现后运行同一组 VH → 期望全部通过（HS 确认）
4. 仍失败 → 标记 NEEDS_FIX，记录详情
5. 全部通过 → 进入 CGG → Consolidation

#### Data Flow Contract

> 以下路径均相对于 `$NB_TASK_WORKING`（= `<project>/<notebook>/.working/`）。交付物写入 `$NB_PROJECT_DELIVERABLES/<notebook>/`。

| 阶段 | 产出 | 消费方 |
|------|------|--------|
| plan (step 18) | `.test/<date>-vh-stubs.*` | exec, verify, check |
| plan (step 18) | `.test/<date>-vh-baseline.md` | exec, verify, check, auto |
| plan (step 18) | `.plan.md` 中 `[VH: ...]` 标注 | exec |
| exec (per-step) | `.test/<date>-cumulative-green.jsonl`（CGG 快照） | exec, check, auto |
| exec (per-step) | `.test/<date>-hil-snapshots/`（HIL 审批快照） | exec (CGG Proxy), check |
| exec (per-step) | `.notes/` 中 VFP Cycle Summary | check, auto |
| verify | `.test/<date>-<checkpoint>-results.md` 中 VFP Metrics 节 | check |
| check (post-exec) | `.analysis/` 中 VFP Compliance 节 | report |
| auto | `.auto-signal` 中 `vfp_cycles_completed` | daemon |
| report | `$NB_PROJECT_DELIVERABLES/<notebook>/.report.md` | 用户 |

#### VFP Metrics Specification

verify 结果文件中的度量节格式：

```
- VH total: N
- Satisfied (passing): M
- Unsatisfied (failing): N - M
- VFP cycle count: K
- CGG pass count: G
- Regressions detected: R
- Coverage: X% (or N/A)
- VFP compliance: (K / total_steps)%
- HIL-VH total: H
- HIL approved: A
- HIL proxy pass: P
- HIL re-review: Δ
- HIL fallback: F
```

#### Compliance Scoring

| 等级 | 条件 | 影响 |
|------|------|------|
| Full | cycles ≥ threshold && baseline exists && no skipped VH | 无惩罚 |
| Partial | (threshold/2)–(threshold-1)% cycles OR baseline generation_failed OR HIL fallback | 记录，不阻塞 |
| Low | < (threshold/2)% cycles | 降级为 NEEDS_FIX |
| N/A | 无 Verification Cycle 节 OR generation_failed | 跳过 VFP 审查 |

threshold 默认 80%，seed-type 的 Verification Cycle 节可覆盖。

#### Consolidation Rules

1. 检查明显重构机会（重复、命名、死代码）
2. 重构后运行全量测试（CGG 范围 + 当前 VH）确认不回退
3. 无重构机会时跳过

#### Domain-Specific VH Mapping

| Type | Mode | VH (Red) | HS (Green) | HIL 场景 |
|------|------|----------|------------|----------|
| software | executable | 单元测试失败 | 单元测试通过 | — |
| documentation | inspectable | 章节标记 TODO/DRAFT | 章节通过审查标准 | — |
| data-pipeline | executable | Schema 验证/数据质量不通过 | 端到端质量门通过 | — |
| image-processing | mixed | SSIM/PSNR < 阈值 | 指标 ≥ 阈值 | 美学判断（human） |
| literary | mixed | 章节标记 DRAFT | 内容完成 | 叙事质量、文风（human） |
| screenwriting | mixed | 场景标记 OUTLINE | 场景完成 | 对话自然度（human） |
| video-production | mixed | 帧差异/音画不同步 | 技术指标达标 | 色彩美感（human） |
| ml | inspectable | 模型指标 < baseline | 指标 ≥ 阈值 | — |
| dsp | executable | SNR < 阈值 | SNR ≥ 阈值 | — |
| infrastructure | executable | 验证脚本失败 | 验证脚本通过 | — |

### 3.2 CGG：Cumulative Green Gate

**核心规则**：已通过的 VH 永远不允许再失败（Monotonic Green）。

#### 触发时机

每步 HS 确认（Green）后、Consolidation 之前。验证范围：step-1 到 step-(N-1) 所有已通过的 VH。

#### 三种模式

| 模式 | CGG 验证方法 |
|------|-------------|
| **executable** | 运行累积测试套件（step-1..N-1 的全部 VH 测试命令） |
| **inspectable** | Claude 重新审查之前各步验收条件，仅检查产物有变更的步骤（git diff 优化） |
| **human proxy** | 与 Approval Snapshot 比对（产物 diff），无实质变化 → auto-pass，有变化 → 标记待复审 |

#### 结果处理

| 结果 | 处理 |
|------|------|
| 全部通过 | 写快照 → 进入 Consolidation |
| 有回归 | 标记 `REGRESSION`，尝试修复（不超过 1 次）→ 重跑 CGG。仍失败 → signal `(mid-exec)` |
| INFRA_ERROR | 按 Three-State Exit Code Protocol 处理 |

#### 快照产物

`.test/<date>-cumulative-green.jsonl`（追加模式），每步一行：

```jsonl
{"step":1,"timestamp":"...","passed_vhs":["test-auth-login","test-auth-logout"],"total":2}
{"step":2,"timestamp":"...","passed_vhs":["test-auth-login","test-auth-logout","test-token-refresh"],"total":3}
```

#### CGG 跳过条件

| 条件 | 理由 |
|------|------|
| step = 1 | 无之前步骤可回归 |
| VH baseline `generation_failed: true` | 无 VH 可运行 |
| type-profile 无 Verification Cycle 节 | VFP 不适用 |

### 3.3 HIL：Human-in-the-Loop Verification

**目标**：支持需要人工判断的验证，人工工作量 O(K+Δ)，不随步骤数线性增长。

**设计原则**：HIL 不引入独立的暂停/超时/队列机制，而是**嵌入 exec 已有的 per-step 流程**并**复用 auto 已有的 `(stop)` 信号和 daemon 超时**。

#### HIL 嵌入 exec per-step

HIL-VH 审批不是独立步骤，而是 **exec 步骤 4（HS confirmation）的人工模式变体**：

```
步骤 4 — HS confirmation（三模式统一）:
  ├── executable VH → 运行测试命令 → exit code 判定
  ├── inspectable VH → Claude 读取产物 → 按标准判定
  └── human VH → 呈现产物 → 等待人工 approve/reject
       ├── approve → 记录 Approval Snapshot → 继续
       └── reject → NEEDS_FIX，记录修改意见
```

交互模式 vs auto 模式的行为差异：

| 模式 | human VH 处理 |
|------|--------------|
| **交互模式** | 步骤 4 中直接等待人工判断 |
| **auto 模式** | signal `(hil-pending)` → auto 路由到 `(stop)` → daemon 暂停等人工确认 |

复用已有机制的映射：

| HIL 需求 | 复用的已有机制 |
|----------|---------------|
| 暂停等人工 | auto `(stop)` 信号（同 O1/O2/O3 暂停） |
| 超时 | daemon 全局超时（写 `.auto-stop`） |
| 恢复继续 | exec `completed_steps` + NEEDS_FIX 恢复路径 |

#### Approval Snapshot

人工通过 HIL-VH 时记录的产物参照状态：

| 产物类型 | 快照方式 | 回归检测（CGG Proxy） |
|----------|----------|---------------------|
| 视觉/UI | 截图 (PNG) | SSIM > 阈值（默认 0.95） |
| 文本内容 | 内容哈希 + 全文副本 | 哈希比对 → 变化则 Claude inspectable 判定 |
| 音频/视频 | 采样指纹 + 时长 | 指纹比对 + 时长差异 |

快照存储：`.test/<date>-hil-snapshots/step-<N>-<vh-name>.<ext>`

#### CGG Proxy

CGG Proxy 是 CGG 的 human 模式变体（§3.2），不是独立机制：

- 无实质变化（diff < 阈值）→ auto-pass（人工无感知）
- 有实质变化 → 标记待复审
- 交互模式：立即提示复审
- auto 模式：累积变化项 ≥ 3 → signal `(hil-pending)` → auto `(stop)` → 人工批量审查

**CGG Proxy 只检测变化，不做质量判断**。变化需人工确认是改进还是退化。

#### 工作量保证

| 场景 | 人工次数 | 复杂度 |
|------|---------|--------|
| 无 HIL | 0 | O(0) |
| 有 HIL，无回归 | K（初次验证） | O(K) |
| 有 HIL，有回归 | K + Δ（初次 + 变化复审） | O(K + Δ)，Δ 通常 << K |
| CGG Proxy | 自动化 | O(0) |

#### 降级规则

| 条件 | 降级行为 |
|------|----------|
| daemon 超时 | exec 恢复时未审批 human VH → 降级为 inspectable，标记 `hil_fallback: true` |
| 所有 human VH 降级 | check 时 Compliance 降一级（Full → Partial） |

不引入独立的 HIL 超时计时器。

#### exec 新增信号

| 结果 | 信号 |
|------|------|
| human VH 需审批 | `{ "step": "exec", "result": "(hil-pending)", "next": "(stop)", ... }` |

auto Result-Based Routing 增加：`exec | (hil-pending) | (stop) | — | HIL 审批暂停`

#### Anomaly Detection（auto 模式）

| 异常 | 检测条件 | 动作 |
|------|---------|------|
| VFP 周期缺失 | `completed_steps` 超过 `vfp_cycles_completed` 达 3 步 | 触发 mid-exec check |
| CGG 回归 | `cumulative-green.jsonl` 最新 `total` < 前一行 | 触发 mid-exec check |
| HIL 暂停 | exec 在 `(hil-pending)` 状态 | daemon 全局超时覆盖 |

防循环：异常检测最多触发 1 次 mid-exec check。HIL `(hil-pending)` 是正常暂停，不计入。

### 3.4 领域适配

#### 3.4.1 seed-type 增加 Verification Cycle 节

| 优先级 | 类型 | 原因 |
|--------|------|------|
| P0 | software | 已有 TDD 基础 |
| P1 | data-pipeline, ml | 有明确质量门指标 |
| P2 | documentation, infrastructure | 有清晰完成/未完成状态 |
| P3 | 其余类型 | 按需添加 |

**software.md 示例**：

```markdown
### Verification Cycle
- **mode**: executable
- **VH 形式**: 可执行测试 stub（Jest/Pytest/Vitest 等）
- **VH 生成源**: `.test/<date>-plan-criteria.md` 中的 per-step 验证点
- **HS 判定**: 测试全部通过（exit code 0）
- **Consolidation 关注点**: 代码重复、命名规范、类型安全
- **工具链**: `npm test`, `pytest`, `vitest`, `cargo test`, `go test`
```

**literary.md 示例**（mixed 模式）：

```markdown
### Verification Cycle
- **mode**: mixed
- **auto_vhs**: ["format compliance", "word count", "chapter structure", "spelling/grammar"]
- **human_vhs**: ["narrative coherence", "character consistency", "pacing"]
- **human_proxy**: content-hash
- **HS 判定** (auto): 检查脚本 exit 0
- **HS 判定** (human): 审阅者 approve
- **CGG 代理**: 内容哈希比对 → 变化则 Claude 判定实质变更
- **compliance_threshold**: 60
```

#### 3.4.2 research VFP 感知

research 在 type-profile 更新时收集该领域的"验证假设方法论"，写入 `## Verification Cycle` 节。

#### 3.4.3 plugin-delegation 更新

- `tdd` 槽拆分为 `vh-generation`（plan 阶段）和 `vh-verification`（verify/exec 阶段）
- 保留 `tdd` 作为 `vh-verification` 别名
- 触发条件泛化：`type-profile has Verification Cycle section`（不再硬编码 `software`）
- Integration Summary 表同步更新

### 3.5 SKILL.md 改造

#### 改造原则

- **不删除步骤**，仅将内嵌规则替换为协议引用
- **条件泛化**：`type contains 'software'` → `type-profile has Verification Cycle`
- **术语统一**：所有 `Red`/`Green`/`Refactor`/`TDD` → VFP 术语表
- SKILL.md 保留完整执行指令（what to do），仅将规则定义外引到 protocol

#### 改造矩阵

| 文件 | 当前 | 改为 |
|------|------|------|
| plan step 18 | 内嵌 Red stub 生成规则 | `See protocol § VH Generation Rules` + 保留执行指令 |
| exec per-step 2,4,5 | 内嵌 Red/Green/Refactor，步骤 4 仅 executable | `See protocol § VH→HS Transition Rules`，**步骤 4 扩展为三模式**（executable / inspectable / human） |
| exec per-step **新增 4.5** | 不存在 | `See protocol § CGG`，human VH 用 CGG Proxy |
| verify step 10-11 | 内嵌 TDD metrics | `See protocol § VFP Metrics`（含 CGG + HIL 指标） |
| verify | 无 regression checkpoint | **新增 `--checkpoint regression`** |
| check post-exec | 内嵌 TDD Discipline Audit | `See protocol § Compliance Scoring` + regression-free + HIL fallback 降级 |
| auto | 内嵌 TDD Cycle Tracking | `See protocol § Anomaly Detection` |
| init | deliverables 在 notebook 级 `<notebook>/[dir]/` | 创建 `$NB_PROJECT_DELIVERABLES/<notebook>/`（project 级共享交付物目录） |
| report | `.report.md` 写入 notebook 级 deliverables | 写入 `$NB_PROJECT_DELIVERABLES/<notebook>/.report.md` |
| directory-convention | 无 `NB_TASK_WORKING` / `NB_PROJECT_DELIVERABLES` 变量 | Path Resolution 节引入两个变量，目录树更新 deliverables 位置 |

#### 子命令数据流

```
plan ──[vh-stubs + vh-baseline + plan 标注（含 human/auto VH 分类）]──→ exec
                                                                          │
exec ──[per-step: 步骤 4 HS（三模式）→ 步骤 4.5 CGG（含 proxy）]──→ exec (next step)
  │                                                                       │
  ├──[(hil-pending)]──→ auto (stop) → 人工审批 → exec 恢复               │
  │                                                                       │
  └──[(done) or (mid-exec)]──→ verify ──────────────────────────→ check
                                  │                                   │
                             [VFP Metrics]                       [VFP Compliance]
                                                                      │
check ──[VFP Compliance in analysis]──→ report
auto ──[vfp_cycles_completed in signal]──→ daemon
```

### 3.6 框架自测

**核心问题**：56 个 .md 文件之间存在隐式契约（步骤编号、跨文件引用、状态转换、信号路由、数据流），任何改动都可能悄悄破坏。框架自测把这些隐式契约变为可执行的显式断言。

#### 3.6.1 目录结构与入口

```
task-ai/.dev/                    # 不参与插件运行时
├── validate.sh                  # 入口脚本
├── contracts/                   # 契约脚本
│   ├── lib.sh / lib.py         # 公共库
│   ├── L1: 静态结构 (×7)       # step-numbering, cross-refs, signal-whitelist,
│   │                            # naming-conventions, state-matrix,
│   │                            # frontmatter-validation, git-commit-conventions
│   ├── L2: 语义一致 (×7)       # terminology, data-flow, seed-completeness,
│   │                            # lock-coverage, phase-state-machine,
│   │                            # index-completeness, signal-field-names
│   ├── L3: 集成契约 (×3)       # state-machine-graph, protocol-compliance,
│   │                            # signal-routing
│   └── Meta: self-check (×1)
└── fixtures/                    # 期望值（人工维护）
    ├── expected-states.json     # 20 条状态转换
    ├── expected-signals.json    # 信号白名单
    ├── expected-artifacts.json  # 数据流契约
    ├── phase-expectations.json  # Phase 边界预期
    └── terminology-blocklist.txt
```

**语言选择原则**：简单行级 grep → bash；表格解析 / 图论 / 多文件交叉 → Python（仅 stdlib）。

**validate.sh 参数**：

| 参数 | 功能 |
|------|------|
| `--level 1\|2\|3\|all` | 运行指定层级契约 |
| `--json` | JSONL 格式输出 |
| `--regression <file>` | 与快照比对，检测回归（PASS→FAIL = REGRESSION） |
| `--check-phase <N>` | 验证 Phase N 预期清单 |
| `--snapshot <file>` | `--json` + 写入文件 |
| `--self-check` | 验证器自身覆盖完整性 |
| `--fix --confirm` | 自动修复（需 `--confirm` 才实际写入） |

#### 3.6.2 公共库

**lib.sh** 核心函数：

| 函数 | 功能 |
|------|------|
| `emit_pass/fail/warn` | 格式化输出 `[PASS]`/`[FAIL]`/`[WARN]` |
| `emit_json` | JSON 格式输出（供 `--regression` 消费） |
| `safe_read` | 逐行读取，防止 shell 元字符展开 |
| `strip_code_blocks` | 剥离 markdown 围栏代码块（保留行号对齐） |
| `extract_steps` | 提取 `## Execution Steps` 内编号行（自动剥离 code block） |
| `extract_frontmatter` | 提取 YAML frontmatter |
| `summary` | 汇总统计（FAIL > 255 时截断为 255） |

**lib.py** 核心函数：

| 函数 | 功能 |
|------|------|
| `split_table_row` | 分割 markdown 表格行，正确处理 backtick 内 pipe |
| `parse_md_table` | 解析 markdown 表格为 `list[dict]` |
| `strip_code_blocks` | Python 版围栏剥离 |
| `extract_section` | 按 heading 提取 markdown 节 |
| `extract_frontmatter` | 简易 YAML frontmatter 解析 |
| `find_skills` / `find_references` | 文件发现 |
| `load_fixture` | 从 `.dev/fixtures/` 加载 JSON |

Python ≥ 3.9（`list[str]` 类型标注）。

#### 3.6.3 契约脚本清单

**Level 1 — 静态结构**（7 个）：

| 脚本 | 验证目标 | 语言 |
|------|---------|------|
| `step-numbering.sh` | `## Execution Steps` 编号连续 | bash |
| `cross-refs.sh` | `See <file>` / `step N` 引用目标存在 | bash |
| `signal-whitelist.sh` | signal result/next/checkpoint 值在白名单内 | bash |
| `naming-conventions.sh` | `.test/`/`.notes/` 等文件名模式符合 convention | bash |
| `state-matrix.py` | 状态矩阵 ↔ SKILL.md State Transitions 一致 | python |
| `frontmatter-validation.sh` | SKILL.md frontmatter 必需字段 + 值域 + model-routing 交叉 | bash |
| `git-commit-conventions.sh` | `## Git` 节 commit type ∈ git-details.md 白名单 | bash |

**Level 2 — 语义一致**（7 个）：

| 脚本 | 验证目标 | 语言 |
|------|---------|------|
| `terminology.sh` | 旧术语不再出现（blocklist 检测，排除 protocol 术语表） | bash |
| `data-flow.py` | Data Flow Contract 产出↔消费闭合 | python |
| `seed-completeness.sh` | seed-type 有 Verification Cycle 节（按优先级 FAIL/WARN） | bash |
| `lock-coverage.sh` | VFP 文件模式在 concurrency.md 锁覆盖内 | bash |
| `phase-state-machine.py` | phase 字段转换规则在 plan/check/exec 间一致 | python |
| `index-completeness.sh` | REFERENCE-INDEX.md 列出 references/ 下所有文件 | bash |
| `signal-field-names.py` | `.auto-signal` 字段名一致（非值）；检测 tdd→vfp 残留 | python |

**Level 3 — 集成契约**（3 个）：

| 脚本 | 验证目标 | 语言 |
|------|---------|------|
| `state-machine-graph.py` | 状态机可达性 + 终态性 + 无死锁 | python |
| `protocol-compliance.py` | SKILL.md `§` 引用 ↔ 协议节名存在 | python |
| `signal-routing.py` | 信号 next ↔ auto 路由表一致 | python |

**Meta**：`self-check.sh` — 验证 contracts/ 覆盖所有 .md 文件。

#### 3.6.4 回归防护：单调绿进保证

**问题**（P24）：渐进式实施中，Phase N 的改动可能破坏 Phase N-1 已通过的测试，而回归被 baseline 中"预期的 Red"掩盖。

**三层防护**：

**层 1：快照比对** — `validate.sh --regression <snapshot>`

```
对 snapshot 中每条 PASS 的检查：
  当前仍 PASS → ok
  当前变 FAIL → REGRESSION — 立即报错
对 snapshot 中每条 FAIL 的检查：
  当前变 PASS → 新进展（记录）
  当前仍 FAIL → 预期（忽略）
```

**核心规则：已通过的测试永远不允许再失败。**

**层 2：Phase 预期清单** — `validate.sh --check-phase <N>`

`fixtures/phase-expectations.json` 定义每个 Phase 边界哪些测试应新增通过：

```json
{
  "phase-1": {
    "newly_green": ["L3-protocol-compliance:*", "L1-cross-refs:*→protocol"],
    "still_red": ["L2-terminology:*", "L2-seed-completeness:*"]
  },
  "phase-4": { "newly_green": ["*"], "still_red": [] }
}
```

**层 3：原子提交 + 逐步验证**

每个改动步骤：改动前保存快照 → 执行改动 → `--regression` 比对 → 无回归则提交 → 更新持久快照。

---

## 四、实施步骤

> 每步完成后更新进度追踪。

### Phase 0: 基础设施（Red 阶段）

| Step | 内容 | 产出 |
|------|------|------|
| 0.1 | 创建 `.dev/` 目录结构和 `validate.sh` 入口 | 脚本骨架 |
| 0.2 | 编写公共库 `lib.sh` + `lib.py` | 2 个库 |
| 0.3 | 编写 L1 验证脚本 ×7 | 7 个脚本 |
| 0.4 | 编写 L2 验证脚本 ×7 | 7 个脚本 |
| 0.5 | 编写 L3 验证脚本 ×3 + Meta ×1 | 4 个脚本 |
| 0.6 | 编写 fixtures | 契约固件 |
| 0.7 | `validate.sh --snapshot snapshot-phase-0.jsonl` → Red baseline | 快照 |

### Phase 1: 协议抽取（Green — 结构改造）

> 每步 `--regression snapshot-latest.jsonl`，完成 `--check-phase 1`

| Step | 内容 | 验证 |
|------|------|------|
| 1.1 | 创建 `verification-first-protocol.md` | L3 protocol-compliance |
| 1.2 | 更新 `directory-convention.md`：① 引入 `NB_TASK_WORKING` / `NB_PROJECT_DELIVERABLES` 变量定义 ② deliverables 从 `<notebook>/[dir]/` 上移至 `<project>/.deliverables/<notebook>/` ③ 新增 VFP 文件模式（`vh-stubs.*`, `vh-baseline.md`, `cumulative-green.jsonl`, `hil-snapshots/`） | L1 naming-conventions |
| 1.3 | 更新 `concurrency.md` VFP 文件锁 | L2 lock-coverage |
| 1.4 | 更新 REFERENCE-INDEX.md | L2 index-completeness |

### Phase 2: SKILL.md 改造（Green — 逻辑引用化）

> 逐文件改造，每文件单独提交。每步 `--regression`，完成 `--check-phase 2`

| Step | 内容 | 验证 |
|------|------|------|
| 2.1 | plan/SKILL.md: 步骤 18 引用协议 + 条件泛化 + commit 术语 | L1 step-numbering + L2 terminology + L1 git-conventions |
| 2.2 | exec/SKILL.md: per-step 引用协议 + 条件泛化 + 步骤 4 三模式 + 步骤 4.5 CGG | L1 cross-refs + L2 data-flow |
| 2.3 | verify/SKILL.md: metrics 引用协议 + `--checkpoint regression` | L2 data-flow |
| 2.4 | check/SKILL.md: compliance 引用协议 + regression-free + HIL fallback | L2 data-flow + L3 protocol-compliance |
| 2.5 | auto/SKILL.md: `tdd_cycles→vfp_cycles` + `(hil-pending)` 路由 + 引用协议 | L1 signal-whitelist + L2 signal-field-names |
| 2.6 | auto/references/ 字段名同步 | L2 signal-field-names |
| 2.7 | init/SKILL.md: deliverables 目录从 notebook 级改为 project 级 `$NB_PROJECT_DELIVERABLES/<notebook>/` | L2 data-flow |
| 2.8 | report/SKILL.md: `.report.md` 写入路径改为 `$NB_PROJECT_DELIVERABLES/<notebook>/` | L2 data-flow |

### Phase 3: 领域泛化（Green — 扩展覆盖）

> 每步 `--regression`，完成 `--check-phase 3`

| Step | 内容 | 验证 |
|------|------|------|
| 3.1 | software.md 增加 Verification Cycle | L2 seed-completeness |
| 3.2 | data-pipeline.md + ml.md (P1) | L2 seed-completeness |
| 3.3 | documentation.md + infrastructure.md (P2) | L2 seed-completeness |
| 3.4 | research/SKILL.md VFP 感知 | L2 data-flow |
| 3.5 | plugin-delegation.md 拆分 + Integration Summary 同步 | L1 signal-whitelist + L3 signal-routing |

### Phase 4: 全量验证（Refactor 阶段）

| Step | 内容 | 验证 |
|------|------|------|
| 4.1 | `validate.sh --level all` → 0 FAIL | 所有通过 |
| 4.2 | `validate.sh --self-check` → 全覆盖 | 无孤立文件 |
| 4.3 | `validate.sh --check-phase 4` → 全部 newly_green | 预期满足 |
| 4.4 | Review 契约覆盖 → 补充 | 完整 |
| 4.5 | 清理脚本、fixtures、文档 | 整洁 |
| 4.6 | 更新本文档状态为"完成" | — |

---

## 五、进度追踪

| Phase | Step | 内容摘要 | 状态 | 日期 |
|-------|------|----------|------|------|
| 0 | 0.1–0.7 | 基础设施 + Red baseline (508/65/37) | **done** | 2026-02-24 |
| 1 | 1.1–1.4 | 协议抽取 (530/48/37) | **done** | 2026-02-24 |
| 2 | 2.1–2.8 | SKILL.md 改造 + 术语迁移 (555/0/37) | **done** | 2026-02-24 |
| 3 | 3.1–3.5 | 领域泛化 (558/0/35) | **done** | 2026-02-24 |
| 4 | 4.1–4.6 | 全量验证 + 清理 | **done** | 2026-02-24 |

总计 30 步（7+4+8+5+6）。全部完成。

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **改旧 bug 引新 bug** | 高 | 高 | 三层回归防护（§3.6.4）：快照比对 + Phase 预期 + 原子提交 |
| 协议文件过长导致上下文膨胀 | 中 | 中 | 控制 150 行，示例移至 seed-type |
| 领域 VH 映射对某些类型生硬 | 中 | 低 | P3 类型标记 optional；inspectable/mixed 模式允许弹性 |
| validate.sh markdown 解析误报 | 中 | 低 | `split_table_row()` + `strip_code_blocks()` + Python 兜底 |
| 改造过程中破坏子命令配合 | 低 | 高 | 每步 `--regression` + data-flow 契约验证 |
| VH stub 生成在陌生技术栈失败 | 中 | 中 | fallback → N/A 评级，不阻塞 |
| runner crash 误判为 Red | 低 | 中 | Three-State Exit Code：0/1/>1 |
| validate.sh 自身过时 | 中 | 低 | `--self-check` 检测未覆盖文件 |
| fixture 数据过时 | 中 | 中 | `_meta.last_verified` + self-check |
| HIL 人工未响应 | 中 | 中 | 复用 daemon 超时 → 降级 inspectable，Compliance 降一级 |
| CGG Proxy 产物 diff 误判 | 低 | 中 | SSIM 阈值可配置，Phase 边界全量复审兜底 |

---

## 附录 A：完整协议草稿

> 此处为 `verification-first-protocol.md` 的完整内容草稿。实施 Phase 1.1 时以此为基础创建实际文件。

```markdown
# Verification-First Protocol (VFP) v1.0

## Terminology
| Term | Alias | Definition |
|------|-------|------------|
| Verification Hypothesis (VH) | Red stub | 预期失败的验证条件，在实现前定义 |
| Hypothesis Satisfied (HS) | Green | 验证条件通过 |
| Cumulative Green Gate (CGG) | Regression check | 每步 HS 后验证所有已通过 VH 仍成立 |
| Consolidation | Refactor | 通过后的产物整理 |
| VH Baseline | Red baseline | 所有 VH 的初始失败状态记录 |
| Approval Snapshot | — | 人工通过 HIL-VH 时的产物参照状态 |
| CGG Proxy | — | 产物 diff 替代人工的 CGG 回归检测 |
| VFP Cycle | TDD cycle | VH → HS → CGG → Consolidation |
| Human VH (HIL-VH) | Manual test | 需人工判断的 VH |

## Applicability
- type-profile 含 `## Verification Cycle` 节 → 适用
- 缺少 → 退回标准验证流程
- software 始终适用

## VH Verification Modes
| 模式 | 判定 | 适用 |
|------|------|------|
| executable | exit code 0/1/>1 | software, data-pipeline, infrastructure |
| inspectable | Claude 按标准判定 | documentation, ml, dsp |
| human | 人工 approve/reject | literary, screenwriting, image/video |

mixed 模式 = 部分 auto + 部分 human（`human_vhs` 列表标注）

## Three-State Exit Code (executable)
| Exit | 含义 | 处理 |
|------|------|------|
| 0 | HS (Green) | → CGG → Consolidation |
| 1 | VH unsatisfied (Red) | 正常 or NEEDS_FIX |
| >1 | INFRA_ERROR | 重试一次，仍失败 → (mid-exec) |

## VH Generation Rules
1. 每 step 验证点 → ≥ 1 VH stub
2. 含描述 + 断言占位 + `// VH: not implemented`
3. 内容经 injection-rules.md 净化
4. 生成后确认全部失败 → baseline

## VH Generation Fallback
失败 → baseline 标记 `generation_failed: true` → plan 继续 → exec 跳过确认 → check N/A

## VH→HS Transition
1. 实现前 VH → 期望全部 Red
2. 意外 Green → 警告
3. 实现后 → 期望全部 Green
4. 仍 Red → NEEDS_FIX
5. 全 Green → CGG → Consolidation

## Cumulative Green Gate (CGG)
- 触发: 每步 HS 后
- 范围: step-1..N-1 所有已通过 VH
- executable: 运行累积测试; inspectable: Claude 重审; human: CGG Proxy (产物 diff)
- 回归 → 修复(≤1次) → 重跑; 仍失败 → (mid-exec)
- 产物: `.test/<date>-cumulative-green.jsonl` (追加)
- 跳过: step=1, generation_failed, 无 VC 节

## Human-in-the-Loop (HIL)
- human VH = exec 步骤 4 HS confirmation 的人工变体
- approve → Approval Snapshot; reject → NEEDS_FIX
- auto 模式: (hil-pending) → (stop), 复用 daemon 超时
- CGG Proxy: 产物 diff < 阈值 → auto-pass; 变化 → 待复审
- 降级: daemon 超时 → inspectable, 标记 hil_fallback

## Path Variables
| 变量 | 含义 |
|------|------|
| `NB_TASK_WORKING` | `$NB_WORKSPACES_ROOT/<project>/<notebook>/.working/` — notebook 级系统工作目录 |
| `NB_PROJECT_DELIVERABLES` | `$NB_WORKSPACES_ROOT/<project>/.deliverables/` — project 级交付物目录 |

以下路径均相对于 `$NB_TASK_WORKING`，交付物写入 `$NB_PROJECT_DELIVERABLES/<notebook>/`。

## Data Flow Contract
| 阶段 | 产出 | 消费方 |
|------|------|--------|
| plan | vh-stubs.*, vh-baseline.md, [VH:] 标注 | exec, verify, check |
| exec | cumulative-green.jsonl, hil-snapshots/, VFP Cycle Summary | exec, check, auto |
| verify | VFP Metrics in results | check |
| check | VFP Compliance in analysis | report |
| auto | vfp_cycles_completed in signal | daemon |
| report | `$NB_PROJECT_DELIVERABLES/<notebook>/.report.md` | 用户 |

## VFP Metrics
VH total / Satisfied / Unsatisfied / VFP cycle count / CGG pass / Regressions /
Coverage / Compliance / HIL total / approved / proxy pass / re-review / fallback

## Compliance Scoring
Full (≥threshold, baseline, no skip) / Partial / Low (<threshold/2) / N/A
threshold default 80%, seed-type 可覆盖

## Consolidation
检查重构机会 → 全量测试确认不回退 → 无机会则跳过

## Anomaly Detection (auto)
- VFP 周期缺失 3 步 → mid-exec check
- CGG total 递减 → mid-exec check
- 防循环: 最多触发 1 次

## Contributing
- 新类型 VC: seed-type 增加节 + validate.sh --level 2
- 新契约: .dev/contracts/ + 注册 + --self-check

## Version
v1.0 — hard upgrade
```

## 附录 B：Fixture 数据

### expected-states.json

```json
{
  "_meta": { "version": "1.0", "last_verified": "2026-02-24", "note": "20 transitions (P19: +5 cancel +2 self-loop)" },
  "states": ["draft","planning","review","executing","re-planning","complete","blocked","cancelled"],
  "terminal": ["complete", "cancelled"],
  "transitions": [
    { "from": "draft",        "to": "planning",     "via": "plan" },
    { "from": "draft",        "to": "planning",     "via": "annotate" },
    { "from": "draft",        "to": "cancelled",    "via": "cancel" },
    { "from": "planning",     "to": "planning",     "via": "plan", "note": "self-loop: revision" },
    { "from": "planning",     "to": "review",       "via": "check PASS" },
    { "from": "planning",     "to": "blocked",      "via": "check BLOCKED" },
    { "from": "planning",     "to": "cancelled",    "via": "cancel" },
    { "from": "review",       "to": "executing",    "via": "exec" },
    { "from": "review",       "to": "re-planning",  "via": "plan" },
    { "from": "review",       "to": "cancelled",    "via": "cancel" },
    { "from": "executing",    "to": "re-planning",  "via": "check REPLAN" },
    { "from": "executing",    "to": "blocked",      "via": "check BLOCKED" },
    { "from": "executing",    "to": "complete",     "via": "merge" },
    { "from": "executing",    "to": "cancelled",    "via": "cancel" },
    { "from": "re-planning",  "to": "re-planning",  "via": "plan", "note": "self-loop: further revision" },
    { "from": "re-planning",  "to": "review",       "via": "check PASS" },
    { "from": "re-planning",  "to": "blocked",      "via": "check BLOCKED" },
    { "from": "re-planning",  "to": "cancelled",    "via": "cancel" },
    { "from": "blocked",      "to": "planning",     "via": "plan" },
    { "from": "blocked",      "to": "cancelled",    "via": "cancel" }
  ]
}
```

### expected-signals.json

```json
{
  "_meta": { "version": "1.0", "last_verified": "2026-02-24" },
  "result_whitelist": [
    "PASS","NEEDS_REVISION","ACCEPT","NEEDS_FIX","REPLAN","BLOCKED","CONTINUE",
    "(generated)","(done)","(mid-exec)","(step-N)","(blocked)","(hil-pending)",
    "(collected)","(sufficient)","(o1-collected)","(o2-collected)","(o3-collected)","(objective-complete)",
    "(pass)","(fail)","(partial)","(processed)",
    "success","conflict","rejected"
  ],
  "next_whitelist": ["plan","check","exec","merge","report","research","verify","annotate","(stop)"],
  "checkpoint_whitelist": ["","post-plan","post-research","post-o1","post-o2","post-o3","mid-exec","post-exec","quick","full","step-N","regression","dependency-blocked","no-accept"]
}
```

### expected-artifacts.json

```json
{
  "_meta": { "version": "1.0", "last_verified": "2026-02-24" },
  "data_flow": [
    { "producer": "plan",   "artifact": "vh-stubs",                  "consumers": ["exec","verify","check"] },
    { "producer": "plan",   "artifact": "vh-baseline.md",            "consumers": ["exec","verify","check","auto"] },
    { "producer": "plan",   "artifact": "[VH: ...] in .plan.md",     "consumers": ["exec"] },
    { "producer": "exec",   "artifact": "cumulative-green.jsonl",    "consumers": ["exec","check","auto"] },
    { "producer": "exec",   "artifact": "hil-snapshots/",            "consumers": ["exec","check"] },
    { "producer": "exec",   "artifact": "VFP Cycle Summary in .notes/", "consumers": ["check","auto"] },
    { "producer": "verify", "artifact": "VFP Metrics in results",    "consumers": ["check"] },
    { "producer": "check",  "artifact": "VFP Compliance in .analysis/", "consumers": ["report"] },
    { "producer": "auto",   "artifact": "vfp_cycles_completed in .auto-signal", "consumers": ["daemon"] }
  ]
}
```

### terminology-blocklist.txt

```
# 旧术语(TAB)正确术语
Red stub	VH stub
Red test skeleton	VH stub
Red confirmation	VH confirmation
Green confirmation	HS confirmation
Red baseline	VH baseline
Red→Green	VH→HS
TDD Metrics	VFP Metrics
TDD Compliance	VFP Compliance
TDD Discipline Audit	VFP Discipline Audit
TDD Cycle	VFP Cycle
tdd_cycles_completed	vfp_cycles_completed
```

## 附录 C：公共库 API

### lib.sh

```bash
TASK_AI_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0; FAIL=0; WARN=0

emit_pass() { echo "[PASS] $1"; ((PASS++)); }
emit_fail() { echo "[FAIL] $1"; ((FAIL++)); }
emit_warn() { echo "[WARN] $1"; ((WARN++)); }
emit_json() { echo "{\"test\":\"$1\",\"status\":\"$2\",\"detail\":\"$3\"}"; }
safe_read() { while IFS= read -r line; do echo "$line"; done < "$1"; }

strip_code_blocks() {
  local in_fence=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^\`\`\` ]]; then
      in_fence=$((1 - in_fence)); echo ""
    elif [[ $in_fence -eq 0 ]]; then echo "$line"
    else echo ""
    fi
  done
}

extract_steps() {
  local file="$1" in_section=0
  strip_code_blocks < "$file" | while IFS= read -r line; do
    [[ "$line" =~ ^##[[:space:]]+Execution[[:space:]]+Steps[[:space:]]*$ ]] && in_section=1 && continue
    [[ "$in_section" -eq 1 && "$line" =~ ^##[[:space:]] && ! "$line" =~ ^###  ]] && break
    [[ "$in_section" -eq 1 ]] && echo "$line"
  done
}

extract_frontmatter() {
  local file="$1" in_fm=0 started=0
  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      [[ $started -eq 0 ]] && started=1 && in_fm=1 && continue
      [[ $in_fm -eq 1 ]] && break
    fi
    [[ $in_fm -eq 1 ]] && echo "$line"
  done < "$file"
}

summary() {
  echo "---"
  echo "Summary: $PASS passed, $FAIL failed, $WARN warnings"
  [[ $FAIL -gt 255 ]] && return 255
  return $FAIL
}
```

### lib.py

```python
"""task-ai markdown 解析工具库（仅 stdlib, Python ≥ 3.9）"""
import re, json, sys
from pathlib import Path

TASK_AI_ROOT = Path(__file__).resolve().parent.parent.parent

def strip_code_blocks(text: str) -> str:
    lines, result, in_fence = text.split('\n'), [], False
    for line in lines:
        if line.strip().startswith('```'):
            in_fence = not in_fence; result.append('')
        elif in_fence: result.append('')
        else: result.append(line)
    return '\n'.join(result)

def split_table_row(line: str) -> list[str]:
    if not line.strip().startswith('|'): return []
    cells, current, in_bt = [], '', False
    content = line.strip()
    if content.startswith('|'): content = content[1:]
    if content.endswith('|'): content = content[:-1]
    for ch in content:
        if ch == '`': in_bt = not in_bt; current += ch
        elif ch == '|' and not in_bt: cells.append(current.strip()); current = ''
        else: current += ch
    cells.append(current.strip())
    return cells

def parse_md_table(text: str) -> list[dict]:
    lines = [l for l in text.strip().split('\n') if l.strip()]
    if len(lines) < 3: return []
    headers = split_table_row(lines[0])
    if not headers: return []
    sep = split_table_row(lines[1])
    if not all(re.match(r'^:?-+:?$', c.strip()) for c in sep if c.strip()): return []
    rows = []
    for line in lines[2:]:
        if not line.strip().startswith('|'): break
        cells = split_table_row(line)
        if len(cells) == len(headers): rows.append(dict(zip(headers, cells)))
    return rows

def extract_section(filepath: Path, heading: str) -> str:
    text = filepath.read_text()
    level = heading.count('#')
    m = re.search(f'^{re.escape(heading.rstrip())}\\s*$', text, re.MULTILINE)
    if not m: return ''
    start = m.end()
    m2 = re.search(f'^{"#" * level}[^#]', text[start:], re.MULTILINE)
    return text[start:start + m2.start()] if m2 else text[start:]

def extract_frontmatter(filepath: Path) -> dict:
    text = filepath.read_text()
    m = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not m: return {}
    result = {}
    for line in m.group(1).split('\n'):
        if ':' in line:
            k, _, v = line.partition(':')
            result[k.strip()] = v.strip()
    return result

def find_skills() -> list[Path]:
    return sorted((TASK_AI_ROOT / 'skills').rglob('SKILL.md'))

def find_references() -> list[Path]:
    return sorted((TASK_AI_ROOT / 'commands' / 'references').glob('*.md'))

def load_fixture(name: str):
    return json.loads((TASK_AI_ROOT / '.dev' / 'fixtures' / name).read_text())

def emit(level: str, msg: str):
    print(f'[{level}] {msg}')

def emit_json(test_id: str, status: str, detail: str = ''):
    print(json.dumps({'test': test_id, 'status': status, 'detail': detail}))
```
