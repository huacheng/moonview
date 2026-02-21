# task-ai 目录结构重组设计

**日期**: 2026-02-21
**版本**: v1.0
**状态**: 已确认

---

## 背景

task-ai（v0.3.9）原有的 `AiTasks/` 目录将所有内容扁平地混放在一起：全局共享资料、跨任务经验库、每个任务的状态文件都在同一层级下。随着 notebook-ai 项目引入 **workspace 概念**，需要将目录结构拆分为三个清晰的职责层次。

---

## 环境变量

| 变量 | 值 | 说明 |
|------|----|------|
| `NB_WORKSPACES_ROOT` | `/home/user/nb-workspaces` | 工作区根目录 |
| `NB_WORKSPACES_LIBRARY` | `$NB_WORKSPACES_ROOT/_library` | 共享图书馆目录 |

---

## 新目录结构

```
NB_WORKSPACES_ROOT/                    # 环境变量: NB_WORKSPACES_ROOT
├── .index.json                        # 全局任务列表
│
├── _library/                          # 环境变量: NB_WORKSPACES_LIBRARY
│   ├── .type-registry.md              # 任务类型注册表（自动扩展）
│   ├── .plugin-registry.md            # 插件能力缓存
│   ├── .index/                        # 图书馆资料索引（快速检索用）
│   ├── .type-profiles/                # 共享任务类型方法论
│   ├── .experiences/                  # 跨任务经验库（按 type 分类）
│   ├── .references/                   # 外部参考资料（research 写入）
│   ├── .thinking/                     # 占位：跨任务推理框架（待设计）
│   └── [用户上传的资料文件/文件夹]
│
├── notebook-1/
│   ├── [交付物目录]/                  # 用户自定义名称，存放交付成果
│   │   └── .report.md                 # 完成报告
│   └── .working/                      # 任务状态文件（系统管理）
│       ├── .index.json                # 任务元数据（status/phase/type...）
│       ├── .target.md                 # 需求目标（人工编写）
│       ├── .plan.md                   # 实施计划（plan 生成，可批注）
│       ├── .plan-superseded.md        # 旧计划归档
│       ├── .type-profile.md           # 任务域方法论
│       ├── .summary.md                # 压缩上下文（防 context overflow）
│       ├── .auto-signal               # 自动循环进度信号（临时）
│       ├── .auto-stop                 # 停止信号（临时）
│       ├── .auto-timeline.md          # 执行时间线
│       ├── .tmp-annotations.json      # 批注传输（临时）
│       ├── .analysis/                 # check 评估历史
│       ├── .test/                     # 测试准则 & 结果
│       ├── .bugfix/                   # 问题修复历史
│       └── .notes/                    # 研究笔记 & 执行日志
│
├── notebook-2/
│   └── ...
└── notebook-N/
    └── ...
```

---

## 三层职责划分

### 1. 工作区根目录（NB_WORKSPACES_ROOT）

管理所有 notebook 的入口索引。

| 文件 | 说明 |
|------|------|
| `.index.json` | 所有 notebook 任务的全局列表 |

### 2. 共享图书馆（NB_WORKSPACES_LIBRARY = _library/）

跨 notebook 共享的知识资产，由系统自动维护或用户手动上传。

| 路径 | 说明 |
|------|------|
| `.type-registry.md` | 任务域类型注册表，`research` 自动扩展 |
| `.plugin-registry.md` | 插件能力发现缓存 |
| `.index/` | 图书馆全部资料的检索索引，供快速匹配 |
| `.type-profiles/` | 各任务域的共享方法论文件（`<type>.md`）|
| `.experiences/` | 跨任务经验库，按 type 分类（`<type>/<module>.md`）|
| `.references/` | `research` 子命令收集的外部参考资料 |
| `.thinking/` | 跨任务推理框架占位目录（详细设计待后续"图书馆管理员"子命令设计时确定）|
| `[用户文件]` | 用户自行上传的数据集、脚本、配置等共享资料 |

### 3. Notebook 工作目录（notebook-N/）

每个 notebook 独立隔离，包含两个子目录：

#### 交付物目录（用户自定义名称）

| 文件 | 说明 |
|------|------|
| `.report.md` | 任务完成报告（由 `report` 子命令生成）|
| 其他交付成果 | notebook 执行产生的最终产出物 |

#### .working/（系统管理，不对用户暴露）

| 文件/目录 | 说明 |
|-----------|------|
| `.index.json` | 任务元数据（status/phase/type/completed_steps 等）|
| `.target.md` | 需求目标（人工编写）|
| `.plan.md` | 实施计划（`plan` 生成，可通过 Plan 面板批注）|
| `.plan-superseded.md` | 旧计划归档（re-plan 时重命名保留）|
| `.type-profile.md` | 本任务的域方法论（任务级，区别于 library 的共享版）|
| `.summary.md` | 压缩上下文摘要（防 context overflow）|
| `.auto-signal` | 自动循环进度信号（临时，gitignore）|
| `.auto-stop` | 停止信号（临时，gitignore）|
| `.auto-timeline.md` | 执行时间线 |
| `.tmp-annotations.json` | Plan 面板批注传输（临时，gitignore）|
| `.analysis/` | `check` 评估历史 |
| `.test/` | 测试准则 & 结果 |
| `.bugfix/` | 问题修复历史 |
| `.notes/` | 研究笔记 & 执行日志 |

---

## 文件归属变更映射

| 文件 | 旧位置（AiTasks/） | 新位置 |
|------|-------------------|--------|
| `.index.json`（全局） | `AiTasks/.index.json` | `NB_WORKSPACES_ROOT/.index.json` |
| `.type-registry.md` | `AiTasks/.type-registry.md` | `NB_WORKSPACES_LIBRARY/.type-registry.md` |
| `.plugin-registry.md` | `AiTasks/.plugin-registry.md` | `NB_WORKSPACES_LIBRARY/.plugin-registry.md` |
| `.type-profiles/` | `AiTasks/.type-profiles/` | `NB_WORKSPACES_LIBRARY/.type-profiles/` |
| `.experiences/` | `AiTasks/.experiences/` | `NB_WORKSPACES_LIBRARY/.experiences/` |
| `.references/` | `AiTasks/.references/` | `NB_WORKSPACES_LIBRARY/.references/` |
| `.thinking/` | ——（新增）| `NB_WORKSPACES_LIBRARY/.thinking/` |
| `.index/` | ——（新增）| `NB_WORKSPACES_LIBRARY/.index/` |
| 各模块状态文件 | `AiTasks/<module>/` | `notebook-N/.working/` |
| `.report.md` | `AiTasks/<module>/` | `notebook-N/[交付物目录]/` |

---

## 暂不处理的事项

以下内容在本次重组中保持原有逻辑不变，留待后续处理：

- `.thinking/` 详细设计（待"图书馆管理员"子命令设计时确定）
- `.index/` 索引文件格式与写入时机
- `.gitignore` 更新（临时文件路径变化后需同步）
- `SKILL.md` 中所有路径引用的全量更新（实施阶段完成）

---

## 实施范围

需更新的文件（方案 A 全量重写）：

- `commands/ai-cli-task.md` — 主文档（目录结构、路径引用）
- `skills/init/SKILL.md` — 创建新结构
- `skills/plan/SKILL.md` — 路径引用
- `skills/research/SKILL.md` — library 路径引用
- `skills/check/SKILL.md` — 路径引用
- `skills/verify/SKILL.md` — 路径引用
- `skills/exec/SKILL.md` — 路径引用
- `skills/merge/SKILL.md` — 路径引用
- `skills/report/SKILL.md` — library 路径引用（experiences/type-profiles）
- `skills/auto/SKILL.md` — 路径引用
- `skills/annotate/SKILL.md` — 路径引用
- `skills/cancel/SKILL.md` — 路径引用
- `skills/list/SKILL.md` — 路径引用
- `skills/summarize/SKILL.md` — 路径引用
- `commands/references/git-details.md` — gitignore 更新
