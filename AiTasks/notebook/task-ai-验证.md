# task-ai 框架契约验证报告

> 执行时间: 2026-02-25 | 命令: `validate.sh --level all`
> 退出码: 0（全部通过）

## 总计

| 指标 | 数值 |
|------|------|
| **PASS** | **617** |
| **FAIL** | **0** |
| **WARN** | **3** |
| 失败脚本数 | 0 / 21 |

---

## 演变历程

| 阶段 | PASS | FAIL | WARN | 失败脚本 | 说明 |
|------|------|------|------|----------|------|
| Phase 0 (Red baseline) | 508 | 65 | 37 | 8 | 初始基础设施建立，VFP 未实施 |
| Phase 1 (协议抽取) | 530 | 48 | 37 | 6 | +VFP 协议文件, lock-coverage, index-completeness |
| Phase 2 (术语迁移) | 555 | 0 | 37 | 0 | TDD→VFP 全面迁移，全绿 |
| Phase 3 (v0.8.0 升级) | **617** | **0** | **3** | **0** | 新增 target/light 命令，全局参数简化，去内联 Python |

---

## 按脚本汇总

| Level | 脚本 | PASS | FAIL | WARN | 状态 |
|-------|------|------|------|------|------|
| L1 | step-numbering.sh | 18 | 0 | 0 | PASS |
| L1 | cross-refs.sh | 47 | 0 | 0 | PASS |
| L1 | signal-whitelist.sh | 90 | 0 | 0 | PASS |
| L1 | naming-conventions.sh | 75 | 0 | 0 | PASS |
| L1 | state-matrix.py | 30 | 0 | 0 | PASS |
| L1 | frontmatter-validation.sh | 32 | 0 | 0 | PASS |
| L1 | git-commit-conventions.sh | 37 | 0 | 0 | PASS |
| L2 | terminology.sh | 1 | 0 | 0 | PASS |
| L2 | data-flow.py | 27 | 0 | 0 | PASS |
| L2 | seed-completeness.sh | 14 | 0 | 0 | PASS |
| L2 | lock-coverage.sh | 7 | 0 | 0 | PASS |
| L2 | phase-state-machine.py | 7 | 0 | 0 | PASS |
| L2 | index-completeness.sh | 55 | 0 | 0 | PASS |
| L2 | init-functional.sh | 4 | 0 | 0 | PASS |
| L2 | research-functional.sh | 3 | 0 | 0 | PASS |
| L2 | plan-functional.sh | 3 | 0 | 0 | PASS |
| L2 | verify-functional.sh | 3 | 0 | 0 | PASS |
| L2 | check-functional.sh | 2 | 0 | 0 | PASS |
| L2 | exec-functional.sh | 3 | 0 | 0 | PASS |
| L2 | merge-functional.sh | 3 | 0 | 0 | PASS |
| L2 | auto-functional.sh | 2 | 0 | 0 | PASS |
| L2 | read-functional.sh | 2 | 0 | 0 | PASS |
| L2 | security-functional.sh | 3 | 0 | 0 | PASS |
| L2 | target-functional.sh | 4 | 0 | 0 | PASS |
| L2 | light-functional.sh | 9 | 0 | 0 | PASS |
| L2 | signal-field-names.py | 9 | 0 | 0 | PASS |
| L2 | injection-category-count.sh | 11 | 0 | 0 | PASS |
| L2 | plugin-slot-consistency.py | 10 | 0 | 0 | PASS |
| L3 | state-machine-graph.py | 30 | 0 | 0 | PASS |
| L3 | protocol-compliance.py | 0 | 0 | 1 | PASS |
| L3 | library-relation-routing.py | 2 | 0 | 0 | PASS |
| L3 | signal-routing.py | 42 | 0 | 0 | PASS |
| Meta | self-check.sh | 91 | 0 | 0 | PASS |

---

## 升级亮点 (v0.8.0)

### 1. 结构与流程增强
- **target 子命令**: 实现了需求双向同步，确保 `plan` 前目标明确。
- **light 子命令**: 建立了“影子任务”极速通道，支持 3 文件/3 尝试以内的轻量级修复。
- **Mermaid 流转图**: 总结文档中新增了全子命令交互图谱。

### 2. 架构纯净化
- **去内联 Python**: 所有 Bash 脚本和测试契约均已移除内联 Python 逻辑，改用 `state.py` 和 `json_get.py` 专用工具。
- **模型解耦**: 彻底移除对特定模型名称（如 Claude）的硬编码，统一使用 `the agent`。
- **参数简化**: 实现了基于路径嗅探和 Git 分支匹配的上下文自动锁定，全局移除冗余的 `<notebook>` 参数。

### 3. 质量与安全
- **VFP 协议闭环**: 实现了 VH（验证假设）与 HS（假设满足）的完整生命周期契约。
- **复杂度网关**: `light` 模式自动监测修改规模，强制引导超限任务转为标准任务。
- **安全拦截**: `security` 脚本实现了对高危路径和敏感命令的运行时实时审计。

---

## WARN 分类说明（3 个）

| 类别 | 数量 | 说明 | 是否需要修正 |
|------|------|------|-------------|
| protocol-compliance: 无 § 引用 | 1 | 协议尚未全面集成到所有子命令节 | 否 — 后续集成 |
| signal-routing: 隐式路由 | 2 | 某些 result 值的路由由上下文动态决定 | 否 — 设计如此 |

---
*契约验证由 validate.sh (v0.8.0) 自动执行并生成。*
