import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function StreamingText({ cellId }: { cellId: string }) {
  const streamBuffer = useStore(s => s.streamBuffer[cellId]);
  const containerRef = useRef<HTMLPreElement>(null);
  const lastRendered = useRef('');

  useEffect(() => {
    const interval = setInterval(() => {
      if (!streamBuffer) return;
      const newText = streamBuffer.text;
      if (newText !== lastRendered.current) {
        lastRendered.current = newText;
        if (containerRef.current) {
          containerRef.current.textContent = newText;
        }
      }
    }, 20);
    return () => clearInterval(interval);
  }, [streamBuffer]);

  return <pre ref={containerRef} className="output-text streaming" />;
}

export function StreamingThinking({ cellId }: { cellId: string }) {
  const streamBuffer = useStore(s => s.streamBuffer[cellId]);
  const containerRef = useRef<HTMLPreElement>(null);
  const lastRendered = useRef('');

  useEffect(() => {
    const interval = setInterval(() => {
      if (!streamBuffer) return;
      const newText = streamBuffer.thinking;
      if (newText !== lastRendered.current) {
        lastRendered.current = newText;
        if (containerRef.current) {
          containerRef.current.textContent = newText;
        }
      }
    }, 20);
    return () => clearInterval(interval);
  }, [streamBuffer]);

  return <pre ref={containerRef} className="output-thinking streaming" />;
}
