# Async Job Scheduler

A deterministic asynchronous job scheduler written in **TypeScript**, designed to explore concurrency control, explicit state transitions, retry behavior, priority scheduling, and reproducible testing.

The project intentionally avoids UI frameworks and external scheduling libraries so the core scheduling behavior remains easy to inspect, test, and reason about.

## Problem

Concurrent asynchronous systems become difficult to test when correctness depends on wall-clock timing, arbitrary delays, or machine speed.

A scheduler should be able to answer questions such as:

- How many jobs are allowed to run simultaneously?
- What happens when a job fails?
- When should a failed job be retried?
- Which queued job should run next?
- How can concurrency behavior be tested without relying on `setTimeout()` or sleeps?

This project separates **scheduling policy** from **job execution** and models job lifecycle explicitly.

## Core Guarantees

The scheduler maintains the following invariants:

- Running jobs never exceed `maxConcurrency`.
- Jobs follow explicit lifecycle transitions:

```text
queued -> running -> succeeded
                  -> failed
                       |
                       v
                     queued   (retry)
```

- A failed job is retried at most `maxRetries` times.
- Higher-priority queued jobs are selected before lower-priority jobs.
- Jobs with equal priority preserve FIFO ordering.
- `drain()` resolves only when no queued or running work remains.
- Tests control asynchronous completion explicitly instead of relying on arbitrary sleeps.

## Architecture

The implementation is intentionally small and separates three responsibilities.

### `Job`

Represents one unit of asynchronous work and owns its lifecycle state.

```text
queued
  |
  v
running
 /    \
v      v
failed succeeded
  |
  | retry
  v
queued
```

A job tracks:

- identifier
- current state
- execution attempts
- successful result
- terminal error

Invalid state transitions are rejected explicitly.

### `JobScheduler`

Owns scheduling policy.

It is responsible for:

- maintaining the pending queue
- enforcing `maxConcurrency`
- selecting the next eligible job
- retrying failed jobs
- tracking active executions
- determining when the scheduler has completely drained

The scheduler waits for the next active execution to settle and immediately attempts to fill the newly available concurrency slot.

### Deterministic Test Control

Concurrency tests should verify scheduling behavior rather than machine timing.

Instead of writing tests such as:

```ts
await new Promise((resolve) => setTimeout(resolve, 100));
```

the test suite uses explicitly controlled promises.

This allows tests to construct deterministic interleavings such as:

```text
maxConcurrency = 2

A starts
B starts
C remains queued

B completes
C starts

A completes
C completes

drain() resolves
```

The test controls when `A`, `B`, and `C` finish, making the scheduling behavior reproducible across local development and CI environments.

## Scheduling Policy

Jobs may optionally define a priority.

The queue follows:

```text
higher priority -> first

equal priority -> FIFO
```

For example:

```text
Job A: priority 1
Job B: priority 10
Job C: priority 10

execution order:

B -> C -> A
```

`B` remains ahead of `C` because both have the same priority and `B` entered the queue first.

## Retry Model

Retries are bounded.

Given:

```ts
maxRetries: 2
```

a job may execute at most three times:

```text
attempt 1 -> failed
attempt 2 -> failed
attempt 3 -> succeeded | failed
```

The attempt counter is preserved across retries so retry behavior remains observable.

A job that exhausts its retries remains in the `failed` terminal state.

## Example

```ts
import {
  Job,
  JobScheduler,
} from "./src/index.js";

const scheduler = new JobScheduler({
  maxConcurrency: 2,
  maxRetries: 1,
});

scheduler.enqueue(
  new Job("fetch-users", async () => {
    return ["Alice", "Bob"];
  }),
  { priority: 10 },
);

scheduler.enqueue(
  new Job("generate-report", async () => {
    return "report-ready";
  }),
  { priority: 5 },
);

await scheduler.drain();
```

At most two jobs can execute concurrently, failures may be retried once, and higher-priority queued work is selected first.

## Testing Strategy

The test suite focuses on behavioral invariants rather than implementation details.

Coverage includes:

- initial job state
- successful state transitions
- failed state transitions
- retry transitions
- invalid repeated execution
- execution of all queued jobs
- enforcement of `maxConcurrency`
- deterministic concurrency interleavings
- starting queued work when capacity becomes available
- successful retry behavior
- exhausted retries
- empty scheduler behavior
- invalid configuration
- priority ordering
- FIFO fairness for equal priorities

No arbitrary timing delays are required to verify concurrency behavior.

## Trade-offs

### Determinism over timing simulation

The scheduler avoids timer-based testing because elapsed wall-clock time is not the behavior being tested.

Explicit completion boundaries make concurrency scenarios easier to reproduce and debug.

### Simplicity over maximum throughput

The implementation favors observable scheduling behavior and clear invariants over advanced throughput optimizations.

This keeps scheduling decisions easy to reason about and makes regressions easier to isolate.

### Explicit state over implicit promise state

Job lifecycle is represented directly rather than inferred from whether a promise is pending, fulfilled, or rejected.

This makes state transitions observable and testable.

### In-memory scheduling

The scheduler intentionally does not provide persistence or distributed coordination.

A production distributed scheduler would require additional concerns such as durable queues, worker leases, crash recovery, idempotency, distributed locking, and observability.

Those concerns are outside the scope of this project.

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── index.ts
│   ├── job.ts
│   ├── scheduler.ts
│   └── types.ts
├── tests/
│   ├── helpers/
│   │   └── deferred.ts
│   ├── job.test.ts
│   └── scheduler.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Run Locally

Requirements:

- Node.js 22+
- npm

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run the test suite:

```bash
npm test
```

## Continuous Integration

GitHub Actions validates the project on pushes and pull requests by:

1. installing dependencies
2. compiling TypeScript
3. running the complete test suite

This ensures scheduling behavior and TypeScript correctness are continuously validated.

## What This Project Demonstrates

This repository focuses on software-engineering reasoning rather than framework-specific functionality.

It demonstrates:

- asynchronous concurrency control
- explicit state-machine design
- deterministic testing
- algorithms and queue ordering
- bounded retry strategies
- invariant-based reasoning
- failure handling
- TypeScript type safety
- regression prevention
- CI-based validation
- engineering trade-off analysis

The broader goal is to make concurrent behavior **observable, reproducible, and testable** rather than dependent on timing assumptions.