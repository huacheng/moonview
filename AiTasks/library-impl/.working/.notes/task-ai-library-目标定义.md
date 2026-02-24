# Task Target: Library 子命令实现

## 核心目标
实现 `task-ai` 的 `library` 子命令，建立全局共享的、基于独立 Git 仓库的知识管理系统。

## 关键需求
1.  **独立仓库支持**：
    - 实现在 `$NB_WORKSPACES_ROOT/.library/` 下自动初始化 Git 仓库。
    - 实现 `library_commit` 协议，确保知识提交不干扰项目主仓库。
2.  **四项核心操作**：
    - `search`：实现基于关键字匹配与关系联想的 Layer 1/2 搜索。
    - `list`：展示 Reference、Experience、Pattern 和 Type Profile 的清单。
    - `status`：审计图书馆健康度、一致性与知识过时（Staleness）情况。
    - `maintain`：实现全量索引重建与 `.changelog` 压缩。
3.  **轻量级关系索引 (方案 B)**：
    - 在 `maintain` 中通过 Python 脚本生成 `.relations.jsonl`。
    - 支持通过 `grep` 实现的高效三元组查询。
4.  **注入保护**：
    - 实现对外部 Reference 的 10 类攻击检测与过滤。

## 验收标准
- [ ] 成功执行 `library maintain --init` 初始化独立仓库。
- [ ] 能够通过 `library search` 跨项目找回历史经验。
- [ ] `.relations.jsonl` 能够正确记录 Reference 与 Task 的关联。
- [ ] 所有的写操作必须遵循六步写协议（Atomic Write + Lock）。
