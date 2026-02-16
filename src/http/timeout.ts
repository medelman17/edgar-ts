// Timeout and abort signal composition for SEC HTTP client

import { TimeoutError, TransportError } from "@/errors"

// Web-standard APIs available globally in Node 18+ and Bun
declare const setTimeout: (callback: () => void, ms: number) => unknown
declare const fetch: (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>
declare class AbortController {
  signal: AbortSignal
  abort(reason?: unknown): void
}
declare class AbortSignal {
  static timeout(ms: number): AbortSignal
  readonly aborted: boolean
  readonly reason: unknown
  addEventListener(event: string, listener: () => void): void
}
declare class Response {
  readonly status: number
}

/**
 * Combine multiple AbortSignals into a single signal.
 * Polyfill for AbortSignal.any() (available natively in Node 22+).
 *
 * @param signals - Array of AbortSignals to combine
 * @returns Combined AbortSignal that fires when any input signal fires
 */
export function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  for (const signal of signals) {
    // If already aborted, abort immediately with that reason
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }

    // Listen for abort events
    signal.addEventListener("abort", () => {
      if (!controller.signal.aborted) {
        controller.abort(signal.reason)
      }
    })
  }

  return controller.signal
}

/**
 * Fetch with timeout and optional caller abort signal.
 * Differentiates between library timeout and caller abort for proper error classification.
 *
 * @param url - URL to fetch
 * @param timeoutMs - Timeout in milliseconds
 * @param userSignal - Optional caller-provided AbortSignal
 * @returns Promise resolving to Response
 * @throws TimeoutError if library timeout fires
 * @throws TransportError if caller aborts
 * @throws Original error for other fetch failures
 */
export async function fetchWithTimeoutAndAbort(
  url: string,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<Response> {
  // Create internal timeout signal
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  // Compose with user signal if provided
  let composedSignal: AbortSignal = timeoutSignal
  if (userSignal) {
    composedSignal = combineSignals([userSignal, timeoutSignal])
  }

  try {
    const response = await fetch(url, { signal: composedSignal })
    return response
  } catch (error) {
    // Differentiate timeout from user abort
    if (timeoutSignal.aborted && !userSignal?.aborted) {
      throw new TimeoutError(`Request timeout after ${timeoutMs}ms`, {
        metadata: { url, timeoutMs, attempt: 1 },
      })
    }

    if (userSignal?.aborted) {
      throw new TransportError("Request cancelled by caller", false, {
        metadata: { url, cancelled: true },
      })
    }

    // Re-throw original error for other failures
    throw error
  }
}
