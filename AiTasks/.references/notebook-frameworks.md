# Web Notebook 框架对比

## 与目标最相关的方案

### Observable Notebooks 2.0

- **文件格式**: 基于 HTML 的人类可读格式
- **Cell 类型**: JavaScript (expression/program)、Markdown、HTML
- **反应式**: 类似电子表格，变量变化自动重新运行
- **导出**: 静态 HTML (只存源码不存输出)，浏览器中执行 JS
- **关键特性**: 人类可读的 HTML 格式，适合 git diff

### marimo

- **WASM 导出**: 完全自包含、可在浏览器中执行的 HTML
- **静态 HTML 导出**: 执行后保存输出为 HTML
- **Islands**: 可嵌入现有 HTML 的交互式代码块
- **关键特性**: 最接近"可共享+可重放"的目标

### Scribbler

- **纯浏览器**: 无后端，JS 在浏览器中执行
- **Cell**: doc (HTML/markdown) + code (JavaScript)
- **关键特性**: 最简单的自包含 notebook 实现

### JupyterLite

- **架构**: JupyterLab 组件 + WebAssembly 内核
- **部署**: 静态文件站点
- **关键特性**: 完整 Jupyter 体验，无需服务器

### Starboard Notebook

- **浏览器原生** notebook 运行时
- TypeScript 实现
- 可移植、可扩展

## 对我们项目的启示

1. **marimo 的 WASM 模式** 最接近目标：自包含 HTML + 可重放
2. **Observable 2.0 的 HTML 格式** 是最好的文件格式参考
3. 我们的"kernel"不是 Python 而是 Claude Agent SDK，需要服务端
4. HTML 文件应包含：cell 源码、输出快照、重放所需的元数据

## Sources

- https://observablehq.com/notebook-kit/system-guide
- https://docs.marimo.io/guides/exporting/
- https://github.com/gopi-suvanam/scribbler
- https://github.com/jupyterlite/jupyterlite
