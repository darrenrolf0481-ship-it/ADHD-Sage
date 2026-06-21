/**
 * Tiny bounded async queue.
 *
 * Limits concurrency for fire-and-forget work like bulk memory ingestion so it
 * doesn't swamp the event loop or SQLite.
 */

export interface QueueOptions {
  concurrency?: number;
}

export class AsyncQueue {
  private concurrency: number;
  private running = 0;
  private pending: Array<() => void> = [];

  constructor(options: QueueOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 4);
  }

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.pump();
        }
      };

      this.pending.push(task);
      this.pump();
    });
  }

  private pump() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift()!;
      next();
    }
  }

  async drain(): Promise<void> {
    while (this.running > 0 || this.pending.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}
