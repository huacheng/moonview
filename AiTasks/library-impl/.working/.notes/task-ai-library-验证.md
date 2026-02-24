# Library 子命令验证方案

## 1. 框架契约验证 (基于 validate.sh 分级)

按照 `task-ai` 的标准契约，执行以下分级校验：

### L1: 基础规范与 Git 契约
- [ ] **L1:naming-conventions**：验证 `.library` 下的所有文件遵循 kebab-case 命名。
- [ ] **L1:frontmatter-validation**：验证所有 `.md` 文件包含必要的 `fetched_at`, `indexed_at`, `last_verified_at` 字段。
- [ ] **L1:git-commit-conventions**：验证 library 仓库的提交信息符合 `task-ai(<notebook>):<type> <desc>` 格式。

### L2: 并发、索引与数据流
- [ ] **L2:lock-coverage**：模拟并发写入，验证 `.lock` 文件的创建、竞争与清理逻辑。
- [ ] **L2:index-completeness**：执行 `maintain --rebuild-index` 后，验证 `.master-index.md` 与物理文件的一致性。
- [ ] **L2:data-flow**：验证从 `research` (获取) -> `library` (存储) -> `report` (提炼) 的完整数据流。

### L3: 协议合规与关系路由
- [ ] **L3:protocol-compliance**：验证 Library Write Protocol 的六步原子性。
- [ ] **L3:relation-routing**：验证 `.relations.jsonl` 中的多跳关系是否能被正确的 Grep 路径解析。

## 2. 自动化回归测试要求

采用 `validate.sh` 的逻辑进行回归检测：
1. **快照生成**：在 Phase 1 完成后生成基础 `snapshot.jsonl`。
2. **状态对比**：每次执行 `exec` 或 `merge` 后，运行 `./validate.sh --regression snapshot.jsonl`。
3. **回归判定**：禁止任何已通过（PASS）的契约项在后续更新中转为失败（FAIL）。

## 3. 业务逻辑专项验证 (方案 B)

- [ ] **测试用例 3.1**：模拟不同任务使用同一 Reference，检查关系权重 `w` 的累加逻辑。
- [ ] **测试用例 3.2**：验证 `grep` 联想查询——搜 A 是否能通过边发现强相关的 B。

## 4. 防御性审计验证 (注入保护)

- [ ] **测试用例 4.1**：执行 `maintain --rebuild-relations`，验证其对库中历史文件的“扫描审计”能力，识别漏检的注入风险。
