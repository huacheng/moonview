# Moonview

[English](README.md)

结构化任务生命周期管理插件市场。

> *"站在月球看地球"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## 安装

```bash
# Claude Code
claude plugin add huacheng/moonview

# Gemini CLI
gemini plugin add huacheng/moonview

# Codex CLI
codex plugin add huacheng/moonview
```

## 插件

### task-ai (v1.2.0)

## 一、设计哲学

**task-ai 是一个承认无知的系统。** 它不假装知道任务有多大、该分几个阶段、安全威胁长什么样、最佳实践是什么、甚至自己该以什么节奏运行。它提供的是一个结构化的涌现框架：

- **任务目标一步一步浮现**而非预设（渐进进化）
- **领域知识从实践中沉淀**并跨任务流转（经验蒸馏与采纳追踪）
- **安全防线从 10 条种子规则向未知威胁生长**（可进化注入检测）
- **运行参数从硬编码默认值向类型经验收敛**（自适应阈值）

所有涌现物都经过审查门控才固化——候选规则要 audit-validate，经验要 quality_status 从 provisional 到 verified，阈值要 post-loop learning 的统计支撑。而当新认识推翻旧结论时，系统同样有路径让已固化的知识重新进化：经验可被 invalidated，规则可被 override，satisfied 可重新进入 planning。

**它的终态不是"完成"，而是"暂时够了"。**

### 核心原则

| 原则 | 说明 |
|---|---|
| **承认无知** | 不预设任何能从实践中涌现的东西。任务阶段、领域方法论、安全规则、运行参数都从默认值起步，通过经验进化 |
| **三层涌现** | 任务进化（阶段涌现）、知识进化（经验蒸馏与流转）、安全进化（规则从种子基线生长） |
| **文件即上下文** | 子命令通过 `.working/` 目录文件共享上下文，而非参数或共享内存。任何技能都可独立调用 |
| **审查门控** | 涌现 ≠ 放任。每种产物都过门：D1-D6 六维评分、quality_status 转换、audit-validate 验证 |
| **自适应而非自配置** | 用户什么都不用调。所有行为参数都有硬编码兜底，从经验中收敛——跑过的同类型任务越多，系统越"懂"这类任务的节奏 |
| **唯一终态是放弃** | `cancelled` 是唯一终态。`satisfied` 只是"暂时够了"——认知提升或需求变化时可随时重入进化 |
| **教训必须闭环** | 经验不是写了就完事。plan 采纳时记录来源，highlight 追踪 adoption_count，report 双向汇总。好经验靠被反复采纳来证明自己 |
| **安全基线是地板不是天花板** | 10 类注入检测是种子基线。Evolved rules 可覆盖任何 seed category 或追加新 category（11+）。安全不是一次性配置，是持续对抗 |

---

## 二、三层进化

### 1. 任务进化 — 渐进式阶段

阶段逐一涌现，没有预定义的 `stage.total`。每次 merge 产生 `evolving` 状态；用户决定下一步方向或说"satisfied"。

```
init → target → plan → check → exec → merge → report
         ↑                                    ↓
         └──── evolving（定义下一阶段）──────┘
                    │
                    └──→ satisfied（可重新进入）
```

### 2. 知识进化 — 经验生命周期

```
highlight 写入经验 → plan 读取并采纳 → adoption_count 递增
     ↓                      ↓                    ↓
provisional → verified   Adopted Experiences §  高采纳 = 已证明的教训
     ↓                      ↓
invalidated（如果误导）  report 双向汇总
```

共享类型画像积累跨任务的领域智慧。三个写入者：research（发现）、highlight（蒸馏）、auto（执行指标）。

### 3. 安全进化 — 可进化规则

```
种子基线（10 类，injection-rules.md）
        +
进化规则（.evolving-rules/sanitization/active/*.md）
        ↓ 合并：进化规则 > 种子（同 category 覆盖，新 category 追加）
        ↓
合并后的规则集应用于所有外部内容
```

---

## 三、自适应行为

所有行为参数以硬编码默认值起步，从经验中收敛：

| 参数 | 来源 | 兜底默认值 |
|---|---|---|
| 审查阈值 | `.type-profile.md` Auto Adaptation | 0.70 / 0.60 / 0.75 / 0.80 |
| 重试次数 | `.type-profile.md` Auto Adaptation | 3 / 2 / 3 |
| Mid-exec 检查间隔 | `.type-profile.md` Auto Adaptation | 每 3 步 |
| 压缩阈值 | `.type-profile.md` Auto Adaptation | 82% 上下文窗口 |

每次 auto 运行后，post-loop learning 将观测指标写回。后续同类型任务使用经验修正后的值。

---

## 四、18 个子命令

### 生命周期命令

| 命令 | 职责 |
|------|------|
| `init` | 初始化工作目录和 git 分支 |
| `target` | 定义/细化递进式目标 |
| `research` | 情报收集、类型发现 |
| `plan` | 生成实施计划（含 VH 存根） |
| `verify` | 运行领域适配测试（VH/CGG） |
| `check` | 门控六维审查 |
| `exec` | 按 VFP 逐步执行 |
| `merge` | 合并任务分支至主线 |
| `highlight` | 经验蒸馏与采纳追踪 |
| `report` | 生成完成报告（含采纳摘要） |

### 系统命令

| 命令 | 职责 |
|------|------|
| `read` | 安全吸纳外部知识（种子 + 进化规则） |
| `security` | 前置审计计划、验证高危命令 |
| `auto` | 自主执行循环（自适应阈值） |
| `cancel` | 取消任务、清理状态 |
| `list` | 查询任务清单和状态 |
| `annotate` | 处理交互批注 |
| `summarize` | 重新生成上下文摘要 |
| `library` | 知识库管理与定时维护 |

---

## 五、六维门控审查（D1-D6）

| 维度 | 关注点 |
|------|--------|
| **D1 正确性** | 需求覆盖、功能逻辑 |
| **D2 安全性** | 注入防护、权限控制、并发安全 |
| **D3 可靠性** | 错误处理、故障恢复、幂等性 |
| **D4 性能** | 资源效率、I/O 优化 |
| **D5 架构** | 模块边界、扩展点 |
| **D6 可维护性** | 可读性、命名规范 |

### 门控执行
```
Gate 1: D2 安全性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 2: D1 正确性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 3: D3 可靠性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 4: D4 + D5 + D6 ─── 优化评分（非阻断）
```

### 动态适配
维度权重根据任务类型自动适配：
1. 从 `.type-profile.md` 的 "Audit Adaptation" 区块加载
2. 回退到 `.memory/.type-profiles/<type>.md`
3. 最终回退到 `check/references/` 种子表

---

## 六、自进化基础设施

### 技能信任流水线（T1 → T4）

```
T1 候选 (.skills/.candidates/)
    ↓  check --checkpoint skill-review（L2，分数 ≥ 0.70）
T2 草案 (.skills/.drafts/)
    ↓  check --checkpoint skill-deep-review（L3，分数 ≥ 0.85）
T3 激活 (.skills/.active/)
    ↓  生产验证（usage_count ≥ 3，零 REPLAN 失败）
T4 生产验证 (.skills/.active/，trust_tier: T4)
```

### 规则进化闭环
```
外部情报 → research --caller audit → candidates/*.yaml
                        ↓
          check --checkpoint audit-validate
                        ↓（precision >= 0.80）
                  active/*.yaml
                        ↓
           security/read/check 自动加载
```

### 定时维护

| 检查项 | 频率 | 说明 |
|--------|------|------|
| 过期检查 | 24h | 标记超过 30 天的引用文件 |
| T3→T4 验证 | 24h | 自动晋升满足生产标准的技能 |
| 安全规则演化 | Core: 7d / Extended: 1d | 扫描威胁、同步演化规则 |
| Changelog 体积 | 24h | 超过 2000 行时告警 |

---

## 七、Auto 模式 — 四阶段流程

```
阶段 1：目标定义（人在环中）
阶段 2：规划（自动审查，自适应阈值来自 .type-profile.md）
阶段 3：执行（自动审查，自适应 mid-exec 检查间隔）
阶段 4：收尾（merge → highlight → report → 停止）
```

Post-loop learning 将执行指标（重试次数、迭代数、压缩次数）写回 `.type-profile.md` Auto Adaptation，使后续任务以经验修正后的参数运行。

---

## 前置依赖

task-ai 与 [notebook-ai](https://github.com/huacheng/notebook-ai) 深度绑定 — notebook-ai 提供任务执行界面、文件查看器和批注面板。**必须先启动 notebook-ai** 才能正常使用 task-ai。

```bash
# 先启动 notebook-ai
git clone https://github.com/huacheng/notebook-ai.git
cd notebook-ai && ./restart.sh
```

## 许可证

MIT

---
*task-ai v1.2.0 — 一个承认无知的系统，让一切从实践中涌现*
