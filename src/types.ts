export type JobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type JobHandler<T> = () => Promise<T>;

export interface JobOptions {
  maxRetries?: number;
}

export interface JobSnapshot<T = unknown> {
  id: string;
  state: JobState;
  attempts: number;
  result?: T;
  error?: unknown;
}

export interface EnqueueOptions {
  priority?: number;
}