import { z } from 'zod';

// ─── Cell Output Types ───

export const TextOutputSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
  timestamp: z.string().optional(),
});

export const ToolUseOutputSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string(),
  input: z.record(z.unknown()),
  result: z.string().optional(),
  timestamp: z.string().optional(),
});

export const ErrorOutputSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  timestamp: z.string().optional(),
});

export const ChartOutputSchema = z.object({
  type: z.literal('chart'),
  chart_type: z.string(),
  data: z.unknown(),
  svg: z.string().optional(),
  timestamp: z.string().optional(),
});

export const ThinkingOutputSchema = z.object({
  type: z.literal('thinking'),
  content: z.string(),
  timestamp: z.string().optional(),
});

export const CellOutputSchema = z.discriminatedUnion('type', [
  TextOutputSchema,
  ToolUseOutputSchema,
  ErrorOutputSchema,
  ChartOutputSchema,
  ThinkingOutputSchema,
]);

// ─── Cell Types ───

export const CellStatusSchema = z.enum([
  'idle',
  'running',
  'completed',
  'error',
]);

const BaseCellSchema = z.object({
  id: z.string(),
  execution_count: z.number().int().nonnegative().default(0),
  status: CellStatusSchema.default('idle'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PromptCellSchema = BaseCellSchema.extend({
  type: z.literal('prompt'),
  source: z.string(),
  outputs: z.array(CellOutputSchema).default([]),
  git_diff: z.string().optional(),
  duration_ms: z.number().optional(),
});

export const MarkdownCellSchema = BaseCellSchema.extend({
  type: z.literal('markdown'),
  source: z.string(),
});

export const VisualizationCellSchema = BaseCellSchema.extend({
  type: z.literal('visualization'),
  source: z.string(),
  data: z.unknown(),
  config: z.record(z.unknown()).optional(),
});

export const CellSchema = z.discriminatedUnion('type', [
  PromptCellSchema,
  MarkdownCellSchema,
  VisualizationCellSchema,
]);

// ─── Slice (类 PPTX 总结演示) ───

export const SliceSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  cell_refs: z.array(z.string()).default([]),
  order: z.number().int().default(0),
});

export const SliceSchema = z.object({
  generated: z.boolean().default(false),
  sections: z.array(SliceSectionSchema).default([]),
  updated_at: z.string().optional(),
});

// ─── Annotations (批注) ───

export const InsertAnnotationSchema = z.object({
  id: z.string(),
  type: z.literal('insert'),
  target_cell: z.string(),
  after_output_index: z.number().int(),
  content: z.string(),
  author: z.string().default('user'),
  timestamp: z.string(),
});

export const DeleteAnnotationSchema = z.object({
  id: z.string(),
  type: z.literal('delete'),
  target_cell: z.string(),
  output_indices: z.array(z.number().int()),
  selected_text: z.string(),
  author: z.string().default('user'),
  timestamp: z.string(),
});

export const ReplaceAnnotationSchema = z.object({
  id: z.string(),
  type: z.literal('replace'),
  target_cell: z.string(),
  output_indices: z.array(z.number().int()),
  selected_text: z.string(),
  replacement: z.string(),
  author: z.string().default('user'),
  timestamp: z.string(),
});

export const CommentAnnotationSchema = z.object({
  id: z.string(),
  type: z.literal('comment'),
  target_cell: z.string(),
  output_indices: z.array(z.number().int()),
  selected_text: z.string(),
  comment: z.string(),
  audio_base64: z.string().optional(),
  transcript: z.string().optional(),
  author: z.string().default('user'),
  timestamp: z.string(),
});

export const AnnotationSchema = z.discriminatedUnion('type', [
  InsertAnnotationSchema,
  DeleteAnnotationSchema,
  ReplaceAnnotationSchema,
  CommentAnnotationSchema,
]);

// ─── Assets ───

export const IntermediateFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  cell_ref: z.string().optional(),
});

export const AssetsSchema = z.object({
  intermediate_files: z.array(IntermediateFileSchema).default([]),
});

// ─── Notebook Metadata ───

export const NotebookMetadataSchema = z.object({
  title: z.string(),
  created: z.string(),
  updated: z.string().optional(),
  cwd: z.string().optional(),
  git_repo: z.boolean().default(false),
  tmux_session: z.string().optional(),
});

// ─── Notebook (顶层文档) ───

export const NotebookSchema = z.object({
  version: z.number().int().default(1),
  metadata: NotebookMetadataSchema,
  cells: z.array(CellSchema).default([]),
  slice: SliceSchema.default({ generated: false, sections: [] }),
  annotations: z.array(AnnotationSchema).default([]),
  assets: AssetsSchema.default({ intermediate_files: [] }),
});

// ─── WebSocket Messages ───

export const ExecuteRequestSchema = z.object({
  type: z.literal('execute_request'),
  cell_id: z.string(),
  source: z.string(),
});

export const CellOutputMessageSchema = z.object({
  type: z.literal('cell_output'),
  cell_id: z.string(),
  output: CellOutputSchema,
});

export const ExecutionCompleteSchema = z.object({
  type: z.literal('execution_complete'),
  cell_id: z.string(),
  duration_ms: z.number().optional(),
});

export const GitDiffMessageSchema = z.object({
  type: z.literal('git_diff'),
  cell_id: z.string(),
  diff: z.string(),
  files_changed: z.array(z.string()).default([]),
});

export const SliceUpdateSchema = z.object({
  type: z.literal('slice_update'),
  sections: z.array(SliceSectionSchema),
});

export const SaveNotebookSchema = z.object({
  type: z.literal('save_notebook'),
  path: z.string(),
});

export const LoadNotebookSchema = z.object({
  type: z.literal('load_notebook'),
  path: z.string(),
});

export const ExportHtmlSchema = z.object({
  type: z.literal('export_html'),
  options: z.object({
    include_slice: z.boolean().default(true),
    include_replay: z.boolean().default(true),
    include_annotations: z.boolean().default(true),
  }).default({}),
});

export const ExportCompleteSchema = z.object({
  type: z.literal('export_complete'),
  html: z.string(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  cell_id: z.string().optional(),
});

export const WSClientMessageSchema = z.discriminatedUnion('type', [
  ExecuteRequestSchema,
  SaveNotebookSchema,
  LoadNotebookSchema,
  ExportHtmlSchema,
  SliceUpdateSchema,
]);

export const WSServerMessageSchema = z.discriminatedUnion('type', [
  CellOutputMessageSchema,
  ExecutionCompleteSchema,
  GitDiffMessageSchema,
  ExportCompleteSchema,
  ErrorMessageSchema,
]);

// ─── Export Options ───

export const ExportOptionsSchema = z.object({
  include_slice: z.boolean().default(true),
  include_replay: z.boolean().default(true),
  include_annotations: z.boolean().default(true),
  minify: z.boolean().default(false),
});

// ─── Inferred Types ───

export type TextOutput = z.infer<typeof TextOutputSchema>;
export type ToolUseOutput = z.infer<typeof ToolUseOutputSchema>;
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
export type ChartOutput = z.infer<typeof ChartOutputSchema>;
export type ThinkingOutput = z.infer<typeof ThinkingOutputSchema>;
export type CellOutput = z.infer<typeof CellOutputSchema>;

export type CellStatus = z.infer<typeof CellStatusSchema>;
export type PromptCell = z.infer<typeof PromptCellSchema>;
export type MarkdownCell = z.infer<typeof MarkdownCellSchema>;
export type VisualizationCell = z.infer<typeof VisualizationCellSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type CellType = Cell['type'];

export type SliceSection = z.infer<typeof SliceSectionSchema>;
export type Slice = z.infer<typeof SliceSchema>;

export type InsertAnnotation = z.infer<typeof InsertAnnotationSchema>;
export type DeleteAnnotation = z.infer<typeof DeleteAnnotationSchema>;
export type ReplaceAnnotation = z.infer<typeof ReplaceAnnotationSchema>;
export type CommentAnnotation = z.infer<typeof CommentAnnotationSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;

export type IntermediateFile = z.infer<typeof IntermediateFileSchema>;
export type Assets = z.infer<typeof AssetsSchema>;

export type NotebookMetadata = z.infer<typeof NotebookMetadataSchema>;
export type Notebook = z.infer<typeof NotebookSchema>;

export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type CellOutputMessage = z.infer<typeof CellOutputMessageSchema>;
export type ExecutionComplete = z.infer<typeof ExecutionCompleteSchema>;
export type GitDiffMessage = z.infer<typeof GitDiffMessageSchema>;
export type SliceUpdate = z.infer<typeof SliceUpdateSchema>;
export type SaveNotebook = z.infer<typeof SaveNotebookSchema>;
export type LoadNotebook = z.infer<typeof LoadNotebookSchema>;
export type ExportHtml = z.infer<typeof ExportHtmlSchema>;
export type ExportComplete = z.infer<typeof ExportCompleteSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export type WSClientMessage = z.infer<typeof WSClientMessageSchema>;
export type WSServerMessage = z.infer<typeof WSServerMessageSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
