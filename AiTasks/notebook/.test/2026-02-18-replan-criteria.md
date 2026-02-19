# Test Criteria: notebook (Re-Plan Phase)

## Acceptance Criteria

1. **AC-1**: 浏览器中可创建 notebook，添加 prompt/markdown/visualization cell
2. **AC-2**: 执行 prompt cell 时，Claude Code (tmux) 的响应实时流式显示（文本、工具调用、思考过程）
3. **AC-3**: notebook 可保存为 `.notebook.json`，重新打开后内容完整
4. **AC-4**: 每个 cell 执行后自动产生 git commit，前端可查看 diff
5. **AC-5**: notebook 可导出为自包含 HTML 文件，含 Notebook + Slide 双 Tab
6. **AC-6**: HTML 文件在另一台运行 server 的机器上可触发重放执行
7. **AC-7**: d3.js 图表在 cell 输出中正确渲染，HTML 导出后仍可交互
8. **AC-8**: Notebook 可一键生成 Slide (reveal.js)

## Per-Step Test Cases

### Step 1: 项目脚手架
- [ ] `pnpm install` 成功
- [ ] `pnpm dev` 启动前后端 dev server
- [ ] TypeScript 编译无错误

### Step 2: 共享数据模型
- [ ] Zod schema 可验证 notebook JSON
- [ ] WebSocket 消息类型覆盖所有交互场景
- [ ] Notebook JSON 可序列化/反序列化

### Step 3: tmux 会话管理
- [ ] `TmuxSession.start()` 成功创建 tmux 会话并启动 Claude Code
- [ ] `TmuxSession.sendPrompt()` 通过 send-keys 注入 prompt，Claude 正确接收并处理
- [ ] `JsonlWatcher` 正确捕获 JSONL 新消息（文本、工具调用、工具结果）
- [ ] Stop hook 在 Claude 回复完成后写入标记文件
- [ ] `TmuxSession.stop()` 正确清理会话

### Step 4: WebSocket 服务 + 持久化
- [ ] WebSocket 连接建立，前端发送 execute_request 后收到流式 cell_output
- [ ] execution_complete 消息在 Stop hook 触发后发送
- [ ] notebook 文件可保存和加载
- [ ] REST API: 文件列表、notebook 元数据

### Step 5: 前端 Notebook UI
- [ ] Cell 可添加、删除、拖拽排序
- [ ] prompt cell: Shift+Enter 触发执行
- [ ] 输出流式渲染：文本（Markdown）、工具调用（折叠）、思考过程（折叠）
- [ ] markdown cell: 编辑/预览切换
- [ ] Toolbar 文件操作正常

### Step 6: Git 集成
- [ ] Cell 执行完成后自动 git commit
- [ ] commit message 包含 cell ID 和 prompt 摘要
- [ ] 前端 GitDiffView 正确显示 unified diff
- [ ] 中间 md 文件内容嵌入 notebook JSON

### Step 7: HTML 导出
- [ ] 导出 HTML < 5MB（不含语音批注的典型 notebook）
- [ ] HTML 文件浏览器打开，双 Tab 切换正常
- [ ] Notebook Tab: 所有 cell + 输出 + diff + 批注正确显示
- [ ] Slide Tab: reveal.js 正确渲染
- [ ] notebook JSON 数据正确嵌入
- [ ] CSS/JS/d3.js/reveal.js 全部内联

### Step 8: Slide 生成
- [ ] 一键从 notebook 生成 Slide sections
- [ ] 每个 prompt cell 对应一个 Slide section
- [ ] Slide 可再编辑（修改标题、调整顺序）
- [ ] reveal.js embedded 模式正确运行

### Step 9: 重放引擎
- [ ] HTML 文件中重放按钮可连接到指定 server
- [ ] 重放按顺序执行所有 prompt cell
- [ ] 重放输出实时更新到 HTML
- [ ] 重放产生新的 git commit

### Step 10: 批注系统
- [ ] 可对 cell 输出添加文本批注
- [ ] 语音批注: MediaRecorder 录制 + base64 编码
- [ ] 语音批注可回放 (Audio 元素)
- [ ] 批注随 HTML 导出保留

### Step 11: 集成测试
- [ ] 端到端: 创建 → 编辑 → 执行 → commit → 导出 → 重放
- [ ] 错误场景: tmux 断开重连、WebSocket 断连、Claude 超时
