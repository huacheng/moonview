# Research Notes: Plan Phase

## 关键发现

### Claude Agent SDK
- 包名: `@anthropic-ai/claude-agent-sdk` (TypeScript)
- 核心 API: `query()` 返回 async generator，流式传输 SDKMessage
- 支持 `bypassPermissions` 模式用于服务端自动化
- 支持 `includePartialMessages` 获取 token 级流式
- 支持 `resume` 恢复会话、`maxBudgetUsd` 预算控制
- 内置工具: Read, Write, Edit, Bash, Glob, Grep, WebSearch 等

### Jupyter 架构启示
- .ipynb 是简单的 JSON 格式（cells + outputs + metadata）
- MIME bundle 模式优雅且可扩展（多种格式的同一输出）
- Server 作为 broker：前端和 kernel 不直接通信
- nbconvert 的 HTML 导出：图片默认 base64，CSS/JS 内联

### 可参考的框架
- **marimo**: WASM 导出最接近目标，自包含+可重放
- **Observable 2.0**: HTML 文件格式作为 notebook 格式
- **Scribbler**: 纯浏览器执行，最简单的实现

### 关键设计决策
1. **Notebook 格式选 JSON** (.notebook.json)：类似 .ipynb，比 HTML 格式更适合版本控制
2. **HTML 导出是衍生产物**：从 JSON 生成，嵌入数据+重放引擎
3. **重放需要 server**：因为 Claude API 调用需要在服务端完成
4. **WebSocket 通信**：Agent SDK 的流式输出通过 WebSocket 转发给浏览器
