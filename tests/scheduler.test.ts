import assert from "node:assert/strict";
import test from "node:test";

import { Job } from "../src/job.js";
import { JobScheduler } from "../src/scheduler.js";
import { Deferred } from "./helpers/deferred.js";

test("scheduler executes all queued jobs", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 2,
  });

  const executed: string[] = [];

  scheduler.enqueue(
    new Job("a", async () => {
      executed.push("a");
    }),
  );

  scheduler.enqueue(
    new Job("b", async () => {
      executed.push("b");
    }),
  );

  scheduler.enqueue(
    new Job("c", async () => {
      executed.push("c");
    }),
  );

  await scheduler.drain();

  assert.deepEqual(executed.sort(), ["a", "b", "c"]);
  assert.equal(scheduler.queuedCount, 0);
  assert.equal(scheduler.runningCount, 0);
});

test("scheduler never exceeds maxConcurrency", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 3,
  });

  const gates = Array.from(
    { length: 10 },
    () => new Deferred<void>(),
  );

  let running = 0;
  let peakConcurrency = 0;

  gates.forEach((gate, index) => {
    scheduler.enqueue(
      new Job(`job-${index}`, async () => {
        running += 1;

        peakConcurrency = Math.max(
          peakConcurrency,
          running,
        );

        await gate.promise;

        running -= 1;
      }),
    );
  });

  const drainPromise = scheduler.drain();

  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });

  assert.equal(running, 3);
  assert.equal(peakConcurrency, 3);

  for (const gate of gates) {
    gate.resolve(undefined);

    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
  }

  await drainPromise;

  assert.equal(peakConcurrency, 3);
});

test("queued job starts when a concurrency slot becomes free", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 2,
  });

  const first = new Deferred<void>();
  const second = new Deferred<void>();
  const third = new Deferred<void>();

  const started: string[] = [];

  scheduler.enqueue(
    new Job("a", async () => {
      started.push("a");
      await first.promise;
    }),
  );

  scheduler.enqueue(
    new Job("b", async () => {
      started.push("b");
      await second.promise;
    }),
  );

  scheduler.enqueue(
    new Job("c", async () => {
      started.push("c");
      await third.promise;
    }),
  );

  const drainPromise = scheduler.drain();

  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });

  assert.deepEqual(started, ["a", "b"]);

  second.resolve(undefined);

  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });

  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });

  assert.deepEqual(started, ["a", "b", "c"]);

  first.resolve(undefined);
  third.resolve(undefined);

  await drainPromise;
});

test("failed job is retried up to maxRetries", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 1,
    maxRetries: 2,
  });

  let attempts = 0;

  const job = new Job("unstable-job", async () => {
    attempts += 1;

    if (attempts < 3) {
      throw new Error("temporary failure");
    }

    return "ok";
  });

  scheduler.enqueue(job);

  await scheduler.drain();

  assert.equal(attempts, 3);
  assert.equal(job.snapshot.state, "succeeded");
  assert.equal(job.snapshot.result, "ok");
});

test("job remains failed after exhausting retries", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 1,
    maxRetries: 2,
  });

  const job = new Job("broken-job", async () => {
    throw new Error("permanent failure");
  });

  scheduler.enqueue(job);

  await scheduler.drain();

  assert.equal(job.snapshot.state, "failed");
  assert.equal(job.snapshot.attempts, 3);
});

test("drain resolves immediately when queue is empty", async () => {
  const scheduler = new JobScheduler({
    maxConcurrency: 2,
  });

  await scheduler.drain();

  assert.equal(scheduler.queuedCount, 0);
  assert.equal(scheduler.runningCount, 0);
});

test("constructor rejects invalid concurrency", () => {
  assert.throws(
    () =>
      new JobScheduler({
        maxConcurrency: 0,
      }),
    /greater than zero/,
  );
});

test("constructor rejects negative retry count", () => {
  assert.throws(
    () =>
      new JobScheduler({
        maxConcurrency: 1,
        maxRetries: -1,
      }),
    /non-negative integer/,
  );
});