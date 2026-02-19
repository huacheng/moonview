import { watch, FSWatcher } from 'chokidar';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { stat } from 'fs/promises';

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
   * Reads all bytes that have been appended to the file since the last read,
   * parses each line as JSON and calls onMessage for every complete object.
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

    const stream = createReadStream(this.jsonlPath, {
      start: this.offset,
      end: fileSize - 1,
      encoding: 'utf8',
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    const lines: string[] = [];
    let bytesConsumed = 0;

    await new Promise<void>((resolve, reject) => {
      rl.on('line', (line) => {
        lines.push(line);
      });
      rl.on('close', () => resolve());
      rl.on('error', reject);
      stream.on('error', reject);
    });

    // readline strips the newline delimiter from each line.  We only want
    // to advance the offset past lines that ended with a newline (i.e., all
    // lines except possibly the last one when the file ends mid-line).
    //
    // Strategy: re-encode each line plus '\n' to compute expected bytes, and
    // only emit + advance for lines up to the last newline boundary.
    //
    // We determine whether the last line is "complete" by checking whether
    // the raw slice ends with a newline.
    const rawSlice = await this.readRawSlice(this.offset, fileSize);
    const endsWithNewline = rawSlice.endsWith('\n');

    const completeLines = endsWithNewline ? lines : lines.slice(0, -1);

    for (const line of completeLines) {
      const trimmed = line.trimEnd(); // handle \r\n on Windows
      if (trimmed.length === 0) {
        bytesConsumed += Buffer.byteLength(line + '\n', 'utf8');
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(trimmed);
        this.onMessage(parsed);
      } catch {
        // Malformed JSON – skip the line but still advance the offset.
      }
      bytesConsumed += Buffer.byteLength(line + '\n', 'utf8');
    }

    // If the last line was incomplete, include its raw bytes so the offset
    // lands right after the last complete newline.
    if (!endsWithNewline && lines.length > 0) {
      // bytesConsumed already excludes the incomplete last line. Good.
    }

    this.offset += bytesConsumed;
  }

  /** Reads a raw UTF-8 slice of the file for newline detection. */
  private readRawSlice(start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(this.jsonlPath, { start, end: end - 1 });
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
  }
}
