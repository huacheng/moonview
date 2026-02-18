# Jupyter Notebook 格式 (.ipynb) & 架构

## .ipynb 文件格式

JSON 文件，nbformat v4.5。

### 顶层结构

```json
{
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": { "kernelspec": {...}, "language_info": {...} },
  "cells": [...]
}
```

### Cell 类型

- **code**: source, execution_count, outputs[]
- **markdown**: source, attachments (可选)
- **raw**: source, metadata.format

### Output 类型

- **stream**: name (stdout/stderr), text
- **display_data**: data (MIME bundle), metadata
- **execute_result**: data, metadata, execution_count
- **error**: ename, evalue, traceback[]

MIME bundle: `text/plain`, `text/html`, `image/png` (base64), `application/json` 等

## 架构：三组件模型

浏览器前端 <-> Jupyter Server <-> Kernel 进程

- Server 通过 REST API + WebSocket 与前端通信
- Server 通过 ZMQ 与 Kernel 通信
- `/api/kernels/{id}/channels` WebSocket 多路复用所有 ZMQ 通道

## nbconvert HTML 导出

- 图片默认已是 base64，直接嵌入 data URI
- CSS/JS 内联到 `<style>`/`<script>` 标签
- `--embed-images` 标志确保完全自包含
- Jinja2 模板引擎

## Sources

- https://nbformat.readthedocs.io/en/latest/format_description.html
- https://jupyter-client.readthedocs.io/en/stable/messaging.html
- https://nbconvert.readthedocs.io/en/latest/nbconvert_library.html
