# Office 文档浏览器端预览 — 设计方案

> 状态：v1 已实现并提交（`21c16a4`）
> 涉及格式：PDF / DOCX / XLSX / PPTX

---

## 1. 背景与问题

### 1.1 旧方案（已废弃）

服务端用 LibreOffice `--headless --convert-to html` 将 docx/pptx 转为 HTML 再发给前端。

**问题**：
- 依赖系统级安装 `libreoffice`，部署复杂
- 转换后 HTML 丢失排版、乱码严重（中文、表格、图片）
- 转换耗时长（大文件 30-60s），体验差
- XLSX 不支持

### 1.2 新方案

**浏览器端原生渲染**：服务端直接发送原始二进制，前端用专业库解析渲染。

---

## 2. 技术选型

### 2.1 选型矩阵

| 格式 | 选用库 | 版本 | 包大小 | 替代方案 | 选择理由 |
|------|--------|------|--------|----------|----------|
| **PDF** | `react-pdf` (PDF.js) | ^10.4.0 | — | `pdfjs-dist` 直接用 | react-pdf 封装好，声明式组件，lazy loading 友好 |
| **DOCX** | `docx-preview` | ^0.3.7 | 976K | `mammoth.js`、`docx4js` | 保留 Word 原始样式（字体/颜色/表格），mammoth 只输出语义 HTML 丢失排版 |
| **XLSX** | `xlsx` (SheetJS) | ^0.18.5 | 7.3M | `exceljs`、`handsontable` | 纯解析无 DOM 依赖，`sheet_to_html()` 直出表格，多 sheet 支持好 |
| **PPTX** | 下载占位 | — | 0 | `@kandiforge/pptx-renderer`、`pptx2html` | 浏览器端无成熟可用方案（依赖 node-canvas 或 puppeteer），暂用下载兜底 |

### 2.2 PPTX 未来升级路径

当前用下载占位。可选升级方向：

1. **pptx → 图片方案**：服务端用 LibreOffice 仅转 PPTX → PNG/SVG 序列（比转 HTML 稳定得多），前端展示图片幻灯片
2. **iframe 嵌入**：如果部署环境有 OnlyOffice/Collabora，可 iframe 嵌入在线编辑器
3. **等待社区方案成熟**：`pptx2html` 等库持续演进中

### 2.3 XLSX 许可证说明

SheetJS Community Edition (`xlsx@0.18.5`) 采用 Apache-2.0 许可。注意：

- 仅用于**只读预览**（`sheet_to_html`），不做写入
- 如需写入/导出 Excel，考虑 SheetJS Pro 或 `exceljs`

---

## 3. 架构设计

### 3.1 数据流

```
用户点击文件
    │
    ▼
┌─────────────────────────────────────────────────┐
│ 前端: useFileStream                              │
│  1. 检查 localStorage 缓存 (mtime 比对)          │
│  2. WS 发送 file-open { session_id, path, source}│
│  3. 接收 file-open-meta → file-chunk* → file-end │
│  4. binary 格式: base64 拼接 → atob → Uint8Array  │
│  5. 写入 localStorage 缓存 (base64, 24h TTL)     │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ 服务端: ws-handler file-open                     │
│  1. 解析扩展名 → BINARY_FORMAT 映射表            │
│  2. 发 file-open-meta { format: 'xxx-binary' }  │
│  3. fs.readFile → base64 → 16KB chunk 发送      │
│  4. 发 file-open-end                             │
│  ※ library 源跳过 session 校验                    │
└─────────────────────────────────────────────────┘
```

### 3.2 格式标识约定

所有二进制格式统一用 `{ext}-binary` 命名：

```typescript
type FileFormat = 'text' | 'html'
  | 'pdf-binary' | 'docx-binary' | 'xlsx-binary' | 'pptx-binary'
  | 'unsupported';
```

判定规则：`format.endsWith('-binary')` → 走 base64 传输 + Uint8Array 解码路径。

**扩展新格式**只需：
1. `BINARY_FORMAT` 映射表加条目（服务端 `ws-handler.ts`）
2. `FileFormat` union 加类型（`useFileStream.ts` + `FileViewerStatusBar.tsx`）
3. `FileOpenMetaSchema.format` enum 加值（`shared/types.ts`）
4. `FileViewerRender.tsx` 加渲染分支

### 3.3 canEdit 逻辑

```typescript
const canEdit = format !== null && !format.endsWith('-binary') && format !== 'unsupported';
```

所有 binary 格式统一为只读，不显示 Edit 按钮。

---

## 4. 各格式实现细节

### 4.1 PDF — `react-pdf` + LazyPage

**组件**：`LazyPage`（内部组件）

```
Document
  └── LazyPage × N
        ├── IntersectionObserver (rootMargin: 2500px)
        ├── 未进入视口: 占位 div (minHeight: 842px)
        └── 进入视口: <Page> 渲染并永久保留
```

**关键设计**：
- `useMemo` 复制 buffer 避免 PDF.js Worker `postMessage` 转移后 detach
- `rootMargin: 2500px` 预渲染约 3 页，滚动流畅
- PDF.js Worker 从 `public/pdf.worker.min.mjs` 加载（避免 pnpm symlink 问题）

### 4.2 DOCX — `docx-preview`

**组件**：`DocxRenderer`（内部组件）

```typescript
renderAsync(buffer.buffer, containerEl, undefined, {
  className: 'fv-docx',
  inWrapper: true,  // 保留 Word 页面边距
});
```

**特点**：
- 保留 Word 原始样式（字体、颜色、表格、列表缩进）
- `inWrapper: true` 模拟 Word 页面视觉
- `useEffect` 在 buffer 变化时清空容器重新渲染

### 4.3 XLSX — SheetJS

**组件**：`XlsxRenderer`（内部组件）

```
XlsxRenderer
  ├── Sheet tabs (多 sheet 切换，单 sheet 时隐藏)
  └── HTML table (sheet_to_html 输出)
```

**特点**：
- `XLSX.read(buffer, { type: 'array' })` 解析
- 多 sheet 用 tab 切换，`activeSheet` state 控制
- `sheet_to_html()` 输出完整 `<table>` 结构
- CSS 控制表格样式（边框、字号、padding）

**已知限制**：
- 不支持条件格式、图表、数据透视表
- 合并单元格支持有限
- 大文件（>10MB）可能卡顿（全量解析）

### 4.4 PPTX — 下载占位

**组件**：`PptxPlaceholder`（内部组件）

提示文字 + 下载按钮（`Blob → URL.createObjectURL → <a download>`）。

---

## 5. 缓存策略

### 5.1 文本文件缓存（已有）

- **存储**：`localStorage` key = `file-content-{sessionId}-{path}`
- **内容**：`{ content: string, mtime: number, format: FileFormat }`
- **TTL**：3 天 (`TTL.FILE_CONTENT`)
- **失效**：服务端返回 mtime 与缓存不匹配时重新传输

### 5.2 Binary 文件缓存（新增）

- **存储**：同 key 格式，`content` 字段存 base64 字符串
- **TTL**：24 小时 (`TTL.BINARY_CONTENT`)
- **命中逻辑**：`file-open-meta` 返回 mtime 与缓存匹配 → 跳过所有 chunk → 本地 atob 解码
- **大小预估**：10MB PDF → ~13MB base64 字符串（localStorage 一般有 5-10MB 限额）

### 5.3 缓存溢出处理

`localCache.ts` 已有 `evictExpired()` 机制：写入时若 quota 超限，先清理过期条目再重试。binary 文件如果超出 localStorage 限额，缓存写入静默失败，下次打开会重新从服务端传输。

### 5.4 大文件风险

| 文件大小 | base64 大小 | localStorage 影响 |
|----------|-------------|-------------------|
| < 2MB | < 2.7MB | 安全 |
| 2-5MB | 2.7-6.7MB | 可能挤占其他缓存 |
| > 5MB | > 6.7MB | 大概率超限，静默跳过 |

**未来优化**：大文件改用 IndexedDB（支持数百 MB），或 Cache API。

---

## 6. 涉及文件清单

| 文件 | 角色 |
|------|------|
| `packages/shared/src/types.ts` | `FileOpenMetaSchema.format` enum 定义 |
| `packages/server/src/ws-handler.ts` | file-open: `BINARY_FORMAT` 映射 + base64 chunk 发送 |
| `packages/web/src/hooks/useFileStream.ts` | `FileFormat` 类型 + binary 解码 + 缓存读写 |
| `packages/web/src/components/FileViewerRender.tsx` | `DocxRenderer` / `XlsxRenderer` / `PptxPlaceholder` / `LazyPage` |
| `packages/web/src/components/FileViewer.tsx` | `canEdit` 泛化 + `binaryBuffer` prop |
| `packages/web/src/components/FileViewerStatusBar.tsx` | `FileFormat` 类型 + `FORMAT_LABEL` |
| `packages/web/src/utils/localCache.ts` | `TTL.BINARY_CONTENT` |
| `packages/web/src/styles.css` | `.fv-render__docx-container` / `__xlsx*` / `__pptx-placeholder` |

---

## 7. 测试方案

### 7.1 已有测试

**`packages/web/src/__tests__/fileFormat.test.ts`**（20 个测试）：

| 测试组 | 测试项 |
|--------|--------|
| binary format identification | `pdf-binary` / `docx-binary` / `xlsx-binary` / `pptx-binary` 被 `endsWith('-binary')` 识别 |
| | `text` / `html` 不被识别为 binary |
| canEdit logic | `text` → true, `html` → true |
| | 所有 `-binary` 格式 → false |
| | `unsupported` → false, `null` → false |
| library session fallback | 空 sessionId + library → `__library__` |
| | null + library → `__library__` |
| | 有效 sessionId 保持原值 |
| | 空/null + workspace → null (阻止) |

**`packages/web/src/__tests__/uiSlice.test.ts`**（新增 1 个）：

| 测试项 |
|--------|
| library 空 sessionId tab 可正常打开 |

### 7.2 待补充测试（后续 TDD 轮次）

按 Red/Green TDD 流程，每项先写 Red 测试再实现：

#### 7.2.1 服务端 — `ws-handler` binary 分发

```
描述: file-open 扩展名映射
Red:
  - .pdf → format = 'pdf-binary'
  - .docx → format = 'docx-binary'
  - .xlsx → format = 'xlsx-binary'
  - .pptx → format = 'pptx-binary'
  - .txt → format = 'text'
  - .xyz → format = 'unsupported'
  - library source 无 session 时不报错
  - workspace source 无 session 时返回 error
方式: 集成测试（mock WebSocket + mock fs）
文件: packages/server/src/__tests__/ws-file-open.test.ts
```

#### 7.2.2 前端 — `useFileStream` binary 缓存

```
描述: binary 缓存读写 + mtime 比对
Red:
  - 首次打开 binary 文件 → 写入 localStorage (base64 + mtime + format)
  - 再次打开相同 mtime → 跳过 chunk 接收，从缓存恢复 Uint8Array
  - mtime 变化 → 重新接收 chunk
  - 缓存过期 (>24h) → 重新接收
  - localStorage 写入失败 (quota) → 静默降级，不影响功能
方式: 单元测试（mock WebSocket + mock localStorage）
文件: packages/web/src/__tests__/useFileStream.test.ts
```

#### 7.2.3 前端 — 渲染组件

```
描述: DocxRenderer / XlsxRenderer / PptxPlaceholder 渲染
Red:
  - DocxRenderer: 传入 buffer → 调用 renderAsync → 容器非空
  - XlsxRenderer: 传入多 sheet buffer → tabs 数量正确 → 切换 tab 更新内容
  - XlsxRenderer: 单 sheet → 不显示 tabs
  - PptxPlaceholder: 显示下载按钮 → 点击触发 download
方式: 组件测试（vitest + @testing-library/react，mock docx-preview/xlsx）
文件: packages/web/src/__tests__/officeRenderers.test.tsx
```

#### 7.2.4 端到端 — 手动验证清单

| 场景 | 验证点 |
|------|--------|
| Library 点击 PDF | 能渲染，连续滚动流畅 |
| Library 点击 PDF（第 2 次） | 从缓存秒开 |
| Workspace 点击 DOCX | 浏览器端渲染，保留格式 |
| Workspace 点击 XLSX | 表格预览，多 sheet 可切换 |
| Library 点击 PPTX | 显示下载按钮，点击能下载 |
| 无 notebook 时点击 Library 文件 | 不报错，正常打开 |
| 超大 PDF (>5MB) | 能打开，缓存可能跳过但不报错 |

---

## 8. 已知限制与未来改进

| 限制 | 影响 | 改进方向 |
|------|------|----------|
| PPTX 无预览 | 只能下载 | 服务端转图片 or 等社区方案 |
| XLSX 无图表/条件格式 | 纯表格数据 | 考虑 Handsontable 或 Luckysheet |
| localStorage 5MB 限制 | 大文件缓存失败 | 改用 IndexedDB |
| DOCX 复杂排版可能丢失 | 少数边缘样式 | docx-preview 持续更新中 |
| binary 格式不可编辑 | 只读预览 | 嵌入 OnlyOffice / Collabora 在线编辑 |
| SheetJS 包体 7.3MB | 首次加载较大 | 动态 import() 按需加载 |
