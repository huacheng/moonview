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

### task-ai (v0.9.12)

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
- **经验 → 技能提升**：已验证经验通过四级信任流水线（T1→T2→T3→T4）自动转化为可复用技能
- **动态维度适配**：审查权重根据任务类型自动调整
- **规则进化闭环**：外部威胁情报自动转化为活跃安全规则
- **定时维护**：cron 驱动的自动化过期检查、技能验证和安全规则演化

---

## 二、核心概念

### 任务即 Notebook
每个任务绑定独立的 Notebook 结构：
- `.target.md` — 递进式目标（支持多阶段）
- `.plan.md` — 实施计划（含 VH 存根）
- `.working/` — 执行产物和状态
- `.analysis/` — 六维审查报告

### 共享知识库
跨任务知识库位于 `$NB_WORKSPACES_LIBRARY/`：
- `.memory/.references/` — 已验证的外部知识
- `.memory/.experiences/` — 蒸馏后的任务洞察
- `.skills/` — 三级技能目录（`.candidates/` → `.drafts/` → `.active/`）
- `.changelog` — 仅追加审计日志

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
| `library` | 知识库管理与定时维护 |

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

所有晋升完全由 LLM 自动化驱动 — 无需人工审核。

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

cron 驱动的自动化维护，每日执行四项检查：

| 检查项 | 频率 | 说明 |
|--------|------|------|
| 过期检查 | 24h | 标记超过 30 天的引用文件 |
| T3→T4 验证 | 24h | 自动晋升满足生产标准的技能 |
| 安全规则演化 | Core: 7d / Extended: 1d | 扫描威胁、同步演化规则 |
| Changelog 体积 | 24h | 超过 2000 行时告警 |

```bash
# 自动配置 cron（每天 03:00，路径版本无关）
/task-ai:library maintain --install-cron

# 移除 cron 条目
/task-ai:library maintain --uninstall-cron
```

---

## 六、运行时基础设施

### 核心模块

| 模块 | 职责 |
|------|------|
| `state.py` | 状态机（原子锁） |
| `frontmatter.py` | SKILL.md 和经验文件的 frontmatter 解析 |
| `lib.sh` | 共享运行时工具 |
| `rebuild-index.py` | `.memory/` 和 `.skills/` 索引构建器 |
| `core-rule-auto.sh` | 安全规则 LLM 驱动演化流水线 |
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
*task-ai v0.9.12 — 自进化任务生命周期管理*
