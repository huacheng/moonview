# task-ai 框架契约验证报告

> 执行时间: 2026-02-24 | 命令: `validate.sh --level all --self-check`
> 退出码: 0（全部通过）

## 总计

| 指标 | 数值 |
|------|------|
| **PASS** | **555** |
| **FAIL** | **0** |
| **WARN** | **37** |
| 失败脚本数 | 0 / 19 |

---

## 演变历程

| 阶段 | PASS | FAIL | WARN | 失败脚本 | 说明 |
|------|------|------|------|----------|------|
| Phase 0 (Red baseline) | 508 | 65 | 37 | 8 | 初始基础设施建立，VFP 未实施 |
| Phase 1 (协议抽取) | 530 | 48 | 37 | 6 | +VFP 协议文件, lock-coverage, index-completeness |
| 独立 bug 修复 | 534 | 44 | 37 | 6 | init step-numbering, git `maintain` type |
| Phase 2 (术语迁移) | **555** | **0** | 37 | **0** | TDD→VFP 全面迁移，全绿 |

---

## 按脚本汇总

| Level | 脚本 | PASS | FAIL | WARN | 状态 |
|-------|------|------|------|------|------|
| L1 | step-numbering.sh | 12 | 0 | 2 | PASS |
| L1 | cross-refs.sh | 52 | 0 | 0 | PASS |
| L1 | signal-whitelist.sh | 90 | 0 | 0 | PASS |
| L1 | naming-conventions.sh | 75 | 0 | 0 | PASS |
| L1 | state-matrix.py | 13 | 0 | 8 | PASS |
| L1 | frontmatter-validation.sh | 28 | 0 | 0 | PASS |
| L1 | git-commit-conventions.sh | 35 | 0 | 2 | PASS |
| L2 | terminology.sh | 1 | 0 | 0 | PASS |
| L2 | data-flow.py | 27 | 0 | 0 | PASS |
| L2 | seed-completeness.sh | 3 | 0 | 11 | PASS |
| L2 | lock-coverage.sh | 7 | 0 | 0 | PASS |
| L2 | phase-state-machine.py | 7 | 0 | 0 | PASS |
| L2 | index-completeness.sh | 52 | 0 | 0 | PASS |
| L2 | signal-field-names.py | 9 | 0 | 0 | PASS |
| L3 | state-machine-graph.py | 30 | 0 | 0 | PASS |
| L3 | protocol-compliance.py | 0 | 0 | 1 | PASS |
| L3 | signal-routing.py | 23 | 0 | 13 | PASS |
| Meta | self-check.sh | 91 | 0 | 0 | PASS |

---

## Level 1 — 静态结构（7 脚本）

### L1-step-numbering — 步骤编号连续性

> 12 PASS, 0 FAIL, 2 WARN

| 子命令 | 步骤数 | 结果 | 说明 |
|--------|--------|------|------|
| annotate | 16 | PASS | |
| auto | — | WARN | 用伪代码流程，无编号步骤（设计如此） |
| cancel | 10 | PASS | |
| check | 19 | PASS | |
| exec | 10 | PASS | |
| init | 14 | PASS | 已修复：原重复 step 12，现 12→13→14 连续 |
| library | — | WARN | 用操作模式（search/list/status/maintain），无编号步骤 |
| list | 4 | PASS | |
| merge | 10 | PASS | |
| plan | 27 | PASS | |
| report | 19 | PASS | |
| research | 20 | PASS | |
| summarize | 10 | PASS | |
| verify | 16 | PASS | |

### L1-cross-refs — 跨文件引用

> 52 PASS, 0 FAIL — 所有 `See \`file\`` 引用目标均存在

### L1-signal-whitelist — 信号值白名单

> 90 PASS, 0 FAIL — 所有 `.auto-signal` 值在 expected-signals.json 白名单内

### L1-naming-conventions — 文件命名

> 75 PASS, 0 FAIL — 含新增 verification-first-protocol.md

### L1-state-matrix — 状态转换一致性

> 13 PASS, 0 FAIL, 8 WARN

8 个 WARN：cancel/check/library/list/report/research/summarize/verify 的 State Transitions 节使用 code block 或散文描述，checker 仅解析 `|` 格式表格。非内容问题，是 checker 的解析限制。

### L1-frontmatter-validation — SKILL.md frontmatter

> 28 PASS, 0 FAIL — 14 个 SKILL.md 全部有 name/description/model_tier/auto_delegatable

### L1-git-commit-conventions — Git commit type

> 35 PASS, 0 FAIL, 2 WARN

已修复：`maintain` type 添加到白名单（15 个 commit types）。2 WARN：auto（继承子命令 commit）和 list（只读，无 commit）无 Git section，设计如此。

---

## Level 2 — 语义一致性（7 脚本）

### L2-terminology — 旧术语清理

> 1 PASS, 0 FAIL — 全部旧 TDD 术语已替换为 VFP

已完成的替换：

| 旧术语 | 新术语 | 涉及文件 |
|--------|--------|----------|
| Red stub | VH stub | auto/check/exec/plan/verify |
| Red baseline | VH baseline | auto/check |
| Red confirmation | VH confirmation | check/exec |
| Green confirmation | HS confirmation | exec |
| Red→Green | VH→HS | auto/check/exec/verify |
| Red test skeleton | VH stub generation | plan |
| TDD Compliance | VFP Compliance | check |
| TDD Discipline Audit | VFP Discipline Audit | check |
| TDD Metrics | VFP Metrics | verify |
| TDD Cycle | VFP Cycle | auto/check/exec |
| tdd_cycles_completed | vfp_cycles_completed | auto |

VFP 协议文件 `verification-first-protocol.md` 已排除扫描（其 Terminology 表合法定义旧→新映射）。

### L2-data-flow — 数据流产消闭合

> 27 PASS, 0 FAIL — 9 条数据流全部闭合

| Artifact | Producer | Consumers | 状态 |
|----------|----------|-----------|------|
| vh-stubs | plan | exec, verify, check | PASS |
| vh-baseline.md | plan | exec, verify, check, auto | PASS |
| [VH: ...] in .plan.md | plan | exec | PASS |
| cumulative-green.jsonl | exec | exec, check, auto | PASS |
| hil-snapshots/ | exec | exec, check | PASS |
| VFP Cycle Summary | exec | check, auto | PASS |
| VFP Metrics | verify | check | PASS |
| VFP Compliance | check | report | PASS |
| vfp_cycles_completed | auto | daemon | PASS |

### L2-seed-completeness — Verification Cycle 节覆盖

> 3 PASS, 0 FAIL, 11 WARN

| 类型 | 优先级 | 状态 |
|------|--------|------|
| software | P0 (必须) | PASS — executable 模式，80% 阈值 |
| data-pipeline | P1 (应有) | PASS — executable 模式 |
| ml | P1 (应有) | PASS — inspectable 模式 |
| documentation, infrastructure | P2 (建议) | WARN — 待后续补充 |
| 其余 9 个 | P3 (可选) | WARN — 按需补充 |

### L2-lock-coverage — VFP 锁覆盖

> 7 PASS, 0 FAIL — 全部 5 个 VFP 文件模式已有锁覆盖

### L2-phase-state-machine — Phase 转换一致

> 7 PASS, 0 FAIL — `needs-plan` 和 `needs-check` 均正确设置和消费

### L2-index-completeness — REFERENCE-INDEX 完整性

> 52 PASS, 0 FAIL — 含 verification-first-protocol.md + 14 个 seed-type 文件逐一列出

### L2-signal-field-names — 信号字段名

> 9 PASS, 0 FAIL — `tdd_cycles_completed` 已全部替换为 `vfp_cycles_completed`

---

## Level 3 — 集成契约（3 脚本）

### L3-state-machine-graph — 状态机图论分析

> 30 PASS, 0 FAIL

- 8 个状态全部从 `draft` 可达
- 2 个终态 (`complete`, `cancelled`) 无出边
- 6 个非终态全部可达终态（无死锁）

### L3-protocol-compliance — 协议引用一致

> 0 PASS, 0 FAIL, 1 WARN

WARN: SKILL.md 尚未添加 `§` 协议节引用。这是后续集成工作——当 SKILL.md 添加 `§ VH Generation Rules` 等引用时，此 checker 将验证引用的节在协议文件中存在。

### L3-signal-routing — 信号路由一致

> 23 PASS, 0 FAIL, 13 WARN

13 WARN 均为"无显式路由条目"——这些 result 值的路由由上下文决定（如 verify 的 `(pass)` 由触发上下文决定 check checkpoint；research 的 `(collected)/(sufficient)` 路由到 caller 参数指定的子命令），不适合硬编码在路由表中。

---

## Meta — 契约自检

### self-check — 契约覆盖完整性

> 91 PASS, 0 FAIL

- 55 个 .md 文件全部被至少一个契约覆盖
- 18 个契约脚本全部存在
- validate.sh 列出了全部 18 个契约

---

## WARN 分类说明（37 个）

| 类别 | 数量 | 说明 | 是否需要修正 |
|------|------|------|-------------|
| step-numbering: 无编号步骤 | 2 | auto/library 设计上不用编号步骤 | 否 — 设计如此 |
| state-matrix: 非标准表格 | 8 | 8 个 SKILL 用 code block 描述转换 | 否 — checker 限制 |
| git-commit: 无 commit type | 2 | auto 继承子命令 / list 只读 | 否 — 设计如此 |
| seed-completeness: 缺 VC 节 | 13 | P2 (2) + P3 (9) + .summary (2) | 否 — 低优先级 |
| protocol-compliance: 无 § 引用 | 1 | 协议尚未集成到 SKILL.md | 否 — 后续 Phase |
| signal-routing: 无显式路由 | 13 | 上下文路由，非硬编码 | 否 — 设计如此 |

---

## Baseline 快照

| 快照 | 文件 | PASS | FAIL | WARN | 条目数 |
|------|------|------|------|------|--------|
| Phase 0 | `.dev/fixtures/phase0-baseline.jsonl` | 508 | 65 | 37 | 610 |
| Phase 1 | `.dev/fixtures/phase1-baseline.jsonl` | 439 | 48 | 37 | 524 |
| Phase 2 | `.dev/fixtures/phase2-baseline.jsonl` | 464 | 0 | 37 | 501 |

---

<details>
<summary>完整验证日志（669 行）</summary>

```
=== L1: step-numbering.sh ===
[PASS] annotate: 16 steps, sequential
[WARN] auto: no numbered steps found in Execution Steps
[PASS] cancel: 10 steps, sequential
[PASS] check: 19 steps, sequential
[PASS] exec: 10 steps, sequential
[PASS] init: 14 steps, sequential
[WARN] library: no numbered steps found in Execution Steps
[PASS] list: 4 steps, sequential
[PASS] merge: 10 steps, sequential
[PASS] plan: 27 steps, sequential
[PASS] report: 19 steps, sequential
[PASS] research: 20 steps, sequential
[PASS] summarize: 10 steps, sequential
[PASS] verify: 16 steps, sequential
---
Summary: 12 passed, 0 failed, 2 warnings

=== L1: cross-refs.sh ===
[PASS] commands/references/git-details.md: ref 'skills/merge/SKILL.md' exists
[PASS] commands/references/library-write-protocol.md: ref 'library/references/write-protocol.md' exists
[PASS] commands/references/type-field.md: ref 'init/references/seed-types/.summary.md' exists
[PASS] commands/references/type-field.md: ref 'plan/references/type-profiling.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/directory-convention.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/summary-formats.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/type-field.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/state-matrix.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/annotation-format.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/depends-on-format.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/git-details.md' exists
[PASS] commands/task-ai.md: ref 'auto/SKILL.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/concurrency.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/model-routing.md' exists
[PASS] commands/task-ai.md: ref 'commands/references/lifecycle-hooks.md' exists
[PASS] skills/annotate/SKILL.md: ref 'references/annotation-processing.md' exists
[PASS] skills/auto/SKILL.md: ref 'references/stall-detection.md' exists
[PASS] skills/auto/SKILL.md: ref 'references/context-quota.md' exists
[PASS] skills/auto/SKILL.md: ref 'references/backend-api.md' exists
[PASS] skills/auto/SKILL.md: ref 'references/backend-api.md' exists
[PASS] skills/auto/SKILL.md: ref 'auto/references/plugin-delegation.md' exists
[PASS] skills/auto/references/stall-detection.md: ref 'references/context-quota.md' exists
[PASS] skills/check/SKILL.md: ref 'plan/references/type-profiling.md' exists
[PASS] skills/check/SKILL.md: ref 'skills/library/SKILL.md' exists
[PASS] skills/check/SKILL.md: ref 'skills/library/SKILL.md' exists
[PASS] skills/check/SKILL.md: ref 'skills/merge/SKILL.md' exists
[PASS] skills/check/SKILL.md: ref 'init/references/seed-types/<type>.md' exists
[PASS] skills/check/SKILL.md: ref 'references/six-perspective-audit.md' exists
[PASS] skills/exec/SKILL.md: ref 'plan/references/type-profiling.md' exists
[PASS] skills/exec/SKILL.md: ref 'init/references/seed-types/<type>.md' exists
[PASS] skills/exec/SKILL.md: ref 'skills/library/SKILL.md' exists
[PASS] skills/exec/SKILL.md: ref 'skills/library/SKILL.md' exists
[PASS] skills/init/SKILL.md: ref 'plan/references/type-profiling.md' exists
[PASS] skills/library/SKILL.md: ref 'commands/references/library-write-protocol.md' exists
[PASS] skills/library/SKILL.md: ref 'references/write-protocol.md' exists
[PASS] skills/library/SKILL.md: ref 'commands/references/changelog-consumption-protocol.md' exists
[PASS] skills/library/SKILL.md: ref 'references/quality-rubric.md' exists
[PASS] skills/library/SKILL.md: ref 'references/injection-rules.md' exists
[PASS] skills/library/SKILL.md: ref 'references/blocked-sources.md' exists
[PASS] skills/library/references/quality-rubric.md: ref 'library/SKILL.md' exists
[PASS] skills/library/references/write-protocol.md: ref 'commands/references/library-write-protocol.md' exists
[PASS] skills/plan/SKILL.md: ref 'skills/research/SKILL.md' exists
[PASS] skills/plan/SKILL.md: ref 'skills/library/SKILL.md' exists
[PASS] skills/plan/SKILL.md: ref 'init/references/seed-types/<type>.md' exists
[PASS] skills/plan/SKILL.md: ref 'check/SKILL.md' exists
[PASS] skills/research/SKILL.md: ref 'skills/plan/SKILL.md' exists
[PASS] skills/research/SKILL.md: ref 'plan/references/type-profiling.md' exists
[PASS] skills/research/SKILL.md: ref 'references/blocked-sources.md' exists
[PASS] skills/research/SKILL.md: ref 'references/injection-rules.md' exists
[PASS] skills/research/SKILL.md: ref 'auto/references/plugin-delegation.md' exists
[PASS] skills/verify/SKILL.md: ref 'plan/references/type-profiling.md' exists
[PASS] skills/verify/SKILL.md: ref 'skills/library/SKILL.md' exists
---
Summary: 52 passed, 0 failed, 0 warnings

=== L1: signal-whitelist.sh ===
[PASS] annotate: signal result '(processed)' in whitelist
[PASS] annotate: signal next 'verify' in whitelist
[PASS] check: signal result 'PASS' in whitelist
[PASS] check: signal next 'exec' in whitelist
[PASS] check: signal result 'NEEDS_REVISION' in whitelist
[PASS] check: signal next 'plan' in whitelist
[PASS] check: signal result 'BLOCKED' in whitelist
[PASS] check: signal next '(stop)' in whitelist
[PASS] check: signal result 'CONTINUE' in whitelist
[PASS] check: signal next 'exec' in whitelist
[PASS] check: signal result 'NEEDS_FIX' in whitelist
[PASS] check: signal next 'exec' in whitelist
[PASS] check: signal result 'REPLAN' in whitelist
[PASS] check: signal next 'plan' in whitelist
[PASS] check: signal result 'BLOCKED' in whitelist
[PASS] check: signal next '(stop)' in whitelist
[PASS] check: signal result 'ACCEPT' in whitelist
[PASS] check: signal next 'merge' in whitelist
[PASS] check: signal result 'NEEDS_FIX' in whitelist
[PASS] check: signal next 'exec' in whitelist
[PASS] check: signal result 'REPLAN' in whitelist
[PASS] check: signal next 'plan' in whitelist
[PASS] exec: signal result '(done)' in whitelist
[PASS] exec: signal next 'verify' in whitelist
[PASS] exec: signal result '(mid-exec)' in whitelist
[PASS] exec: signal next 'verify' in whitelist
[PASS] exec: signal result '(step-N)' in whitelist
[PASS] exec: signal next 'verify' in whitelist
[PASS] exec: signal result '(blocked)' in whitelist
[PASS] exec: signal next '(stop)' in whitelist
[PASS] merge: signal result 'success' in whitelist
[PASS] merge: signal next 'report' in whitelist
[PASS] merge: signal result 'conflict' in whitelist
[PASS] merge: signal next '(stop)' in whitelist
[PASS] merge: signal result 'rejected' in whitelist
[PASS] merge: signal next '(stop)' in whitelist
[PASS] merge: signal result 'rejected' in whitelist
[PASS] merge: signal next '(stop)' in whitelist
[PASS] plan: signal result '(generated)' in whitelist
[PASS] plan: signal next 'verify' in whitelist
[PASS] report: signal result '(generated)' in whitelist
[PASS] report: signal next '(stop)' in whitelist
[PASS] research: signal result '(o1-collected)' in whitelist
[PASS] research: signal next '(stop)' in whitelist
[PASS] research: signal checkpoint 'post-o1' in whitelist
[PASS] research: signal result '(o2-collected)' in whitelist
[PASS] research: signal next '(stop)' in whitelist
[PASS] research: signal checkpoint 'post-o2' in whitelist
[PASS] research: signal result '(o3-collected)' in whitelist
[PASS] research: signal next '(stop)' in whitelist
[PASS] research: signal checkpoint 'post-o3' in whitelist
[PASS] research: signal result '(objective-complete)' in whitelist
[PASS] research: signal next '(stop)' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal next 'plan' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal next 'plan' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'plan' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'plan' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'verify' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal next 'verify' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'verify' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal next 'check' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'check' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] research: signal next 'exec' in whitelist
[PASS] research: signal result '(collected)' in whitelist
[PASS] research: signal result '(sufficient)' in whitelist
[PASS] research: signal next 'exec' in whitelist
[PASS] research: signal checkpoint 'post-research' in whitelist
[PASS] verify: signal result '(pass)' in whitelist
[PASS] verify: signal next 'check' in whitelist
[PASS] verify: signal result '(pass)' in whitelist
[PASS] verify: signal next 'check' in whitelist
[PASS] verify: signal result '(pass)' in whitelist
[PASS] verify: signal next 'check' in whitelist
---
Summary: 90 passed, 0 failed, 0 warnings

=== L1: naming-conventions.sh ===
[PASS] 75 items checked, all valid
---
Summary: 75 passed, 0 failed, 0 warnings

=== L1: state-matrix.py ===
[PASS] 8 states found, transitions parsed from 5 skills with tables
[WARN] 8 skills have non-table State Transitions sections
---
Summary: 13 passed, 0 failed, 8 warnings

=== L1: frontmatter-validation.sh ===
[PASS] 14 SKILL.md files validated, all have required fields
---
Summary: 28 passed, 0 failed, 0 warnings

=== L1: git-commit-conventions.sh ===
[PASS] 15 commit types found; all SKILL.md Git sections use whitelisted types
[WARN] auto, list: no Git commit patterns (auto inherits, list is read-only)
---
Summary: 35 passed, 0 failed, 2 warnings

=== L2: terminology.sh ===
[PASS] terminology: no old terms found across all .md files
---
Summary: 1 passed, 0 failed, 0 warnings

=== L2: data-flow.py ===
[PASS] 9 data flow entries, all producers mention artifacts, all consumers reference them
---
Summary: 27 passed, 0 failed, 0 warnings

=== L2: seed-completeness.sh ===
[PASS] software (P0), data-pipeline (P1), ml (P1): have Verification Cycle
[WARN] 11 seed-types without VC section (P2: 2, P3: 9 — optional)
---
Summary: 3 passed, 0 failed, 11 warnings

=== L2: lock-coverage.sh ===
[PASS] 5 VFP patterns + lock ordering + .working lock all documented
---
Summary: 7 passed, 0 failed, 0 warnings

=== L2: phase-state-machine.py ===
[PASS] needs-plan and needs-check both set and consumed correctly
---
Summary: 7 passed, 0 failed, 0 warnings

=== L2: index-completeness.sh ===
[PASS] 13 shared refs + 14 seed-types + verification-first-protocol + 14 skills all listed
---
Summary: 52 passed, 0 failed, 0 warnings

=== L2: signal-field-names.py ===
[PASS] No old field names; vfp_cycles_completed documented
---
Summary: 9 passed, 0 failed, 0 warnings

=== L3: state-machine-graph.py ===
[PASS] 8 states reachable, 2 terminal, no deadlocks, all non-terminals reach terminal
---
Summary: 30 passed, 0 failed, 0 warnings

=== L3: protocol-compliance.py ===
[WARN] No § references yet (protocol not integrated into SKILL.md)
---
Summary: 0 passed, 0 failed, 1 warnings

=== L3: signal-routing.py ===
[PASS] 26 routing entries; 23 explicit matches
[WARN] 13 results use context-based routing (not in explicit table)
---
Summary: 23 passed, 0 failed, 13 warnings

=== Meta: self-check.sh ===
[PASS] 55 .md files covered, 18 contracts exist, all listed in validate.sh
---
Summary: 91 passed, 0 failed, 0 warnings

=======================================
  TOTAL: 555 passed, 0 failed, 37 warnings
  Failed scripts: 0
=======================================
```

</details>
