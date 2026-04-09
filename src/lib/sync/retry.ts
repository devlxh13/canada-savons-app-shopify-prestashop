import type { SyncResult } from "./types";

export const IMMEDIATE_MAX_ATTEMPTS = 3;
export const DEFERRED_MAX_ATTEMPTS = 10;

/** Backoff delays for immediate retry: 1s, 3s, 9s */
function immediateDelay(attempt: number): number {
  return 1000 * Math.pow(3, attempt - 1);
}

/**
 * Wraps a sync function with immediate retry (up to 3 attempts with exponential backoff).
 * If all attempts fail, throws the last error — caller is responsible for queueing.
 *
 * @param delayFn - override delay logic (useful for testing). Defaults to exponential backoff.
 */
export async function withImmediateRetry(
  fn: () => Promise<SyncResult>,
  delayFn: (attempt: number) => number = immediateDelay,
): Promise<SyncResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= IMMEDIATE_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < IMMEDIATE_MAX_ATTEMPTS) {
        await sleep(delayFn(attempt));
      }
    }
  }

  throw lastError!;
}

/**
 * Compute the next retry time for deferred retries.
 * Attempts 4-6: 15 minutes, 7-8: 1 hour, 9-10: 4 hours.
 */
export function computeDeferredNextRetry(
  attemptCount: number,
  from: Date,
): Date {
  let delayMs: number;
  if (attemptCount <= 6) {
    delayMs = 15 * 60 * 1000; // 15 min
  } else if (attemptCount <= 8) {
    delayMs = 60 * 60 * 1000; // 1 hour
  } else {
    delayMs = 4 * 60 * 60 * 1000; // 4 hours
  }
  return new Date(from.getTime() + delayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
