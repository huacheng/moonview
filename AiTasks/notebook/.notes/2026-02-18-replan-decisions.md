# Research Notes: Re-Plan Decisions

## 架构方案演变

### Agent SDK → 放弃
- 仅支持 API key，不支持 Pro/Max 订阅
- Issue #559 (Python), Issue #11 (TypeScript) 确认

### claude -p 子进程 → 备选
- 单次执行后退出，~12s 冷启动开销
- `--resume <session_id>` 可恢复上下文但需全量 token 重发
- `--output-format stream-json` 提供干净 JSON 输出
- `--input-format stream-json` 可常驻但有已知 bug (#25629, #5034)

### tmux + 交互模式 → 推荐
- 常驻进程，零 cell 间启动开销
- `tmux send-keys` 在 PTY 层注入，触发 Ink onSubmit
- 输出通过 JSONL 文件监控获取（不解析终端 ANSI）
- Stop hook 作为完成信号
- 社区验证: ccbot, claudecode-telegram, claude_code_agent_farm

## 新增技术决策

### Slide 框架: reveal.js
- `embedded: true` 模式可嵌入现有页面的 div
- Markdown plugin 自动解析 `---` 分隔符
- CDN bundle 可内联到 HTML

### 可视化: d3.js v7
- `d3.create("svg")` + `.node()` 模式插入 DOM
- SVG 可通过 XMLSerializer 导出为字符串内联
- Observable Plot 作为高层替代方案

### Git: simple-git
- 最流行的 Node.js git 库（~8M 周下载）
- 需要 git 二进制，但服务器环境必备
- async/await API

### 语音批注: MediaRecorder + Web Speech API
- MediaRecorder: 录制 audio blob → base64 编码嵌入 HTML
- SpeechRecognition: 实时转文字（仅 Chrome/Edge）
- 30 秒语音 ~480KB base64

## 参考项目: ai-cli-online
- github.com/huacheng/ai-cli-online
- 生产级 tmux + node-pty + WebSocket 架构
- 268 commits, v3.0.20, MIT
- 后端架构可直接参考，前端差异在于终端透传 vs Notebook UI
