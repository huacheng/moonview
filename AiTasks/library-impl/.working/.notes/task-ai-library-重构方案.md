# Library 子命令技术实现方案 (方案 B)

## 1. 存储架构
- **仓库类型**：独立 Git 仓库，路径 `$NB_WORKSPACES_ROOT/.library/`。
- **元数据**：
    - `.master-index.md`：全局扁平索引。
    - `.relations.jsonl`：派生关系图（邻接表格式）。
    - `.changelog`：追加式写入流水。

## 2. 核心逻辑实现 (CQRS 读写分离)

### A. 写入协议 (Write Path)
所有 Skill (`research`, `report`, `exec` 等) 写入 Library 时必须执行：
... (保持原协议步骤) ...

### B. 查询引擎 (Query Path - 引擎无关性)
`library search` 由 AI Agent (Gemini/Claude 等) 直接驱动：
1. **关键字层 (Layer 1)**：Agent 使用 `grep` 搜索 `.master-index.md` 进行初步定位。
2. **关系层 (Layer 1.5)**：Agent 使用 `grep` 扫描 `.relations.jsonl` 寻找关联边（邻接节点）。
3. **语义选择**：Agent 综合上述结果，利用其语义理解力挑选最相关的 3-5 个 `.md` 文件。

### C. 维护引擎 (Maintenance Path - 静态审计)
`library maintain --rebuild-relations`：
1. 生成 Python 维护脚本。
2. 扫描 `.changelog` 提取交互关系，扫描 Frontmatter 提取属性关系。
3. **防御性审计**：在全量扫描时，执行统一的注入风险复核，作为 `research` 动态检测后的最后一道静态防线。
4. 计算权重并重建 `.relations.jsonl`。

## 3. 索引双轨制 Rationale
- **.master-index.md**：解决“从无到有”的关键字发现问题。
- **.relations.jsonl**：解决“从 A 到 B”的上下文联想问题。

## 4. 迁移计划
1.  **Phase 1**：实现仓库初始化与 `library_commit` 工具。
2.  **Phase 2**：实现 `maintain` 基础逻辑与索引重建。
3.  **Phase 3**：实现 `search` 的三层检索策略。
4.  **Phase 4**：集成方案 B 的关系生成逻辑。
