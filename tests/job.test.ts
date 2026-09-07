import assert from "node:assert/strict";
import test from "node:test";

import { Job } from "../src/job.js";

test("job starts in queued state", () => {
  const job = new Job("job-1", async () => 42);

  assert.deepEqual(job.snapshot, {
    id: "job-1",
    state: "queued",
    attempts: 0,
    result: undefined,
    error: undefined,
  });
});

test("job transitions from queued to succeeded", async () => {
  const job = new Job("job-1", async () => 42);

  const result = await job.run();

  assert.equal(result, 42);
  assert.equal(job.snapshot.state, "succeeded");
  assert.equal(job.snapshot.attempts, 1);
  assert.equal(job.snapshot.result, 42);
});

test("job transitions to failed when handler rejects", async () => {
  const expectedError = new Error("boom");

  const job = new Job("job-1", async () => {
    throw expectedError;
  });

  await assert.rejects(job.run(), expectedError);

  assert.equal(job.snapshot.state, "failed");
  assert.equal(job.snapshot.attempts, 1);
  assert.equal(job.snapshot.error, expectedError);
});

test("failed job can be reset for retry", async () => {
  const job = new Job("job-1", async () => {
    throw new Error("boom");
  });

  await assert.rejects(job.run());

  job.resetForRetry();

  assert.equal(job.snapshot.state, "queued");
  assert.equal(job.snapshot.attempts, 1);
  assert.equal(job.snapshot.error, undefined);
});

test("successful job cannot be executed twice", async () => {
  const job = new Job("job-1", async () => 42);

  await job.run();

  await assert.rejects(
    job.run(),
    /cannot run from state "succeeded"/,
  );
});