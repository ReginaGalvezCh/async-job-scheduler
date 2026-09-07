import type {
  JobHandler,
  JobSnapshot,
  JobState,
} from "./types.js";

export class Job<T = unknown> {
  private state: JobState = "queued";
  private attempts = 0;
  private result?: T;
  private error?: unknown;

  constructor(
    public readonly id: string,
    private readonly handler: JobHandler<T>,
  ) {}

  get snapshot(): JobSnapshot<T> {
    return {
      id: this.id,
      state: this.state,
      attempts: this.attempts,
      result: this.result,
      error: this.error,
    };
  }

  async run(): Promise<T> {
    if (this.state !== "queued") {
      throw new Error(
        `Job "${this.id}" cannot run from state "${this.state}"`,
      );
    }

    this.state = "running";
    this.attempts += 1;

    try {
      const result = await this.handler();

      this.result = result;
      this.state = "succeeded";

      return result;
    } catch (error) {
      this.error = error;
      this.state = "failed";

      throw error;
    }
  }

  resetForRetry(): void {
    if (this.state !== "failed") {
      throw new Error(
        `Job "${this.id}" cannot be retried from state "${this.state}"`,
      );
    }

    this.state = "queued";
    this.error = undefined;
  }
}