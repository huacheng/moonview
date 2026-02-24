/**
 * uiSlice tests — interaction contract regression.
 *
 * Tests:
 * - leftSidebarSplitRatio default and clamping
 * - setOpenFile with all three sources + null close
 * - filesPanelOpen / toggleFilesPanel removed
 * - fileViewerMaximized toggle
 * - rightPanelOpen toggle
 */

import { describe, it, expect } from 'vitest';
import { createUiSlice } from '../store/uiSlice';

// ── Minimal slice test harness ─────────────────────────────────────────────

function createTestSlice() {
  let state: Record<string, any> = {};

  const set = (update: any) => {
    if (typeof update === 'function') {
      Object.assign(state, update(state));
    } else {
      Object.assign(state, update);
    }
  };

  const get = () => state as any;

  const slice = createUiSlice(set as any, get, {} as any);
  Object.assign(state, slice);

  return { state, getAction: (name: string) => (state as any)[name].bind(state) };
}

// ── leftSidebarSplitRatio ──────────────────────────────────────────────────

describe('leftSidebarSplitRatio', () => {
  it('defaults to 0.5', () => {
    const { state } = createTestSlice();
    expect(state.leftSidebarSplitRatio).toBe(0.5);
  });

  it('setLeftSidebarSplitRatio sets to valid value', () => {
    const { state, getAction } = createTestSlice();
    getAction('setLeftSidebarSplitRatio')(0.6);
    expect(state.leftSidebarSplitRatio).toBe(0.6);
  });

  it('clamps value below 0.2 to 0.2', () => {
    const { state, getAction } = createTestSlice();
    getAction('setLeftSidebarSplitRatio')(0.1);
    expect(state.leftSidebarSplitRatio).toBe(0.2);
  });

  it('clamps value above 0.8 to 0.8', () => {
    const { state, getAction } = createTestSlice();
    getAction('setLeftSidebarSplitRatio')(0.95);
    expect(state.leftSidebarSplitRatio).toBe(0.8);
  });

  it('clamps exactly at boundaries', () => {
    const { state, getAction } = createTestSlice();
    getAction('setLeftSidebarSplitRatio')(0.2);
    expect(state.leftSidebarSplitRatio).toBe(0.2);
    getAction('setLeftSidebarSplitRatio')(0.8);
    expect(state.leftSidebarSplitRatio).toBe(0.8);
  });
});

// ── openFile with deliverables source ──────────────────────────────────────

describe('setOpenFile', () => {
  it('accepts deliverables source', () => {
    const { state, getAction } = createTestSlice();
    getAction('setOpenFile')({ path: 'report.pdf', source: 'deliverables', sessionId: 's1' });
    expect(state.openFile).toEqual({
      path: 'report.pdf',
      source: 'deliverables',
      sessionId: 's1',
    });
  });

  it('still accepts workspace source', () => {
    const { state, getAction } = createTestSlice();
    getAction('setOpenFile')({ path: 'file.txt', source: 'workspace', sessionId: 's1' });
    expect(state.openFile?.source).toBe('workspace');
  });

  it('still accepts library source', () => {
    const { state, getAction } = createTestSlice();
    getAction('setOpenFile')({ path: 'ref.pdf', source: 'library', sessionId: 's1' });
    expect(state.openFile?.source).toBe('library');
  });

  it('accepts null to close file viewer', () => {
    const { state, getAction } = createTestSlice();
    getAction('setOpenFile')({ path: 'x', source: 'workspace', sessionId: 's1' });
    getAction('setOpenFile')(null);
    expect(state.openFile).toBeNull();
  });
});

// ── filesPanelOpen removed ─────────────────────────────────────────────────

describe('filesPanelOpen removal', () => {
  it('does not have filesPanelOpen in initial state', () => {
    const { state } = createTestSlice();
    expect(state).not.toHaveProperty('filesPanelOpen');
  });

  it('does not have toggleFilesPanel action', () => {
    const { state } = createTestSlice();
    expect(state).not.toHaveProperty('toggleFilesPanel');
  });
});

// ── Interaction contract regression ─────────────────────────────────────

describe('interaction contract regression', () => {
  it('fileViewerMaximized defaults to false', () => {
    const { state } = createTestSlice();
    expect(state.fileViewerMaximized).toBe(false);
  });

  it('toggleFileViewerMaximized flips the flag', () => {
    const { state, getAction } = createTestSlice();
    getAction('toggleFileViewerMaximized')();
    expect(state.fileViewerMaximized).toBe(true);
    getAction('toggleFileViewerMaximized')();
    expect(state.fileViewerMaximized).toBe(false);
  });

  it('rightPanelOpen defaults to true', () => {
    const { state } = createTestSlice();
    expect(state.rightPanelOpen).toBe(true);
  });

  it('toggleRightPanel flips rightPanelOpen', () => {
    const { state, getAction } = createTestSlice();
    getAction('toggleRightPanel')();
    expect(state.rightPanelOpen).toBe(false);
    getAction('toggleRightPanel')();
    expect(state.rightPanelOpen).toBe(true);
  });

  it('openFile defaults to null', () => {
    const { state } = createTestSlice();
    expect(state.openFile).toBeNull();
  });
});
