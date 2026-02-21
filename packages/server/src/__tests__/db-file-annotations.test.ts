import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookDb } from '../db.js';

describe('file_annotations table', () => {
  let db: NotebookDb;

  beforeEach(() => {
    db = new NotebookDb(':memory:');
  });

  it('upserts and retrieves annotations', () => {
    db.upsertFileAnnotations('sess-1', 'README.md', '{"items":[]}', 1000);
    const row = db.getFileAnnotations('sess-1', 'README.md');
    expect(row).not.toBeNull();
    expect(row!.content).toBe('{"items":[]}');
    expect(row!.updated_at).toBe(1000);
  });

  it('updates existing row on re-upsert', () => {
    db.upsertFileAnnotations('sess-1', 'README.md', 'v1', 100);
    db.upsertFileAnnotations('sess-1', 'README.md', 'v2', 200);
    const row = db.getFileAnnotations('sess-1', 'README.md');
    expect(row!.content).toBe('v2');
    expect(row!.updated_at).toBe(200);
  });

  it('returns null for missing entry', () => {
    expect(db.getFileAnnotations('sess-1', 'missing.md')).toBeNull();
  });

  it('cleanupOldFileAnnotations removes stale entries', () => {
    const nowMs = Date.now();
    db.upsertFileAnnotations('sess-1', 'old.md', '{}', nowMs - 8 * 24 * 60 * 60 * 1000);
    db.upsertFileAnnotations('sess-1', 'new.md', '{}', nowMs);
    db.cleanupOldFileAnnotations(7);
    expect(db.getFileAnnotations('sess-1', 'old.md')).toBeNull();
    expect(db.getFileAnnotations('sess-1', 'new.md')).not.toBeNull();
  });
});
