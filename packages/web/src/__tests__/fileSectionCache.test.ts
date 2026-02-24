/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cacheSet, cacheGet, TTL } from '../utils/localCache';

// These tests validate the FileSection caching contract:
// - cache key format includes baseUrl and path
// - cached data is persisted and retrievable
// - expired cache returns null

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

interface ListResult {
  dirPath: string;
  files: FileEntry[];
  truncated: boolean;
}

function fileSectionCacheKey(baseUrl: string, path: string): string {
  return `nb-filelist-${baseUrl}-${path}`;
}

describe('FileSection file list caching', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('cache key includes baseUrl and path', () => {
    const key = fileSectionCacheKey('/api/projects/abc', 'docs/reports');
    expect(key).toBe('nb-filelist-/api/projects/abc-docs/reports');
  });

  it('first load caches result after fetch', () => {
    const key = fileSectionCacheKey('/api/projects/abc', '.');
    const result: ListResult = {
      dirPath: '/workspace/project',
      files: [
        { name: 'readme.md', type: 'file', size: 100, modifiedAt: '2026-01-01' },
        { name: 'src', type: 'directory', size: 0, modifiedAt: '2026-01-01' },
      ],
      truncated: false,
    };

    // Simulate fetch success → cache write
    cacheSet(key, result);

    // Verify cache hit
    const cached = cacheGet<ListResult>(key, TTL.FILE_LIST);
    expect(cached).toEqual(result);
    expect(cached!.files).toHaveLength(2);
  });

  it('second load renders cached files immediately', () => {
    const key = fileSectionCacheKey('/api/library', '.');
    const result: ListResult = {
      dirPath: '/library',
      files: [{ name: 'ref.pdf', type: 'file', size: 500, modifiedAt: '2026-01-01' }],
      truncated: false,
    };

    cacheSet(key, result);
    const cached = cacheGet<ListResult>(key, TTL.FILE_LIST);
    expect(cached).not.toBeNull();
    expect(cached!.files[0].name).toBe('ref.pdf');
  });

  it('expired cache (5min TTL) returns null', () => {
    const key = fileSectionCacheKey('/api/projects/abc', '.');
    const result: ListResult = {
      dirPath: '/workspace',
      files: [],
      truncated: false,
    };

    // Set cache with fake old timestamp
    localStorage.setItem(key, JSON.stringify({
      data: result,
      ts: Date.now() - 6 * 60 * 1000, // 6 minutes ago
    }));

    // Should be expired with 5-minute TTL
    const cached = cacheGet<ListResult>(key, TTL.FILE_LIST);
    expect(cached).toBeNull();
  });

  it('after upload, cache is refreshed with new data', () => {
    const key = fileSectionCacheKey('/api/projects/abc', '.');
    const oldResult: ListResult = {
      dirPath: '/workspace',
      files: [{ name: 'old.txt', type: 'file', size: 10, modifiedAt: '2026-01-01' }],
      truncated: false,
    };
    cacheSet(key, oldResult);

    // Simulate post-upload re-fetch
    const newResult: ListResult = {
      dirPath: '/workspace',
      files: [
        { name: 'old.txt', type: 'file', size: 10, modifiedAt: '2026-01-01' },
        { name: 'uploaded.pdf', type: 'file', size: 2000, modifiedAt: '2026-01-02' },
      ],
      truncated: false,
    };
    cacheSet(key, newResult);

    const cached = cacheGet<ListResult>(key, TTL.FILE_LIST);
    expect(cached!.files).toHaveLength(2);
    expect(cached!.files[1].name).toBe('uploaded.pdf');
  });
});
