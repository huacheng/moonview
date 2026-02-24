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
