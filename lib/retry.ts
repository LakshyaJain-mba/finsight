// Shared retry/backoff for transient upstream LLM/embedding failures.
//
// Policy: retry on HTTP 429 (rate limit) and 503/500/502/504 (transient
// server errors) plus network errors. Exponential backoff with jitter,
// honoring Retry-After when present. Non-retryable errors (e.g. 400/401/403)
// fail fast. After the final attempt the last error is rethrown so callers
// can fail gracefully.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number; // number of retries AFTER the first attempt
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string; // for log lines
}

export class HttpError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return RETRYABLE_STATUS.has(err.status);
  // Network/DNS/timeout errors (TypeError from fetch) are transient.
  return err instanceof TypeError;
}

function parseRetryAfter(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const secs = Number(headerVal);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(headerVal);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with exponential backoff. `fn` should throw HttpError for non-2xx
 * responses so status-based retry decisions can be made.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  const label = opts.label ?? 'request';

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      if (!retryable || attempt === retries) {
        if (retryable) {
          console.error(
            `[retry] ${label}: giving up after ${attempt + 1} attempts:`,
            err instanceof Error ? err.message : err
          );
        }
        throw err;
      }
      // Exponential backoff with full jitter; honor Retry-After if provided.
      const expo = Math.min(max, base * 2 ** attempt);
      const jittered = Math.floor(Math.random() * expo);
      const explicit = err instanceof HttpError ? err.retryAfterMs : undefined;
      const delay = explicit ?? jittered;
      const status = err instanceof HttpError ? ` status=${err.status}` : '';
      console.warn(
        `[retry] ${label}: attempt ${attempt + 1}/${retries + 1} failed${status}; ` +
          `retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  // Unreachable, but satisfies the type checker.
  throw lastError;
}

/**
 * fetch wrapper that throws HttpError (with parsed Retry-After) on non-2xx,
 * so it composes with withRetry. Returns the Response on success.
 */
export async function fetchOrThrow(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    throw new HttpError(res.status, `${label} failed: ${res.status} ${body}`, retryAfterMs);
  }
  return res;
}
