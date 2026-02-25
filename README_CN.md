# Moonview

[English](README.md)

一个通用的插件市场，提供结构化的任务生命周期管理。

> *"站在月球看地球"* — [老王来了@dlw2023](https://www.youtube.com/@dlw2023)

## 安装

将 Moonview 插件市场添加到您首选的智能体中：

```bash
# Gemini CLI
gemini plugin add huacheng/moonview

# Claude Code
claude plugin add huacheng/moonview

# Codex CLI
codex plugin add huacheng/moonview
```

## 插件

### task-ai (v0.8.1)
## 一、概述

task-ai 是一套**纯 Markdown 指令驱动**的任务生命周期管理框架。它作为一个通用的、模型解耦的插件运行，管理从任务初始化到完成报告的完整生命周期。框架支持领域自适应验证（VFP 协议）、跨任务知识复用和高度自动化的自主执行。

**核心哲学**: “任务即 Notebook”。所有任务都绑定到独立的 Notebook 结构中，确保责任边界清晰和审计追踪完整。

**入口命令**: 在 Prompt 窗口输入 `/moonview:<subcommand> [args]`

---

## 二、18 个子命令

### 核心生命周期（按典型顺序）

| 子命令 | 模型层级 | 职责 | 备注 |
|--------|---------|------|------|
| `init` | light | 初始化工作目录、Git 分支 | 需提供 `<project> <notebook>` |
| `target` | heavy | **定义/评审任务目标** | 双向同步 `.target.md` |
| `research` | heavy | 情报收集、类型发现 | 任意阶段可独立调用 |
| `plan` | heavy | 生成实施计划 `.plan.md` | 自动生成 VH 验证存根 |
| `verify` | medium | 运行领域适配测试 (VH/CGG) | 生成测试结果文件 |
| `check` | heavy | 计划/执行评审与门禁 | 三大检查点控制状态流转 |
| `exec` | heavy | 按计划逐步执行实施 | 遵循 VFP 协议（红→绿→重构） |
| `merge` | medium | 合并任务分支，清理元数据 | 自动删除任务分支 |
| `report` | medium | 生成完成报告，经验蒸馏 | 将知识同步至 `.library` |

### 辅助与系统命令

| 子命令 | 模型层级 | 职责 |
|--------|---------|------|
| `light` | light | **轻量级影子任务**：闪击模式，瞬时 Notebook，完成后自动清理。 |
| `read` | medium | **系统免疫**：从外部文档/URL 安全吸纳知识到图书馆。 |
| `security` | heavy | **安全网关**：前置审计计划和验证高危命令。 |
| `auto` | heavy | 自主执行循环：单会话编排，通过 `.auto-signal` 驱动。 |
| `cancel` | light | 取消任务，清理状态。 |
| `list` | light | 查询任务清单、依赖图及影子任务状态。 |
| `annotate` | medium | 处理实施计划面板的交互批注。 |
| `summarize` | light | 重新生成 `.summary.md` 压缩上下文。 |
| `library` | light | 知识库管理（搜索、索引重建、归档维护）。 |

### 上下文自动检测
除 `init` 和 `light` 需要指定项目/任务名外，其他所有命令均通过 **Git 分支**（`task/<notebook>`）或**工作目录路径**自动锁定上下文，无需手动传参。

### 快速上手

```bash
# 1. 初始化任务（创建分支并切换）
/moonview:init my-project auth-refactor --title "将认证重构为 JWT"

# 2. 定义目标，研究深化（自动检测上下文，无需传 notebook 名）
/moonview:target "将 auth 模块从 session cookies 迁移到 JWT"
/moonview:research --caller target

# 3. 生成计划 → 审查 → 执行 → 合并 → 报告
/moonview:plan --generate
/moonview:check --checkpoint post-plan
/moonview:exec
/moonview:merge
/moonview:report

# 或一键自主执行全流程：
/moonview:auto --start
```

### 典型子命令流转图

#### 1. 标准重型任务 (Standard Path)
```mermaid
graph TD
    init[init] --> target[target]
    target --> res_obj[research:objective]
    res_obj --> plan[plan]
    plan --> sec_plan{security:audit-plan}
    sec_plan -- PASS --> verify[verify]
    sec_plan -- REJECT --> plan
    verify --> check[check]
    check -- PASS --> exec[exec]
    check -- REPLAN --> plan
    exec --> sec_cmd{security:verify-cmd}
    sec_cmd -- PASS --> hs[Verification: HS]
    hs --> check_post[check:post-exec]
    check_post -- ACCEPT --> merge[merge]
    check_post -- NEEDS_FIX --> exec
    merge --> report[report]
```

#### 2. 轻量级影子任务 (Light Path)
```mermaid
graph LR
    light[light] --> exec_l[exec]
    exec_l --> finish[light --finish]
    exec_l --> promote[light --promote]
    promote --> plan[Standard: planning]
```

#### 3. 辅助与全局命令 (Auxiliary)
- **`auto`**: 封装标准流，通过 `.auto-signal` 自动驱动。
- **`read`**: 全局调用，向 `.library` 输送知识。
- **`list` / `summarize` / `library`**: 随时调用的状态与管理工具。

---

## 三、状态机 (9 状态 23 转换)

### 状态转换图

```
                        ┌─────────────────────────────────────┐
                        ▼                                     │
draft ──→ planning ──→ review ──→ executing ──→ complete      │
            ▲  │  ▲      │          │  │                      │
            │  └──┘      │          │  ▼                      │
            │ (self)     │       re-planning                  │
            │            │          ▲  │  ▲                   │
            ├────────────┼──────────┘  └──┘                   │
            │            │            (self)                   │
            │            ▼                                     │
            ├───────── blocked                                │
            │                                                  │
light-exec ─┤──────────────────────────────────→ complete      │
            │                                                  │
            └── any non-terminal ──────────────→ cancelled ◉  │
                                                               │
                                                complete ◉ ◄──┘
```

### 9 个状态

| 状态 | 说明 |
|------|------|
| `draft` | 初始状态，`init` 创建后进入 |
| `planning` | 计划生成中（支持自循环修订） |
| `review` | 计划通过 `check`，等待执行 |
| `executing` | 逐步执行实施计划 |
| `re-planning` | 执行中发现问题，回退重新规划（支持自循环） |
| `blocked` | 外部依赖阻塞，可恢复到 `planning` |
| `light-exec` | `light` 模式专用，影子任务执行中 |
| `complete` ◉ | 终态：任务完成 |
| `cancelled` ◉ | 终态：任务取消 |

### 关键设计约束
1. **轻量限制**: `light` 模式若修改文件 > 3 或失败 > 3 次，必须执行 `--promote` 转正为标准流程。
2. **Notebook 绑定**: 即使是 `light` 模式也必须创建临时 Notebook 目录以承载状态。
3. **安全前置**: 所有 `exec` 执行前必须通过 `security` 校验。

---

## 四、VFP 协议与质量保证

### 验证先行协议 (VFP)
框架强制执行 **Verification-First Protocol**：
- **VH (Verification Hypothesis)**: 计划阶段定义失败基线。
- **HS (Hypothesis Satisfied)**: 实施后验证成功。
- **CGG (Cumulative Green Gate)**: 每次修改必须通过全量回归。

### 自动化审计 (Six-Perspective Audit)
框架内置 `.dev/validate.sh` 对 18 个 Skill 执行六个维度的深度检查：
1. **结构一致性**: 步骤编号、交叉引用。
2. **路由合规**: `.auto-signal` 状态机跳转。
3. **技术完整性**: 锁定机制、数据流闭环。
4. **功能健壮性**: TDD 契约测试全覆盖。
5. **安全防护**: 10 类注入解毒、路径穿越防御。
6. **协议合规**: 权威协议节 (`§`) 引用。

---

## 五、特性总览

- **项目层级** — `$NB_WORKSPACES_ROOT/<project>/<notebook>/` 两级组织
- **18 个子命令** — 覆盖从初始化到报告的完整生命周期
- **上下文自动检测** — `init` 之后，所有命令通过 Git 分支（`task/<notebook>`）或工作目录路径自动锁定上下文，无需手动传参
- **领域自适应** — 19 种种子类型（software, science:\*, image-processing, video-production, DSP, literary, screenwriting, mechatronics, chip-design 等），支持自动发现和混合类型（`data-pipeline|ml`）
- **知识图书馆** — `.library/.memory/` 存储跨任务的经验、参考、类型档案和思维模式
- **Git 集成** — 每任务一分支、worktree 隔离并行执行、结构化提交消息
- **批注驱动** — 前端 Plan 面板批注自动转化为计划更新
- **自主执行** — auto 单会话编排，停滞检测、依赖门禁（`depends_on`）、上下文配额、插件委派
- **六维审计** — check 从 6 个独立视角评估计划和实施
- **研究情报** — 任意阶段可独立调用，支持领域知识、需求深化、测试方法论
- **并发保护** — 基于 `O_CREAT|O_EXCL` 的原子锁，6 级优先级排序，过期锁自动回收
- **契约测试套件** — 632 条断言（L1 结构 + L2 功能），覆盖所有 skill、脚本和状态转换
- **安全加固** — 固定字符串路径比对、输入净化（tags/title/awk）、`find()` 结果校验

## 六、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NB_WORKSPACES_ROOT` | `$HOME/nb-workspaces` | 所有项目和 notebook 的根目录 |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` | 共享知识图书馆目录 |

## 七、兼容性

### 模型解耦 (Agnostic)
- 彻底移除对特定大模型名称的硬编码。
- 采用通用术语 `the agent` 代替旧有的 `Claude`。
- 文档全面英文规范化，Prompt 支持多 CLI 环境（Gemini/Claude Code 等）。

### 基础设施
- **去 Python 内联**: 所有 Bash 脚本均通过独立工具类（`state.py`, `json_get.py`）操作数据，严禁 Shell 中嵌入 Python 代码。
- **共享函数库**: `lib.sh` 提供 `resolve_workdir()`、`find_nb_context()` 等通用函数，9 个脚本统一调用。

---

## 八、当前统计

| 指标 | 数值 | 备注 |
|------|------|------|
| 子命令总数 | 18 | 覆盖从调研到交付全流程 |
| 契约测试通过数 | **632 PASS** (L1: 421, L2: 211) | 0 FAIL, 0 ERROR |
| 状态机状态数 | 9 | 包含 light-exec 扩展 |
| 文档覆盖度 | 100% | 每个 Skill 均有完整 SKILL.md |

---
*总结由 task-ai (v0.8.1) 自动生成并验证。*

## 相关项目

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — 网页界面，包含 Plan 批注面板和 Chat 编辑器

## 许可证

MIT
