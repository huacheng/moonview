import { useState } from 'react';
import type { CellOutput as CellOutputItem } from '@notebook-ai/shared';

interface CellOutputProps {
  outputs: CellOutputItem[];
}

// ── Individual output renderers ────────────────────────────────────────────

function TextOutputView({ content }: { content: string }) {
  return <pre className="output-text">{content}</pre>;
}

function ThinkingOutputView({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="output-thinking">
      <button
        className="output-collapsible-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? '▼' : '▶'}</span>
        <span>Thinking…</span>
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
}: {
  name: string;
  input: Record<string, unknown>;
  result?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="output-tool-use">
      <button
        className="output-collapsible-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? '▼' : '▶'}</span>
        <span className="tool-use-label">Tool:</span>
        <code className="tool-use-name">{name}</code>
      </button>

      {open && (
        <div className="tool-use-details">
          <div className="tool-use-section">
            <span className="tool-use-section-label">Input</span>
            <pre className="tool-use-json">{JSON.stringify(input, null, 2)}</pre>
          </div>
          {result !== undefined && (
            <div className="tool-use-section">
              <span className="tool-use-section-label">Result</span>
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
        dangerouslySetInnerHTML={{ __html: svg }}
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

function OutputItem({ item }: { item: CellOutputItem }) {
  switch (item.type) {
    case 'text':
      return <TextOutputView content={item.content} />;
    case 'thinking':
      return <ThinkingOutputView content={item.content} />;
    case 'tool_use':
      return (
        <ToolUseOutputView
          name={item.name}
          input={item.input}
          result={item.result}
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

export function CellOutput({ outputs }: CellOutputProps) {
  if (outputs.length === 0) return null;

  return (
    <div className="cell-output-area">
      {outputs.map((item, i) => (
        <OutputItem key={i} item={item} />
      ))}
    </div>
  );
}
