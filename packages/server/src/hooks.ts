import { readFile, writeFile, access, unlink } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StopHookEntry {
  type: 'command';
  command: string;
}

export interface HooksConfig {
  hooks: {
    Stop: StopHookEntry[];
  };
}

/** Shape of the full hooks.json file (may contain keys beyond "Stop"). */
interface HooksFile {
  hooks?: {
    Stop?: StopHookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Path helpers ─────────────────────────────────────────────────────────────

/** Absolute path to ~/.claude/hooks.json */
function hooksFilePath(): string {
  return path.join(os.homedir(), '.claude', 'hooks.json');
}

/** Absolute path of the stop-marker file for a given session. */
export function getStopMarkerPath(sessionName: string): string {
  return path.join(os.tmpdir(), `claude-notebook-${sessionName}-done`);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the shell command that Claude Code's Stop hook should execute
 * when it finishes a response for the given session.
 */
export function generateStopHookCommand(sessionName: string): string {
  const markerPath = getStopMarkerPath(sessionName);
  return `touch ${shellEscape(markerPath)}`;
}

/**
 * Polls for the stop-marker file.  Returns true if found within the timeout,
 * false otherwise.  Removes the marker file once detected.
 *
 * @param sessionName  The tmux session name used to derive the marker path.
 * @param timeoutMs    Maximum wait time in milliseconds (default: 5 minutes).
 */
export async function waitForStopMarker(
  sessionName: string,
  timeoutMs = 5 * 60 * 1_000,
): Promise<boolean> {
  const markerPath = getStopMarkerPath(sessionName);
  const pollIntervalMs = 300;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await fileExists(markerPath)) {
      // Clean up before returning so stale markers don't confuse future polls.
      try {
        await unlink(markerPath);
      } catch {
        // Best-effort – if removal fails the caller can still proceed.
      }
      return true;
    }
    await sleep(pollIntervalMs);
  }

  return false;
}

/**
 * Reads ~/.claude/hooks.json (creating it if absent), merges the Stop hook
 * for this session into the existing config, then writes it back.
 *
 * Existing Stop entries for OTHER sessions are preserved.  If an identical
 * command is already registered, it is not duplicated.
 */
export async function setupHooks(sessionName: string): Promise<void> {
  const hooksPath = hooksFilePath();
  const newCommand = generateStopHookCommand(sessionName);

  // ── Read existing config ───────────────────────────────────────────────
  let existing: HooksFile = {};
  try {
    const raw = await readFile(hooksPath, 'utf8');
    existing = JSON.parse(raw) as HooksFile;
  } catch (err) {
    // File is missing or not valid JSON – start fresh.
    if (!isNodeError(err) || err.code !== 'ENOENT') {
      // Log but don't fail on a parse error; we'll overwrite the bad file.
      console.warn(
        `[hooks] Could not parse ${hooksPath}, starting fresh: ${String(err)}`,
      );
    }
    existing = {};
  }

  // ── Merge ─────────────────────────────────────────────────────────────
  const currentStopHooks: StopHookEntry[] =
    Array.isArray(existing?.hooks?.Stop) ? existing.hooks!.Stop! : [];

  const alreadyRegistered = currentStopHooks.some(
    (entry) => entry.type === 'command' && entry.command === newCommand,
  );

  if (!alreadyRegistered) {
    currentStopHooks.push({ type: 'command', command: newCommand });
  }

  const merged: HooksFile = {
    ...existing,
    hooks: {
      ...(existing.hooks ?? {}),
      Stop: currentStopHooks,
    },
  };

  // ── Write ──────────────────────────────────────────────────────────────
  try {
    await writeFile(hooksPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  } catch (err) {
    throw new Error(
      `Failed to write hooks config to ${hooksPath}: ${String(err)}`,
    );
  }
}

// ── Private helpers ──────────────────────────────────────────────────────────

function shellEscape(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}
