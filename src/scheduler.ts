export type JobState = "queued" | "running" | "succeeded" | "failed";

export interface JobSnapshot {
  id: string;
  state: JobState;
  attempts: number;
}

type JobTask = () => Promise<void>;

type InternalJob = {
  id: string;
  task: JobTask;
  state: JobState;
  attempts: number;
};

export class AsyncJobScheduler {
  private readonly jobs: InternalJob[] = [];

  constructor(
    private readonly maxConcurrency: number,
    private readonly maxRetries = 0,
  ) {
    if (maxConcurrency < 1) {
      throw new Error("maxConcurrency must be at least 1");
    }
    if (maxRetries < 0) {
      throw new Error("maxRetries cannot be negative");
    }
  }

  enqueue(id: string, task: JobTask): void {
    if (this.jobs.some((job) => job.id === id)) {
      throw new Error(`duplicate job id: ${id}`);
    }
    this.jobs.push({ id, task, state: "queued", attempts: 0 });
  }

  snapshot(): JobSnapshot[] {
    return this.jobs.map(({ id, state, attempts }) => ({ id, state, attempts }));
  }

  async drain(): Promise<void> {
    while (true) {
      const queued = this.jobs.filter((job) => job.state === "queued");
      if (queued.length === 0) return;

      const batch = queued.slice(0, this.maxConcurrency);
      await Promise.all(batch.map((job) => this.run(job)));
    }
  }

  private async run(job: InternalJob): Promise<void> {
    job.state = "running";
    job.attempts += 1;

    try {
      await job.task();
      job.state = "succeeded";
    } catch {
      const retriesUsed = job.attempts - 1;
      job.state = retriesUsed < this.maxRetries ? "queued" : "failed";
    }
  }
}
