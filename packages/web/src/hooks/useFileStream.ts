import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';

export type FileFormat = 'text' | 'html' | 'pdf-binary' | 'unsupported';

export interface FileStreamState {
  status: 'idle' | 'loading' | 'complete' | 'error';
  format: FileFormat | null;
  content: string;
  pdfBuffer: Uint8Array | null;
  mtime: number;
  error: string | null;
}

const INITIAL_STATE: FileStreamState = {
  status: 'idle',
  format: null,
  content: '',
  pdfBuffer: null,
  mtime: 0,
  error: null,
};

const THROTTLE_MS = 200;

export function useFileStream(
  sessionId: string | null,
  notebookId: string | null,
  filePath: string | null,
  source: 'workspace' | 'library',
) {
  const ws = useStore((s) => s.ws);
  const [state, setState] = useState<FileStreamState>(INITIAL_STATE);

  const contentRef = useRef('');
  const b64Ref = useRef('');
  const formatRef = useRef<FileFormat | null>(null);
  const throttleRef = useRef<number | null>(null);
  const skipStreamRef = useRef(false);

  const flushState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      content: formatRef.current !== 'pdf-binary' ? contentRef.current : prev.content,
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (throttleRef.current !== null) return;
    throttleRef.current = window.setTimeout(() => {
      throttleRef.current = null;
      flushState();
    }, THROTTLE_MS);
  }, [flushState]);

  useEffect(() => {
    if (!sessionId || !notebookId || !filePath || !ws) return;

    contentRef.current = '';
    b64Ref.current = '';
    formatRef.current = null;
    skipStreamRef.current = false;
    setState({ ...INITIAL_STATE, status: 'loading' });

    // Check localStorage cache
    const cacheKey = `file-content-${notebookId}-${filePath}`;
    let cachedMtime = 0;
    let cachedContent = '';
    let cachedFormat: FileFormat | null = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { content: string; mtime: number; format: FileFormat };
        cachedMtime = parsed.mtime;
        cachedContent = parsed.content;
        cachedFormat = parsed.format;
        formatRef.current = parsed.format;
        contentRef.current = parsed.content;
        // Render cached content immediately while waiting for server
        setState({
          status: 'loading',
          format: parsed.format,
          content: parsed.content,
          pdfBuffer: null,
          mtime: parsed.mtime,
          error: null,
        });
      }
    } catch { /* cache miss */ }

    function handleMessage(event: MessageEvent) {
      let msg: { type: string; session_id?: string; [key: string]: unknown };
      try { msg = JSON.parse(event.data as string); } catch { return; }
      if (msg.session_id !== sessionId) return;

      switch (msg.type) {
        case 'file-open-meta': {
          const { mtime, format } = msg as unknown as { mtime: number; format: FileFormat };
          formatRef.current = format;
          // If mtime matches cache, skip streaming — use cached content
          if (mtime === cachedMtime && cachedContent && cachedFormat === format) {
            skipStreamRef.current = true;
            setState({ status: 'complete', format, content: cachedContent, pdfBuffer: null, mtime, error: null });
          } else {
            contentRef.current = '';
            b64Ref.current = '';
          }
          break;
        }
        case 'file-chunk': {
          if (skipStreamRef.current) break;
          const { data, encoding } = msg as unknown as { data: string; encoding: 'utf8' | 'base64' };
          if (encoding === 'base64') {
            b64Ref.current += data;
          } else {
            contentRef.current += data;
          }
          scheduleFlush();
          break;
        }
        case 'file-open-end': {
          if (skipStreamRef.current) break;
          if (throttleRef.current !== null) { clearTimeout(throttleRef.current); throttleRef.current = null; }
          const fmt = formatRef.current;
          const mtime = (msg as unknown as { mtime: number }).mtime;
          if (fmt === 'pdf-binary') {
            const binary = atob(b64Ref.current);
            const buffer = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
            setState({ status: 'complete', format: fmt, content: '', pdfBuffer: buffer, mtime, error: null });
          } else {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ content: contentRef.current, mtime, format: fmt }));
            } catch { /* storage full */ }
            setState({ status: 'complete', format: fmt ?? 'text', content: contentRef.current, pdfBuffer: null, mtime, error: null });
          }
          break;
        }
        case 'file-open-error': {
          setState((prev) => ({ ...prev, status: 'error', error: (msg as unknown as { error: string }).error }));
          break;
        }
      }
    }

    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ type: 'file-open', session_id: sessionId, path: filePath, source }));

    return () => {
      ws.removeEventListener('message', handleMessage);
      if (throttleRef.current !== null) { clearTimeout(throttleRef.current); throttleRef.current = null; }
    };
  }, [sessionId, notebookId, filePath, source, ws, scheduleFlush]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
