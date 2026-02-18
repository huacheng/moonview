# Claude Agent SDK

## Overview

Claude Code SDK 已重命名为 Claude Agent SDK，提供与 Claude Code 相同的工具、代理循环和上下文管理能力，可在 Python 和 TypeScript 中编程使用。

## Package Names

- **TypeScript:** `@anthropic-ai/claude-agent-sdk` (npm)
- **Python:** `claude-agent-sdk` (PyPI)

## Core API: `query()`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Review utils.py for bugs",
  options: {
    allowedTools: ["Read", "Edit", "Glob"],
    permissionMode: "acceptEdits"
  }
})) {
  // messages stream as agent works
}
```

## Key Options

| Property | Type | Description |
|----------|------|-------------|
| `allowedTools` | `string[]` | 可用工具列表 |
| `permissionMode` | `string` | `"default"` / `"acceptEdits"` / `"bypassPermissions"` |
| `cwd` | `string` | 工作目录 |
| `systemPrompt` | `string` | 自定义系统提示 |
| `maxTurns` | `number` | 最大对话轮次 |
| `maxBudgetUsd` | `number` | 预算上限 |
| `mcpServers` | `Record` | MCP 服务器连接 |
| `agents` | `Record` | 子代理定义 |
| `hooks` | `Record` | 生命周期回调 |
| `outputFormat` | `object` | 结构化输出 (JSON schema) |
| `includePartialMessages` | `boolean` | token级流式 |
| `resume` | `string` | 恢复会话 |

## Built-in Tools

Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, NotebookEdit, Task, AskUserQuestion

## Message Types

- `SDKSystemMessage` - 初始化 (session_id, tools, model)
- `SDKAssistantMessage` - Claude 响应 (text + tool_use)
- `SDKResultMessage` - 最终结果 (success/error, cost, duration)
- `SDKPartialAssistantMessage` - 流式 token

## Headless Mode (CLI)

```bash
claude -p "prompt" --output-format json --allowedTools "Bash,Read,Edit"
```

## Sources

- https://platform.claude.com/docs/en/agent-sdk/overview
- https://platform.claude.com/docs/en/agent-sdk/typescript
- https://platform.claude.com/docs/en/agent-sdk/quickstart
