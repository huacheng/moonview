import { type WebSocketServer, type WebSocket } from 'ws';
import crypto from 'crypto';
import {
  WSClientMessageSchema,
  type Notebook,
} from '@notebook-ai/shared';
import type { SessionManager } from './session.js';
import type { NotebookDb } from './db.js';
import { NotebookStore } from './notebook-store.js';
import { authEnabled } from './auth.js';
import { validateWorkspacePath } from './workspace-files.js';
import { exportToHtml } from './export.js';

function sendToClient(ws: WebSocket, msg: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function setupWebSocket(
  wss: WebSocketServer,
  db: NotebookDb,
  sessionManager: SessionManager,
  notebookStore: NotebookStore,
): void {
  // Global: session_id → the one WS connection allowed to subscribe to it.
  const sessionOwners = new Map<string, WebSocket>();

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const token = url.searchParams.get('token') ?? undefined;

    if (authEnabled) {
      const NB_AUTH_TOKEN = process.env['NB_AUTH_TOKEN'] ?? '';
      if (!token || token !== NB_AUTH_TOKEN) {
        sendToClient(ws, { type: 'error', message: 'Unauthorized.' });
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    const clientId = crypto.randomUUID();
    console.log(`[ws] Client ${clientId} connected`);

    // Per-connection subscription map: sessionId → removeListener
    const subscriptions = new Map<string, () => void>();

    ws.on('message', async (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        sendToClient(ws, { type: 'error', message: 'Invalid JSON.' });
        return;
      }

      const result = WSClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        sendToClient(ws, {
          type: 'error',
          message: `Invalid message: ${result.error.message}`,
        });
        return;
      }

      const msg = result.data;

      switch (msg.type) {
        case 'subscribe': {
          const { session_id } = msg;
          if (subscriptions.has(session_id)) break;

          const owner = sessionOwners.get(session_id);
          if (owner && owner !== ws) {
            sendToClient(ws, { type: 'session_already_open', session_id });
            break;
          }

          const session = sessionManager.getSession(session_id);
          if (!session) {
            sendToClient(ws, {
              type: 'error',
              session_id,
              message: `Session "${session_id}" not found.`,
            });
            break;
          }
          const remove = sessionManager.addListener(session_id, (event) => {
            sendToClient(ws, event);
          });
          if (remove) {
            subscriptions.set(session_id, remove);
            sessionOwners.set(session_id, ws);
            console.log(`[ws] Client ${clientId} subscribed to session ${session_id}`);
          }
          break;
        }

        case 'unsubscribe': {
          const { session_id } = msg;
          const remove = subscriptions.get(session_id);
          if (remove) {
            remove();
            subscriptions.delete(session_id);
            if (sessionOwners.get(session_id) === ws) sessionOwners.delete(session_id);
            console.log(`[ws] Client ${clientId} unsubscribed from session ${session_id}`);
          }
          break;
        }

        case 'execute_request': {
          const { session_id, cell_id, source } = msg;
          try {
            await sessionManager.executeCell(session_id, cell_id, source);
          } catch (err) {
            sendToClient(ws, {
              type: 'error',
              session_id,
              message: String(err),
              cell_id,
            });
          }
          break;
        }

        case 'save_notebook': {
          const { session_id } = msg;
          const session = sessionManager.getSession(session_id);
          if (!session) {
            sendToClient(ws, { type: 'error', session_id, message: `Session "${session_id}" not found.` });
            break;
          }
          try {
            const safePath = await validateWorkspacePath(msg.path, session.cwd).catch(() => null);
            if (!safePath) {
              sendToClient(ws, { type: 'error', session_id, message: 'Save path is outside the workspace.' });
              break;
            }
            await notebookStore.save(safePath, session.notebook);
            console.log(`[ws] Notebook saved to "${safePath}"`);
            if (session.notebookDbId) {
              db.updateNotebook(session.notebookDbId, {
                cell_count: session.notebook.cells.length,
                updated_at: new Date().toISOString(),
              });
            }
          } catch (err) {
            sendToClient(ws, { type: 'error', session_id, message: String(err) });
          }
          break;
        }

        case 'load_notebook': {
          const { session_id } = msg;
          let notebook: Notebook;
          try {
            notebook = await notebookStore.load(msg.path);
          } catch (err) {
            sendToClient(ws, { type: 'error', session_id, message: String(err) });
            break;
          }
          const loadSession = sessionManager.getSession(session_id);
          if (loadSession) loadSession.notebook = notebook;
          console.log(`[ws] Notebook loaded from "${msg.path}"`);
          break;
        }

        case 'export_html': {
          const { session_id } = msg;
          const session = sessionManager.getSession(session_id);
          if (!session) {
            sendToClient(ws, {
              type: 'error',
              session_id,
              message: 'No notebook found for this session.',
            });
            break;
          }
          try {
            const html = await exportToHtml(session.notebook, { ...msg.options, minify: false });
            sendToClient(ws, { type: 'export_complete', session_id, html });
          } catch (err) {
            sendToClient(ws, { type: 'error', session_id, message: String(err) });
          }
          break;
        }

        case 'slice_update': {
          const { session_id } = msg;
          const session = sessionManager.getSession(session_id);
          if (session) {
            session.notebook = {
              ...session.notebook,
              slice: {
                ...session.notebook.slice,
                sections: msg.sections,
                updated_at: new Date().toISOString(),
              },
            };
          }
          break;
        }

        case 'ping': {
          sendToClient(ws, { type: 'pong' });
          break;
        }

        case 'update_cell_source': {
          const { session_id, cell_id, source } = msg;
          const session = sessionManager.getSession(session_id);
          if (session) {
            session.notebook = {
              ...session.notebook,
              cells: session.notebook.cells.map((c) =>
                c.id === cell_id ? { ...c, source } : c,
              ),
            };
          }
          break;
        }

        default: {
          msg satisfies never;
          sendToClient(ws, { type: 'error', message: 'Unknown message type.' });
          break;
        }
      }
    });

    function cleanup() {
      for (const [session_id, remove] of subscriptions.entries()) {
        remove();
        if (sessionOwners.get(session_id) === ws) sessionOwners.delete(session_id);
      }
      subscriptions.clear();
    }

    ws.on('close', () => {
      console.log(`[ws] Client ${clientId} disconnected`);
      cleanup();
    });

    ws.on('error', (err) => {
      console.error(`[ws] Client ${clientId} error:`, err.message);
      cleanup();
    });
  });
}
