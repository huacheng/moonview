/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cacheSet, cacheGet, cacheRemove } from '../utils/localCache';

describe('localCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic set/get ────────────────────────────────────────────────────────

  it('cacheSet + cacheGet returns stored value', () => {
    cacheSet('test-key', { foo: 'bar' });
    expect(cacheGet<{ foo: string }>('test-key')).toEqual({ foo: 'bar' });
  });

  it('cacheGet returns null for missing key', () => {
    expect(cacheGet('nonexistent')).toBeNull();
  });

  // ── TTL expiry ───────────────────────────────────────────────────────────

  it('cacheGet returns null when entry exceeds TTL', () => {
    const now = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cacheSet('ttl-key', 'value');

    // Advance time past TTL (default 7 days)
    vi.spyOn(Date, 'now').mockReturnValue(now + 7 * 24 * 60 * 60 * 1000 + 1);
    expect(cacheGet('ttl-key')).toBeNull();
  });

  it('cacheGet returns value within TTL', () => {
    const now = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cacheSet('ttl-key', 'value');

    // Advance time within TTL
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 24 * 60 * 60 * 1000);
    expect(cacheGet('ttl-key')).toBe('value');
  });

  // ── Custom TTL ───────────────────────────────────────────────────────────

  it('uses custom TTL when provided', () => {
    const now = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cacheSet('custom-ttl', 'val');

    // Within 5 minute TTL
    vi.spyOn(Date, 'now').mockReturnValue(now + 4 * 60 * 1000);
    expect(cacheGet('custom-ttl', 5 * 60 * 1000)).toBe('val');

    // Past 5 minute TTL
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);
    expect(cacheGet('custom-ttl', 5 * 60 * 1000)).toBeNull();
  });

  // ── cacheRemove ──────────────────────────────────────────────────────────

  it('cacheRemove deletes entry', () => {
    cacheSet('rm-key', 'data');
    expect(cacheGet('rm-key')).toBe('data');
    cacheRemove('rm-key');
    expect(cacheGet('rm-key')).toBeNull();
  });

  // ── Quota exceeded eviction ──────────────────────────────────────────────

  it('cacheSet silently catches quota errors without crashing', () => {
    // Mock setItem to always throw QuotaExceededError
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    // Should not throw
    expect(() => cacheSet('fail-key', 'data')).not.toThrow();
  });

  // ── Non-JSON old entries ─────────────────────────────────────────────────

  it('cacheGet returns null for non-JSON entries', () => {
    localStorage.setItem('legacy-key', 'plain-string-not-json');
    expect(cacheGet('legacy-key')).toBeNull();
  });

  it('cacheGet gracefully handles old-format entries without ts field', () => {
    // Old format: just the raw value serialized
    localStorage.setItem('old-format', JSON.stringify({ content: 'hello', mtime: 123 }));
    // This is valid JSON but missing our { data, ts } wrapper — should return null
    expect(cacheGet('old-format')).toBeNull();
  });

  // ── Round-trip regression ────────────────────────────────────────────────

  it('notebook cache round-trip via cacheSet/cacheGet', () => {
    const notebook = {
      version: 1,
      metadata: { title: 'Test', created: '2026-01-01', updated: '2026-01-01' },
      cells: [{ id: 'c1', prompt: 'hello' }],
    };
    cacheSet('nb-notebook-abc', notebook);
    expect(cacheGet('nb-notebook-abc')).toEqual(notebook);
  });
});
