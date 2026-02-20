import { useState } from 'react';
import type { CellOutput as CellOutputItem } from '@notebook-ai/shared';
import { renderMd } from '../utils/markdown';

// ── SVG sanitizer ────────────────────────────────────────────────────────────

const DANGEROUS_TAGS = /(<script[\s\S]*?<\/script>|<script[^>]*\/>)/gi;
const DANGEROUS_ATTRS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const JAVASCRIPT_HREF = /\s+(?:href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;

function sanitizeSvg(svg: string): string {
  return svg
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_ATTRS, '')
    .replace(JAVASCRIPT_HREF, '');
}

// ── Response renderers ───────────────────────────────────────────────────────

function TextOutputView({ content }: { content: string }) {
  return (
    <div
      className="output-text markdown-body"
      dangerouslySetInnerHTML={{ __html: renderMd(content) }}
    />
  );
}

function ErrorOutputView({ message }: { message: string }) {
  return (
    <div className="output-error">
      <span className="output-error-icon">✕</span>
      <pre className="output-error-message">{message}</pre>
    </div>
  );
}

function ChartOutputView({ chart_type, svg }: { chart_type: string; svg?: string }) {
  if (svg) {
    return (
      <div
        className="output-chart"
        dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
      />
    );
  }
  return (
    <div className="output-chart output-chart-placeholder">
      <span>Chart ({chart_type}) — visualization will render here</span>
    </div>
  );
}

// ── Panel: Thinking ──────────────────────────────────────────────────────────

type ThinkingItem = Extract<CellOutputItem, { type: 'thinking' }>;

function ThinkingPanel({ items }: { items: ThinkingItem[] }) {
  const combined = items.map((i) => i.content).join('\n\n---\n\n');
  return (
    <div className="cell-panel-thinking">
      <pre className="output-thinking-text">{combined}</pre>
    </div>
  );
}

// ── Panel: Tools ─────────────────────────────────────────────────────────────

type ToolItem = Extract<CellOutputItem, { type: 'tool_use' }>;

function ToolRow({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);

  const inputKeys = Object.keys(item.input);
  const firstVal = inputKeys.length > 0 ? String(Object.values(item.input)[0]) : '';
  const shortVal = firstVal.length > 50 ? firstVal.slice(0, 50) + '…' : firstVal;
  const summary = shortVal || `${inputKeys.length} params`;

  const hasResult = item.result !== undefined;
  const isError = item.is_error ?? false;
  const statusClass = hasResult ? (isError ? 'tool-result-error' : 'tool-result-ok') : '';

  return (
    <div className={`output-tool-use${statusClass ? ` ${statusClass}` : ''}`}>
      <button
        className="output-collapsible-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? '▼' : '▶'}</span>
        <code className="tool-use-name">{item.name}</code>
        {!open && <span className="collapsible-summary">{summary}</span>}
        {hasResult && !open && (
          <span className={isError ? 'tool-use-fail' : 'tool-use-done'}>
            {isError ? '✗' : '✓'}
          </span>
        )}
      </button>

      {open && (
        <div className="tool-use-details">
          <div className="tool-use-section">
            <span className="tool-use-section-label">Input</span>
            <pre className="tool-use-json">{JSON.stringify(item.input, null, 2)}</pre>
          </div>
          {hasResult && (
            <div className={`tool-use-section${isError ? ' tool-use-section-error' : ''}`}>
              <span className="tool-use-section-label">{isError ? 'Error' : 'Result'}</span>
              <pre className="tool-use-result">{item.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolsPanel({ items }: { items: ToolItem[] }) {
  return (
    <div className="cell-panel-tools">
      {items.map((item, i) => (
        <ToolRow key={i} item={item} />
      ))}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

interface CellOutputProps {
  outputs: CellOutputItem[];
  isActiveCell?: boolean;
}

type PanelTab = 'thinking' | 'tools';

export function CellOutput({ outputs }: CellOutputProps) {
  const thinkingItems = outputs.filter(
    (o): o is ThinkingItem => o.type === 'thinking',
  );
  const toolItems = outputs.filter(
    (o): o is ToolItem => o.type === 'tool_use',
  );
  const responseItems = outputs.filter(
    (o) => o.type === 'text' || o.type === 'error' || o.type === 'chart',
  );

  const hasTabs = thinkingItems.length > 0 || toolItems.length > 0;
  const initialTab: PanelTab = thinkingItems.length > 0 ? 'thinking' : 'tools';
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab);

  if (outputs.length === 0) return null;

  return (
    <div className="cell-output-area">

      {/* ── Section 2/3: Thinking | Tools tab panel ── */}
      {hasTabs && (
        <div className="cell-panels">
          <div className="cell-panel-tabs" role="tablist">
            {thinkingItems.length > 0 && (
              <button
                role="tab"
                aria-selected={activeTab === 'thinking'}
                className={`cell-panel-tab${activeTab === 'thinking' ? ' active' : ''}`}
                onClick={() => setActiveTab('thinking')}
              >
                Thinking
                <span className="cell-panel-tab-count">{thinkingItems.length}</span>
              </button>
            )}
            {toolItems.length > 0 && (
              <button
                role="tab"
                aria-selected={activeTab === 'tools'}
                className={`cell-panel-tab${activeTab === 'tools' ? ' active' : ''}`}
                onClick={() => setActiveTab('tools')}
              >
                Tools
                <span className="cell-panel-tab-count">{toolItems.length}</span>
              </button>
            )}
          </div>

          <div className="cell-panel-content" role="tabpanel">
            {activeTab === 'thinking' && <ThinkingPanel items={thinkingItems} />}
            {activeTab === 'tools'    && <ToolsPanel    items={toolItems} />}
          </div>
        </div>
      )}

      {/* ── Section 4: Response output ── */}
      {responseItems.length > 0 && (
        <div className="cell-response">
          {responseItems.map((item, i) => {
            if (item.type === 'text')  return <TextOutputView  key={i} content={item.content} />;
            if (item.type === 'error') return <ErrorOutputView key={i} message={item.message} />;
            if (item.type === 'chart') return <ChartOutputView key={i} chart_type={item.chart_type} svg={item.svg} />;
            return null;
          })}
        </div>
      )}

    </div>
  );
}
