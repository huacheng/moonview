import { watch, FSWatcher } from 'chokidar';
import { open, stat } from 'fs/promises';

export class JsonlWatcher {
  private offset = 0;
  private watcher: FSWatcher | null = null;
  /** Guards against concurrent readNewLines invocations. */
  private reading = false;

  constructor(
    private readonly jsonlPath: string,
    private readonly onMessage: (msg: unknown) => void,
    private readonly onError?: (err: Error) => void,
  ) {}

  /**
   * Begins watching the JSONL file for new content.
   * Immediately reads any content already present before returning, then
   * emits further messages whenever the file changes.
   */
  start(): void {
    if (this.watcher) return; // already started

    this.watcher = watch(this.jsonlPath, {
      // Do NOT emit an 'add' event for the initial file – we handle that
      // with an immediate readNewLines() call below.
      ignoreInitial: false,
      persistent: true,
      usePolling: false,
    });

    this.watcher.on('add', () => {
      this.safeRead();
    });

    this.watcher.on('change', () => {
      this.safeRead();
    });

    this.watcher.on('error', (err: unknown) => {
      this.onError?.(
        err instanceof Error ? err : new Error(String(err)),
      );
    });
  }

  /** Stops watching the file. */
  stop(): void {
    if (this.watcher) {
      this.watcher.close().catch(() => {
        // Nothing useful to do if close fails.
      });
      this.watcher = null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Calls readNewLines and swallows / forwards errors. */
  private safeRead(): void {
    if (this.reading) return;
    this.reading = true;
    this.readNewLines()
      .catch((err: unknown) => {
        this.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      })
      .finally(() => {
        this.reading = false;
      });
  }

  /**
   * Reads all bytes that have been appended to the file since the last read
   * using a single file handle + read call. Parses each complete line as
   * JSON and calls onMessage for every valid object.
   *
   * Partial lines (no trailing newline yet) are NOT emitted; the offset is
   * only advanced to the last complete newline so the partial content will
   * be re-read on the next change event.
   */
  private async readNewLines(): Promise<void> {
    let fileSize: number;
    try {
      const stats = await stat(this.jsonlPath);
      fileSize = stats.size;
    } catch {
      // File may not exist yet; nothing to do.
      return;
    }

    if (fileSize <= this.offset) return;

    const bytesToRead = fileSize - this.offset;
    const buffer = Buffer.alloc(bytesToRead);

    const fh = await open(this.jsonlPath, 'r');
    try {
      await fh.read(buffer, 0, bytesToRead, this.offset);
    } finally {
      await fh.close();
    }

    const raw = buffer.toString('utf8');
    const endsWithNewline = raw.endsWith('\n');
    const lines = raw.split('\n');

    // If the file doesn't end with \n, the last element is an incomplete
    // line — drop it so it will be re-read on the next change event.
    if (!endsWithNewline) {
      lines.pop();
    } else {
      // split on a trailing \n produces an empty last element — remove it.
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
    }

    let bytesConsumed = 0;

    for (const line of lines) {
      // Account for this line + its newline delimiter.
      bytesConsumed += Buffer.byteLength(line + '\n', 'utf8');

      const trimmed = line.trimEnd(); // handle \r\n on Windows
      if (trimmed.length === 0) continue;

      try {
        const parsed: unknown = JSON.parse(trimmed);
        this.onMessage(parsed);
      } catch {
        // Malformed JSON – skip the line but still advance the offset.
      }
    }

    this.offset += bytesConsumed;
  }
}
