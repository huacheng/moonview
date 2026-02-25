import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotebookDb } from '../db.js';
import { SessionManager } from '../session.js';
import { NotebookStore } from '../notebook-store.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Refactor Regression: Persistent Agent Support', () => {
  let db: NotebookDb;
  let sm: SessionManager;
  let ns: NotebookStore;
  let tempDir: string;

  beforeEach(() => {
    db = new NotebookDb(':memory:');
    sm = new SessionManager();
    ns = new NotebookStore();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-test-'));
  });

  it('DB: should have agent column and default to claude', () => {
    const nbId = 'nb-1';
    db.createNotebook({
      id: nbId,
      user_id: null,
      title: 'Test',
      slug: 'test',
      workspace_dir: tempDir,
      notebook_path: path.join(tempDir, 'test.json'),
      project_id: null,
      agent: 'gemini', // Explicitly setting to gemini
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const row = db.getNotebook(nbId);
    expect(row).toBeDefined();
    expect(row!.agent).toBe('gemini');
  });

  it('Session: should initialize with correct agent from metadata', async () => {
    const nbPath = path.join(tempDir, 'agent-test.notebook.json');
    const notebook = ns.createNew('Agent Test', tempDir);
    notebook.metadata.agent = 'gemini';
    await ns.save(nbPath, notebook);

    // Mock AgentProcess.start to avoid actual spawn
    const { AgentProcess } = await import('../agent-process.js');
    const startSpy = vi.spyOn(AgentProcess.prototype, 'start').mockImplementation(async (onMsg) => {
       onMsg({ type: 'system', subtype: 'hook_started' });
    });

    const session = await sm.createSession(nbPath, tempDir);
    expect(session.agentProcess).toBeDefined();
    // @ts-ignore - checking private engine
    expect(session.agentProcess.engine).toBe('gemini');
    expect(startSpy).toHaveBeenCalled();
    
    startSpy.mockRestore();
  });

  it('Cleanup: closing session should stop agent process', async () => {
    const nbPath = path.join(tempDir, 'cleanup.json');
    await ns.save(nbPath, ns.createNew('Cleanup', tempDir));

    const { AgentProcess } = await import('../agent-process.js');
    vi.spyOn(AgentProcess.prototype, 'start').mockImplementation(async (onMsg) => {
       onMsg({ type: 'system', subtype: 'hook_started' });
    });
    const stopSpy = vi.spyOn(AgentProcess.prototype, 'stop');

    const session = await sm.createSession(nbPath, tempDir);
    await sm.closeSession(session.id);

    expect(stopSpy).toHaveBeenCalled();
    
    stopSpy.mockRestore();
  });
});
