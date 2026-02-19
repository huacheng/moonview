import { useState } from 'react';
import type { CellOutput as CellOutputItem } from '@notebook-ai/shared';
import { Annotations } from './Annotations';

// ── SVG sanitizer ───────────────────────────────────────────────────────────
// Strips <script> elements and on* event handler attributes from SVG markup
// to prevent XSS when rendering chart output from the Claude process.

const DANGEROUS_TAGS = /(<script[\s\S]*?<\/script>|<script[^>]*\/>)/gi;
const DANGEROUS_ATTRS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const JAVASCRIPT_HREF = /\s+(?:href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;

function sanitizeSvg(svg: string): string {
  return svg
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_ATTRS, '')
    .replace(JAVASCRIPT_HREF, '');
}

interface CellOutputProps {
  outputs: CellOutputItem[];
  cellId?: string;
  /** True when the parent cell is currently executing — collapsible blocks auto-open. */
  isActiveCell?: boolean;
}

// ── Individual output renderers ────────────────────────────────────────────

function TextOutputView({ content }: { content: string }) {
  return <pre className="output-text">{content}</pre>;
}

function ThinkingOutputView({ content, defaultOpen }: { content: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const chars = content.length;
  const summary = chars > 1024
    ? `${(chars / 1024).toFixed(1)} KB`
    : `${chars} 字符`;

  return (
    <div className="output-thinking">
      <button
        className="output-collapsible-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? '▼' : '▶'}</span>
        <span>思考</span>
        {!open && <span className="collapsible-summary">{summary}</span>}
      </button>
      {open && (
        <div className="output-thinking-content">
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
}

function ToolUseOutputView({
  name,
  input,
  result,
  is_error,
  defaultOpen,
}: {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  is_error?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  // Compact summary: first string value from input, or param count
  const inputKeys = Object.keys(input);
  const firstVal = inputKeys.length > 0 ? String(Object.values(input)[0]) : '';
  const shortVal = firstVal.length > 40 ? firstVal.slice(0, 40) + '…' : firstVal;
  const summary = shortVal || `${inputKeys.length} 参数`;

  const hasResult = result !== undefined;
  const isError = is_error ?? false;
  const statusClass = hasResult ? (isError ? 'tool-result-error' : 'tool-result-ok') : '';

  return (
    <div className={`output-tool-use${statusClass ? ` ${statusClass}` : ''}`}>
      <button
        className="output-collapsible-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? '▼' : '▶'}</span>
        <code className="tool-use-name">{name}</code>
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
            <pre className="tool-use-json">{JSON.stringify(input, null, 2)}</pre>
          </div>
          {hasResult && (
            <div className={`tool-use-section${isError ? ' tool-use-section-error' : ''}`}>
              <span className="tool-use-section-label">
                {isError ? 'Error' : 'Result'}
              </span>
              <pre className="tool-use-result">{result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
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

// ── Dispatcher ─────────────────────────────────────────────────────────────

export function OutputItem({ item, defaultOpen }: { item: CellOutputItem; defaultOpen?: boolean }) {
  switch (item.type) {
    case 'text':
      return <TextOutputView content={item.content} />;
    case 'thinking':
      return <ThinkingOutputView content={item.content} defaultOpen={defaultOpen} />;
    case 'tool_use':
      return (
        <ToolUseOutputView
          name={item.name}
          input={item.input}
          result={item.result}
          is_error={item.is_error}
          defaultOpen={defaultOpen}
        />
      );
    case 'error':
      return <ErrorOutputView message={item.message} />;
    case 'chart':
      return <ChartOutputView chart_type={item.chart_type} svg={item.svg} />;
    default:
      return null;
  }
}

// ── Public component ────────────────────────────────────────────────────────

export function CellOutput({ outputs, cellId, isActiveCell }: CellOutputProps) {
  if (outputs.length === 0 && !cellId) return null;

  return (
    <div className="cell-output-area">
      {outputs.map((item, i) => (
        // Collapsible blocks (thinking/tool_use) auto-open only when the cell
        // is actively executing. When loaded from disk they start collapsed.
        <OutputItem
          key={i}
          item={item}
          defaultOpen={
            (item.type === 'thinking' || item.type === 'tool_use')
              ? isActiveCell
              : undefined
          }
        />
      ))}
      {cellId && (
        <Annotations cellId={cellId} outputs={outputs} />
      )}
    </div>
  );
}
