import { Job } from "./job.js";

export interface SchedulerOptions {
  maxConcurrency: number;
  maxRetries?: number;
}

interface QueueEntry<T = unknown> {
  job: Job<T>;
  retriesRemaining: number;
}

interface QueueEntry<T = unknown> {
  job: Job<T>;
  retriesRemaining: number;
  priority: number;
  sequence: number;
}
export class JobScheduler {
  private readonly queue: QueueEntry[] = [];
  private readonly running = new Set<Promise<void>>();
  private readonly maxConcurrency: number;
  private readonly maxRetries: number;
  private sequence = 0;

  constructor(options: SchedulerOptions) {
    if (!Number.isInteger(options.maxConcurrency)) {
      throw new Error("maxConcurrency must be an integer");
    }

    if (options.maxConcurrency < 1) {
      throw new Error("maxConcurrency must be greater than zero");
    }

    if (
      options.maxRetries !== undefined &&
      (!Number.isInteger(options.maxRetries) ||
        options.maxRetries < 0)
    ) {
      throw new Error(
        "maxRetries must be a non-negative integer",
      );
    }

    this.maxConcurrency = options.maxConcurrency;
    this.maxRetries = options.maxRetries ?? 0;
  }

  enqueue<T>(
    job: Job<T>,
    options: { priority?: number } = {},
  ): void {
    const entry: QueueEntry<T> = {
      job,
      retriesRemaining: this.maxRetries,
      priority: options.priority ?? 0,
      sequence: this.sequence++,
    };

    this.queue.push(entry);
    this.sortQueue();
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  get runningCount(): number {
    return this.running.size;
  }

  async drain(): Promise<void> {
    while (
      this.queue.length > 0 ||
      this.running.size > 0
    ) {
      this.startAvailableJobs();

      if (this.running.size > 0) {
        await Promise.race(this.running);
      }
    }
  }

  private startAvailableJobs(): void {
    while (
      this.running.size < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const entry = this.queue.shift();

      if (!entry) {
        return;
      }

      const execution = this.execute(entry);
      this.running.add(execution);

      execution.finally(() => {
        this.running.delete(execution);
      });
    }
  }

  private async execute(entry: QueueEntry): Promise<void> {
    try {
      await entry.job.run();
    } catch {
      if (entry.retriesRemaining > 0) {
        entry.retriesRemaining -= 1;
        this.sortQueue();
        entry.job.resetForRetry();

        this.queue.push(entry);
      }
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      return a.sequence - b.sequence;
    });
  }
}
