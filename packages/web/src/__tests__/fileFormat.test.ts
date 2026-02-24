/**
 * fileFormat tests — binary format identification + library session fallback.
 */

import { describe, it, expect } from 'vitest';

describe('binary format identification', () => {
  const binaryFormats = ['pdf-binary', 'docx-binary', 'xlsx-binary', 'pptx-binary'];
  const nonBinaryFormats = ['text', 'html'];

  it.each(binaryFormats)('%s is identified as binary by endsWith("-binary")', (fmt) => {
    expect(fmt.endsWith('-binary')).toBe(true);
  });

  it.each(nonBinaryFormats)('%s is NOT identified as binary', (fmt) => {
    expect(fmt.endsWith('-binary')).toBe(false);
  });
});

describe('canEdit logic', () => {
  function canEdit(format: string | null): boolean {
    return format !== null && !format.endsWith('-binary') && format !== 'unsupported';
  }

  it('text → true', () => expect(canEdit('text')).toBe(true));
  it('html → true', () => expect(canEdit('html')).toBe(true));
  it('pdf-binary → false', () => expect(canEdit('pdf-binary')).toBe(false));
  it('docx-binary → false', () => expect(canEdit('docx-binary')).toBe(false));
  it('xlsx-binary → false', () => expect(canEdit('xlsx-binary')).toBe(false));
  it('pptx-binary → false', () => expect(canEdit('pptx-binary')).toBe(false));
  it('unsupported → false', () => expect(canEdit('unsupported')).toBe(false));
  it('null → false', () => expect(canEdit(null)).toBe(false));
});

describe('PDF zoom scale', () => {
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.25;

  function clampScale(scale: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(scale * 100) / 100));
  }

  function zoomIn(scale: number): number {
    return clampScale(scale + ZOOM_STEP);
  }

  function zoomOut(scale: number): number {
    return clampScale(scale - ZOOM_STEP);
  }

  it('default scale is 1.0', () => {
    expect(clampScale(1.0)).toBe(1.0);
  });

  it('zoomIn from 1.0 → 1.25', () => {
    expect(zoomIn(1.0)).toBe(1.25);
  });

  it('zoomOut from 1.0 → 0.75', () => {
    expect(zoomOut(1.0)).toBe(0.75);
  });

  it('clamps at max 3.0', () => {
    expect(zoomIn(3.0)).toBe(3.0);
    expect(clampScale(5.0)).toBe(3.0);
  });

  it('clamps at min 0.5', () => {
    expect(zoomOut(0.5)).toBe(0.5);
    expect(clampScale(0.1)).toBe(0.5);
  });

  it('rounds to avoid floating point drift', () => {
    // 0.75 + 0.25 = 1.0 exactly
    expect(zoomIn(0.75)).toBe(1.0);
    // 1.25 - 0.25 = 1.0 exactly
    expect(zoomOut(1.25)).toBe(1.0);
  });
});

describe('PDF page indicator', () => {
  it('formats page display correctly', () => {
    const formatPageInfo = (current: number, total: number) => `${current} / ${total}`;
    expect(formatPageInfo(1, 10)).toBe('1 / 10');
    expect(formatPageInfo(5, 20)).toBe('5 / 20');
  });
});

describe('tab title truncation', () => {
  const MAX_TAB_CHARS = 20;
  function truncate(s: string): string {
    return s.length > MAX_TAB_CHARS ? s.slice(0, MAX_TAB_CHARS) + '…' : s;
  }

  it('short name unchanged', () => {
    expect(truncate('report.pdf')).toBe('report.pdf');
  });

  it('exactly 20 chars unchanged', () => {
    const s = 'a'.repeat(20);
    expect(truncate(s)).toBe(s);
  });

  it('21 chars truncated with ellipsis', () => {
    const s = 'a'.repeat(21);
    expect(truncate(s)).toBe('a'.repeat(20) + '…');
  });

  it('long filename truncated', () => {
    const name = 'Citadel Securities Technical Report - Dissecting.pdf';
    expect(truncate(name).length).toBe(21); // 20 chars + ellipsis
    expect(truncate(name).endsWith('…')).toBe(true);
  });

  it('Git tab title truncated', () => {
    const title = 'Git(My Very Long Project Name Here)';
    expect(truncate(title).length).toBe(21);
    expect(truncate(title)).toBe('Git(My Very Long Pro…');
  });
});

describe('library session fallback', () => {
  function effectiveSessionId(sessionId: string | null, source: string): string | null {
    if (!sessionId && source !== 'library') return null;
    return sessionId || '__library__';
  }

  it('empty string + library → __library__', () => {
    expect(effectiveSessionId('', 'library')).toBe('__library__');
  });

  it('null + library → __library__', () => {
    expect(effectiveSessionId(null, 'library')).toBe('__library__');
  });

  it('valid sessionId + library → keeps original', () => {
    expect(effectiveSessionId('s1', 'library')).toBe('s1');
  });

  it('empty string + workspace → null (blocked)', () => {
    expect(effectiveSessionId('', 'workspace')).toBeNull();
  });

  it('null + workspace → null (blocked)', () => {
    expect(effectiveSessionId(null, 'workspace')).toBeNull();
  });

  it('valid sessionId + workspace → keeps original', () => {
    expect(effectiveSessionId('s1', 'workspace')).toBe('s1');
  });
});
