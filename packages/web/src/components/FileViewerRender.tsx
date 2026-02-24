import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import type { FileFormat } from '../hooks/useFileStream';
import type { FileAnnotations, FileAnnotation } from '../types/fileAnnotations';
import { uid, buildAnnotationText } from '../types/fileAnnotations';
import { FileSelectionFloat } from './FileSelectionFloat';
import { FileAnnotationCard } from './FileAnnotationCard';
import { FileAnnotationDropdown } from './FileAnnotationDropdown';

import { isJsonFile, formatJsonContent } from '../utils/jsonFormat';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface FileViewerRenderProps {
  format: FileFormat;
  content: string;
  pdfBuffer: Uint8Array | null;
  filename: string;
  annotations: FileAnnotations;
  filePath: string;
  onAnnotationsChange: (a: FileAnnotations) => void;
  onSendToPrompt: (text: string) => void;
}

export function FileViewerRender({
  format, content, pdfBuffer, filename, annotations, filePath, onAnnotationsChange, onSendToPrompt,
}: FileViewerRenderProps) {
  const [float, setFloat] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMd = filename.endsWith('.md');
  const isJson = isJsonFile(filename);

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
      {format === 'pdf-binary' && pdfBuffer && (
        <Document
          file={{ data: pdfBuffer }}
          onLoadSuccess={(pdf: { numPages: number }) => setPdfPages(pdf.numPages)}
          className="fv-render__pdf"
        >
          {Array.from({ length: pdfPages }, (_, i) => (
            <Page key={i + 1} pageNumber={i + 1} renderTextLayer={true} renderAnnotationLayer={false} />
          ))}
        </Document>
      )}

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
