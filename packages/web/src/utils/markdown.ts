import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked: no mangling of emails, GFM enabled
marked.setOptions({ gfm: true });

/** Parse markdown to sanitized HTML string. */
export function renderMd(text: string): string {
  const raw = marked.parse(text) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
