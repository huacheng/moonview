import { useStore } from '../store';
import type { CellType } from '@notebook-ai/shared';

/**
 * Convenience hook that exposes all notebook-level actions and state.
 *
 * Components that only need a slice of state should use `useStore` directly
 * with a selector to avoid unnecessary re-renders.
 */
export function useNotebook() {
  const notebook = useStore((s) => s.notebook);
  const activeTab = useStore((s) => s.activeTab);
  const wsStatus = useStore((s) => s.wsStatus);

  const setNotebook = useStore((s) => s.setNotebook);
  const updateTitle = useStore((s) => s.updateTitle);
  const addCell = useStore((s) => s.addCell);
  const removeCell = useStore((s) => s.removeCell);
  const moveCell = useStore((s) => s.moveCell);
  const updateCellSource = useStore((s) => s.updateCellSource);
  const setCellStatus = useStore((s) => s.setCellStatus);
  const appendCellOutput = useStore((s) => s.appendCellOutput);
  const setCellGitDiff = useStore((s) => s.setCellGitDiff);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const executeCell = useStore((s) => s.executeCell);
  const saveNotebook = useStore((s) => s.saveNotebook);
  const exportHtml = useStore((s) => s.exportHtml);

  function addCellAfter(type: CellType, afterId: string) {
    const cells = notebook?.cells ?? [];
    const idx = cells.findIndex((c) => c.id === afterId);
    addCell(type, idx === -1 ? undefined : idx + 1);
  }

  return {
    // State
    notebook,
    activeTab,
    wsStatus,

    // Actions
    setNotebook,
    updateTitle,
    addCell,
    addCellAfter,
    removeCell,
    moveCell,
    updateCellSource,
    setCellStatus,
    appendCellOutput,
    setCellGitDiff,
    setActiveTab,
    executeCell,
    saveNotebook,
    exportHtml,
  };
}
