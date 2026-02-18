# Test Criteria: notebook (Plan Phase)

## Acceptance Criteria

1. **AC-1**: 能在浏览器中创建新的 notebook，添加 prompt cell 和 markdown cell
2. **AC-2**: 执行 prompt cell 时，Claude Agent SDK 的响应实时流式显示
3. **AC-3**: notebook 可保存为 `.notebook.json` 文件，重新打开后内容完整
4. **AC-4**: notebook 可导出为自包含 HTML 文件，用浏览器直接打开可查看
5. **AC-5**: HTML 文件在另一台运行 server 的机器上可触发重放执行

## Per-Step Test Cases

### Step 1: 项目脚手架
- [ ] `pnpm install` 成功，无错误
- [ ] `pnpm dev` 启动前后端 dev server
- [ ] TypeScript 编译无错误

### Step 2: 共享数据模型
- [ ] 类型定义编译通过
- [ ] Notebook JSON schema 可序列化/反序列化
- [ ] WebSocket 消息类型完整覆盖所有交互场景

### Step 3: 后端 Agent 服务
- [ ] WebSocket 服务启动并接受连接
- [ ] 发送 execute_request 后收到流式 cell_output 消息
- [ ] execution_complete 消息包含 cost 和 duration
- [ ] notebook 文件可保存和加载

### Step 4: 前端 Notebook UI
- [ ] Cell 可添加、删除、上下移动
- [ ] prompt cell 输入后按 Shift+Enter 触发执行
- [ ] 输出流式渲染，包含文本、工具调用、工具结果
- [ ] markdown cell 可编辑和预览

### Step 5: HTML 导出
- [ ] 导出的 HTML 文件 < 10MB (典型 notebook)
- [ ] HTML 文件可直接在浏览器中打开，显示所有 cell 和输出
- [ ] CSS/JS/数据全部内联，无外部依赖
- [ ] notebook JSON 数据正确嵌入 HTML

### Step 6: 重放引擎
- [ ] HTML 文件中的重放按钮可连接到指定 server
- [ ] 重放按顺序执行所有 prompt cell
- [ ] 重放输出实时更新到 HTML 页面
- [ ] 重放完成后可再次导出新 HTML

### Step 7: 集成测试
- [ ] 端到端工作流: 创建 -> 编辑 -> 执行 -> 保存 -> 导出 -> 重放
- [ ] 错误场景: server 断开、API key 无效、执行超时
