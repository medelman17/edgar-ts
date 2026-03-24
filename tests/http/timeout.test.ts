import { beforeEach, describe, expect, it, vi } from "vitest"
import { TimeoutError, TransportError } from "@/errors"
import { combineSignals, fetchWithTimeoutAndAbort } from "@/http/timeout"

describe("combineSignals", () => {
  it("returns new signal when no inputs are aborted", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    const combined = combineSignals([controller1.signal, controller2.signal])

    expect(combined.aborted).toBe(false)
  })

  it("returns immediately aborted signal if any input is already aborted", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    controller1.abort("test reason")

    const combined = combineSignals([controller1.signal, controller2.signal])

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("test reason")
  })

  it("aborts when first signal fires", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    const combined = combineSignals([controller1.signal, controller2.signal])

    expect(combined.aborted).toBe(false)

    controller1.abort("signal 1")

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("signal 1")
  })

  it("aborts when second signal fires", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    const combined = combineSignals([controller1.signal, controller2.signal])

    expect(combined.aborted).toBe(false)

    controller2.abort("signal 2")

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("signal 2")
  })

  it("does not double-abort when multiple signals fire", () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    const combined = combineSignals([controller1.signal, controller2.signal])

    let abortCount = 0
    combined.addEventListener("abort", () => {
      abortCount++
    })

    controller1.abort("first")
    controller2.abort("second")

    expect(abortCount).toBe(1)
    expect(combined.reason).toBe("first") // First one wins
  })

  it("handles empty signal array", () => {
    const combined = combineSignals([])

    expect(combined.aborted).toBe(false)
  })

  it("handles single signal", () => {
    const controller = new AbortController()
    const combined = combineSignals([controller.signal])

    expect(combined.aborted).toBe(false)

    controller.abort("test")

    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe("test")
  })
})

describe("fetchWithTimeoutAndAbort", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers() // Most tests use real timers
  })

  it("succeeds when fetch completes before timeout", async () => {
    // Mock successful fetch
    const mockResponse = new Response("OK", { status: 200 })
    global.fetch = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchWithTimeoutAndAbort("https://example.com", 10000)

    expect(result).toBe(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith("https://example.com", {
      signal: expect.any(AbortSignal),
    })
  })

  it("throws TimeoutError when timeout fires", async () => {
    // Use fake timers for this test
    vi.useFakeTimers()

    // Mock fetch that waits for signal abort
    global.fetch = vi.fn().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"))
            })
          }
          // Never resolve - will be aborted by timeout
        }),
    )

    const promise = fetchWithTimeoutAndAbort("https://example.com", 100)

    // Advance time to trigger timeout
    await vi.advanceTimersByTimeAsync(100)

    await expect(promise).rejects.toThrow(TimeoutError)
    await expect(promise).rejects.toThrow("Request timeout after 100ms")

    try {
      await promise
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError)
      if (error instanceof TimeoutError) {
        expect(error.retryable).toBe(true)
        expect(error.metadata).toEqual({
          url: "https://example.com",
          timeoutMs: 100,
          attempt: 1,
        })
      }
    }

    vi.useRealTimers()
  })

  it("throws TransportError when user signal aborts", async () => {
    const controller = new AbortController()

    // Mock fetch that waits for abort
    global.fetch = vi.fn().mockImplementation(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
          setTimeout(() => resolve(new Response("OK")), 10000)
        }),
    )

    const promise = fetchWithTimeoutAndAbort("https://example.com", 10000, controller.signal)

    // Abort immediately
    controller.abort("user cancelled")

    await expect(promise).rejects.toThrow(TransportError)
    await expect(promise).rejects.toThrow("Request cancelled by caller")

    try {
      await promise
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError)
      if (error instanceof TransportError) {
        expect(error.retryable).toBe(false)
        expect(error.metadata).toEqual({
          url: "https://example.com",
          cancelled: true,
        })
      }
    }
  })

  it("prefers user abort over timeout when both fire", async () => {
    const controller = new AbortController()

    // Mock fetch that waits for abort
    global.fetch = vi.fn().mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
    )

    const promise = fetchWithTimeoutAndAbort("https://example.com", 10000, controller.signal)

    // User aborts first
    controller.abort("user action")

    await expect(promise).rejects.toThrow(TransportError)
    await expect(promise).rejects.toThrow("Request cancelled by caller")
  })

  it("passes user signal to fetch when provided", async () => {
    const controller = new AbortController()
    const mockResponse = new Response("OK", { status: 200 })
    global.fetch = vi.fn().mockResolvedValue(mockResponse)

    await fetchWithTimeoutAndAbort("https://example.com", 10000, controller.signal)

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1]).toHaveProperty("signal")
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal)
  })

  it("uses only timeout signal when user signal not provided", async () => {
    const mockResponse = new Response("OK", { status: 200 })
    global.fetch = vi.fn().mockResolvedValue(mockResponse)

    await fetchWithTimeoutAndAbort("https://example.com", 10000)

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1]).toHaveProperty("signal")
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal)
  })

  it("rethrows non-abort errors", async () => {
    const networkError = new Error("Network failure")
    global.fetch = vi.fn().mockRejectedValue(networkError)

    const promise = fetchWithTimeoutAndAbort("https://example.com", 10000)

    await expect(promise).rejects.toThrow("Network failure")
  })
})
