export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Ejecuta `fn` sobre `items` con un máximo de `limit` tareas simultáneas, preservando el orden. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Permite respetar Retry-After u otros retrasos sugeridos por el servidor. */
  delayFor?: (err: unknown, attempt: number) => number | undefined;
}

/** Reintentos con backoff exponencial y jitter. */
export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 15_000;
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || (opts.shouldRetry && !opts.shouldRetry(err, attempt))) throw err;
      const suggested = opts.delayFor?.(err, attempt);
      const backoff = Math.min(max, base * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      await sleep(Math.min(max, suggested ?? backoff));
      attempt++;
    }
  }
}

/** Limita la cadencia de llamadas (p. ej. Nominatim: 1 req/s). */
export function createThrottle(minIntervalMs: number) {
  let last = 0;
  let chain = Promise.resolve();
  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = run.catch(() => undefined);
    return run.then(fn);
  };
}
