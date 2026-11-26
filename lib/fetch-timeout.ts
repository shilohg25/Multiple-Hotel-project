export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

export class RequestTimeoutError extends Error {
  readonly timedOut = true as const;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (error && typeof error === 'object' && 'name' in error) {
    return (error as { name: string }).name === 'AbortError';
  }
  return false;
}

export function isNetworkError(error: unknown): boolean {
  if (isAbortOrTimeoutError(error)) return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    return message.includes('failed to fetch') || message.includes('network') || message.includes('abort');
  }
  return false;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (init.signal) init.signal.removeEventListener('abort', onCallerAbort);
  }
}
