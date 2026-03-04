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

### task-ai (v0.9.7)

## 一、设计哲学

task-ai 是一套**自进化的任务生命周期框架**，基于三个核心原则：

### 1. 验证先行开发
每个变更都遵循 **VFP 协议**（验证先行协议）：
- **VH**（验证假设）：实现前定义失败基线
- **HS**（假设满足）：实现后验证成功
- **CGG**（累积绿色门禁）：每次修改必须通过全量回归

### 2. 门控质量保证
**六维审查**采用顺序门控，而非并行评分：
```
Gate 1: D2 安全性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 2: D1 正确性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 3: D3 可靠性   ─── 低于 0.5 阻断 ───→ 修复后继续
Gate 4: D4 + D5 + D6 ─── 优化评分（非阻断）
```

确保关键问题在优化评估之前得到修复。

### 3. 自进化智能
框架自主学习和适应：
- **经验 → 技能提升**：已验证经验自动转化为可复用技能
- **动态维度适配**：审查权重根据任务类型自动调整
- **规则进化闭环**：外部威胁情报自动转化为活跃安全规则

---

## 二、核心概念

### 任务即 Notebook
每个任务绑定独立的 Notebook 结构：
- `.target.md` — 递进式目标（支持多阶段）
- `.plan.md` — 实施计划（含 VH 存根）
- `.working/` — 执行产物和状态
- `.analysis/` — 六维审查报告

### 作用域命令
命令在不同作用域运行：
- **`scope=context`** — 会话级审查（无文件输出）
- **`scope=lifecycle`** — 完整生命周期审计
- **`scope=skill`** — 技能验证与提升
- **`scope=rules`** — 安全规则进化

---

## 三、18 个子命令

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
| `highlight` | 经验蒸馏与技能提升 |
| `report` | 生成完成报告 |

### 系统命令

| 命令 | 职责 |
|------|------|
| `read` | 安全吸纳外部知识 |
| `security` | 前置审计计划、验证高危命令 |
| `auto` | 自主执行循环 |
| `cancel` | 取消任务、清理状态 |
| `list` | 查询任务清单和状态 |
| `annotate` | 处理交互批注 |
| `summarize` | 重新生成上下文摘要 |
| `library` | 知识库管理 |

---

## 四、六维审查

| 维度 | 关注点 |
|------|--------|
| **D1 正确性** | 需求覆盖、功能逻辑 |
| **D2 安全性** | 注入防护、权限控制、并发安全 |
| **D3 可靠性** | 错误处理、故障恢复、幂等性 |
| **D4 性能** | 资源效率、I/O 优化 |
| **D5 架构** | 模块边界、扩展点 |
| **D6 可维护性** | 可读性、命名规范 |

### 动态适配
维度权重根据任务类型自动适配：
1. 从 `.type-profile.md` 的 "Audit Adaptation" 区块加载
2. 回退到 `.memory/.type-profiles/<type>.md`
3. 最终回退到 `check/references/` 种子表

---

## 五、自进化基础设施

### 经验 → 技能流水线
```
已验证经验 (usage_count >= 3, quality_status = verified)
        ↓
    highlight scope=promote
        ↓
    候选技能 + 信任报告
        ↓
    check --checkpoint skill-review（门控 D1-D6）
        ↓
    激活技能（信任层级 T2+）
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

---

## 六、快速开始

```bash
# 1. 初始化
/task-ai:init my-project auth-refactor --title "Refactor auth to JWT"

# 2. 定义目标
/task-ai:target auth-refactor

# 3. 生成计划
/task-ai:plan auth-refactor --generate

# 4. 门控审查
/task-ai:check auth-refactor --checkpoint post-plan

# 5. 执行
/task-ai:exec auth-refactor

# 6. 完成
/task-ai:merge auth-refactor
/task-ai:highlight auth-refactor
/task-ai:report auth-refactor

# 或全自主运行：
/task-ai:auto auth-refactor --start
```

---

## 七、运行时基础设施

### 核心模块

| 模块 | 职责 |
|------|------|
| `state.py` | 状态机（原子锁） |
| `lib.sh` | 共享运行时工具 |
| `yaml_parser.py` | 统一 YAML 解析 |
| `rule-loader.sh` | 动态规则加载 |

### 环境变量

| 变量 | 默认值 |
|------|--------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/.library` |

---

## 相关项目

- [ai-cli-online](https://github.com/huacheng/ai-cli-online) — 网页界面，含 Plan 批注面板

## 许可证

MIT

---
*task-ai v0.9.7 — 自进化任务生命周期管理*
