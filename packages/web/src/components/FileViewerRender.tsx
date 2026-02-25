import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';
import type { FileFormat } from '../hooks/useFileStream';
import type { FileAnnotations, FileAnnotation } from '../types/fileAnnotations';
import { uid, buildAnnotationText } from '../types/fileAnnotations';
import { FileSelectionFloat } from './FileSelectionFloat';
import { FileAnnotationCard } from './FileAnnotationCard';
import { FileAnnotationDropdown } from './FileAnnotationDropdown';

import { isJsonFile, formatJsonContent } from '../utils/jsonFormat';

// Set PDF.js worker — served from public/ to avoid pnpm symlink issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ── Lazy PDF Page — only renders when near viewport ───────────────────────
const PAGE_PLACEHOLDER_HEIGHT = 842; // A4 height in px (approx)

function LazyPage({ pageNumber, scale, onVisible }: { pageNumber: number; scale: number; onVisible?: (n: number, vis: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Lazy load: start rendering once near viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setLoaded(true); observer.disconnect(); } },
      { rootMargin: '2500px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track which page is currently visible for page indicator
  useEffect(() => {
    if (!loaded || !onVisible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisible(pageNumber, entry.isIntersecting),
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loaded, pageNumber, onVisible]);

  return (
    <div ref={ref} style={loaded ? undefined : { minHeight: PAGE_PLACEHOLDER_HEIGHT }}>
      {loaded && <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={false} />}
    </div>
  );
}

// ── DOCX Renderer ─────────────────────────────────────────────────────────
function DocxRenderer({ buffer }: { buffer: Uint8Array }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    renderAsync(buffer.buffer, ref.current, undefined, { className: 'fv-docx', inWrapper: true });
  }, [buffer]);
  return <div ref={ref} className="fv-render__docx-container" />;
}

// ── XLSX Renderer ─────────────────────────────────────────────────────────
function XlsxRenderer({ buffer }: { buffer: Uint8Array }) {
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [html, setHtml] = useState('');

  useEffect(() => {
    const wb = XLSX.read(buffer, { type: 'array' });
    setSheets(wb.SheetNames);
    if (wb.SheetNames.length > 0) {
      setActiveSheet(0);
      setHtml(XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]));
    }
  }, [buffer]);

  useEffect(() => {
    if (sheets.length === 0) return;
    const wb = XLSX.read(buffer, { type: 'array' });
    setHtml(XLSX.utils.sheet_to_html(wb.Sheets[sheets[activeSheet]]));
  }, [activeSheet, sheets, buffer]);

  return (
    <div className="fv-render__xlsx">
      {sheets.length > 1 && (
        <div className="fv-render__xlsx-tabs">
          {sheets.map((name, i) => (
            <button key={name} className={i === activeSheet ? 'active' : ''} onClick={() => setActiveSheet(i)}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="fv-render__xlsx-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ── PPTX Placeholder ──────────────────────────────────────────────────────
function PptxPlaceholder({ buffer, filename }: { buffer: Uint8Array; filename: string }) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([buffer.slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [buffer, filename]);

  return (
    <div className="fv-render__pptx-placeholder">
      <p>PPTX preview is not available in the browser.</p>
      <button onClick={handleDownload}>Download {filename}</button>
    </div>
  );
}

interface FileViewerRenderProps {
  format: FileFormat;
  content: string;
  binaryBuffer: Uint8Array | null;
  filename: string;
  annotations: FileAnnotations;
  filePath: string;
  onAnnotationsChange: (a: FileAnnotations) => void;
  onSendToPrompt: (text: string) => void;
  pdfScale?: number;
  onPdfPagesLoaded?: (n: number) => void;
  onPdfVisiblePage?: (n: number) => void;
}

export function FileViewerRender({
  format, content, binaryBuffer, filename, annotations, filePath, onAnnotationsChange, onSendToPrompt,
  pdfScale = 1.0, onPdfPagesLoaded, onPdfVisiblePage,
}: FileViewerRenderProps) {
  const [float, setFloat] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visiblePagesRef = useRef(new Set<number>());

  const handlePageVisible = useCallback((pageNum: number, isVisible: boolean) => {
    const set = visiblePagesRef.current;
    if (isVisible) set.add(pageNum);
    else set.delete(pageNum);
    if (set.size > 0 && onPdfVisiblePage) {
      onPdfVisiblePage(Math.min(...set));
    }
  }, [onPdfVisiblePage]);
  const isMd = filename.endsWith('.md');
  const isJson = isJsonFile(filename);

  // Copy buffer for PDF.js — postMessage transfers ArrayBuffer ownership,
  // so we must give it a fresh copy each time to avoid "detached" errors on re-render.
  const pdfFile = useMemo(() => {
    if (format !== 'pdf-binary' || !binaryBuffer) return null;
    return { data: binaryBuffer.slice().buffer };
  }, [format, binaryBuffer]);

  useEffect(() => {
    setPdfPages(0);
    setPdfError(null);
  }, [binaryBuffer]);

  const addAnnotation = useCallback((type: FileAnnotation['type'], selectedText: string, defaultContent?: string) => {
    const ann: FileAnnotation = {
      id: uid(),
      type,
      file_path: filePath,
      selected_text: selectedText.slice(0, 80),
      content: defaultContent,
      author: 'user',
      timestamp: new Date().toISOString(),
      updatedAt: Date.now(),
    };
    onAnnotationsChange({ items: [...annotations.items, ann], updatedAt: Date.now() });
    setFloat(null);
  }, [annotations, filePath, onAnnotationsChange]);

  const removeAnnotation = useCallback((id: string) => {
    onAnnotationsChange({ items: annotations.items.filter((a) => a.id !== id), updatedAt: Date.now() });
  }, [annotations, onAnnotationsChange]);

  const editAnnotation = useCallback((id: string, newContent: string) => {
    onAnnotationsChange({
      items: annotations.items.map((a) => a.id === id ? { ...a, content: newContent, updatedAt: Date.now() } : a),
      updatedAt: Date.now(),
    });
  }, [annotations, onAnnotationsChange]);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setFloat(null); return; }
    const text = sel.toString().trim();
    if (!text) { setFloat(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setFloat({ x: rect.left - containerRect.left, y: rect.top - containerRect.top - 40, text });
  }, []);

  const handleSendSingle = useCallback((id: string) => {
    const ann = annotations.items.find((a) => a.id === id);
    if (ann) {
      onSendToPrompt(`[File annotation: ${ann.type}] "${ann.selected_text}"${ann.content ? ` → ${ann.content}` : ''}`);
    }
  }, [annotations, onSendToPrompt]);

  const handleSendAll = useCallback(() => {
    onSendToPrompt(buildAnnotationText(annotations));
  }, [annotations, onSendToPrompt]);

  return (
    <div ref={containerRef} className="fv-render" onMouseUp={handleMouseUp}>
      {/* Annotation dropdown — top-right corner */}
      <div className="fv-render__ann-overlay">
        <FileAnnotationDropdown
          annotations={annotations}
          onSendAll={handleSendAll}
          onSendSingle={handleSendSingle}
          onRemove={removeAnnotation}
        />
      </div>

      {/* Selection float */}
      {float && (
        <FileSelectionFloat
          x={float.x}
          y={float.y}
          onDelete={() => addAnnotation('delete', float.text)}
          onReplace={() => addAnnotation('replace', float.text, '(replacement)')}
          onComment={() => addAnnotation('comment', float.text, '(comment)')}
          onInsertAfter={() => addAnnotation('insert', float.text, '(insert content)')}
        />
      )}

      {/* File content */}
      {format === 'text' && isMd && (
        <div className="fv-render__markdown">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
      {format === 'text' && !isMd && isJson && (
        <pre className="fv-render__json">{formatJsonContent(content)}</pre>
      )}
      {format === 'text' && !isMd && !isJson && (
        <pre className="fv-render__text">{content}</pre>
      )}
      {format === 'html' && (
        <div
          className="fv-render__html"
          dangerouslySetInnerHTML={{ __html: String(DOMPurify.sanitize(content)) }}
        />
      )}
      {format === 'unsupported' && (
        <div className="fv-render__unsupported">
          <p>This file format is not supported for preview.</p>
        </div>
      )}
      {format === 'pdf-binary' && pdfFile && (
        <div className="fv-render__pdf-wrapper">
          {pdfError && <div className="fv-render__pdf-error">Failed to load PDF: {pdfError}</div>}
          <Document
            file={pdfFile}
            onLoadSuccess={(pdf: { numPages: number }) => { setPdfPages(pdf.numPages); onPdfPagesLoaded?.(pdf.numPages); }}
            onLoadError={(err: Error) => setPdfError(err.message)}
            loading={<div className="fv-render__pdf-loading">Loading PDF…</div>}
            className="fv-render__pdf"
          >
            {Array.from({ length: pdfPages }, (_, i) => (
              <LazyPage key={i + 1} pageNumber={i + 1} scale={pdfScale} onVisible={handlePageVisible} />
            ))}
          </Document>
        </div>
      )}
      {format === 'docx-binary' && binaryBuffer && <DocxRenderer buffer={binaryBuffer} />}
      {format === 'xlsx-binary' && binaryBuffer && <XlsxRenderer buffer={binaryBuffer} />}
      {format === 'pptx-binary' && binaryBuffer && <PptxPlaceholder buffer={binaryBuffer} filename={filename} />}

      {/* Inline annotation cards */}
      {annotations.items.length > 0 && (
        <div className="fv-render__ann-cards">
          {annotations.items.map((a) => (
            <FileAnnotationCard
              key={a.id}
              annotation={a}
              onEdit={editAnnotation}
              onRemove={removeAnnotation}
              onSend={handleSendSingle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
