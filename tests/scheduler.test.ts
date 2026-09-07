import assert from "node:assert/strict";
import test from "node:test";

import { AsyncJobScheduler } from "../src/scheduler.js";

test("enforces the concurrency limit", async () => {
  const scheduler = new AsyncJobScheduler(2);
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];

  for (const id of ["a", "b", "c"]) {
    scheduler.enqueue(id, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });
  }

  const draining = scheduler.drain();
  await Promise.resolve();
  assert.equal(peak, 2);

  releases.splice(0).forEach((release) => release());
  await Promise.resolve();
  releases.splice(0).forEach((release) => release());
  await draining;

  assert.ok(peak <= 2);
  assert.deepEqual(
    scheduler.snapshot().map((job) => job.state),
    ["succeeded", "succeeded", "succeeded"],
  );
});

test("retries a failed job deterministically", async () => {
  const scheduler = new AsyncJobScheduler(1, 1);
  let calls = 0;

  scheduler.enqueue("retry-once", async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient failure");
  });

  await scheduler.drain();
  const [job] = scheduler.snapshot();

  assert.equal(job.state, "succeeded");
  assert.equal(job.attempts, 2);
});

test("marks a job failed after retry budget is exhausted", async () => {
  const scheduler = new AsyncJobScheduler(1, 1);
  scheduler.enqueue("always-fails", async () => {
    throw new Error("boom");
  });

  await scheduler.drain();
  const [job] = scheduler.snapshot();

  assert.equal(job.state, "failed");
  assert.equal(job.attempts, 2);
});
