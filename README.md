# Async Job Scheduler

A small TypeScript scheduler focused on deterministic concurrency behavior and explicit state transitions.

## Problem

Concurrent async work is easy to make flaky when tests depend on wall-clock timing. This project separates **scheduling policy** from **job execution** so tests can control when queued work advances.

## Guarantees

- Never runs more than `maxConcurrency` jobs at once.
- Jobs move through explicit states: `queued -> running -> succeeded|failed`.
- A failed job can be retried up to `maxRetries` times.
- Tests do not require sleeps.

## Design decision

Instead of relying on timers, the scheduler exposes a deterministic `drain()` boundary. This makes ordering reproducible and keeps tests independent from machine speed.

## Run

```bash
npm install
npm test
```

## What this demonstrates

Concurrency reasoning, state management, testability, and reproducibility without depending on UI frameworks.
