const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [100, 200, 400] as const;

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * fetch wrapper that retries on 5xx responses and network failures.
 * Up to 3 attempts with exponential backoff (100ms, 200ms, 400ms) between tries.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
    }

    if (init?.signal?.aborted) {
      throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await fetch(input, init);

      if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
        return response;
      }
    } catch (error) {
      if (isAbortError(error) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error("fetchWithRetry failed");
}
