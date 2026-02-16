// Unit tests for HTTP status code to error classification

import { describe, expect, it } from "vitest"
import { classifyResponseError } from "@/http/error-mapper"
import {
  NotFoundError,
  RateLimitedError,
  TimeoutError,
  TransportError,
} from "@/errors"

describe("classifyResponseError", () => {
  const testUrl = "https://www.sec.gov/test/path"

  describe("5xx server errors (retryable)", () => {
    it("500 Internal Server Error → TransportError(retryable=true)", () => {
      const error = classifyResponseError(500, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.name).toBe("TransportError")
      expect(error.code).toBe("TRANSPORT_ERROR")
      expect(error.retryable).toBe(true)
      expect(error.message).toBe(`HTTP 500 from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 500, url: testUrl })
    })

    it("503 Service Unavailable → TransportError(retryable=true)", () => {
      const error = classifyResponseError(503, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(true)
      expect(error.message).toBe(`HTTP 503 from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 503, url: testUrl })
    })

    it("502 Bad Gateway → TransportError(retryable=true)", () => {
      const error = classifyResponseError(502, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(true)
      expect(error.metadata).toEqual({ statusCode: 502, url: testUrl })
    })

    it("504 Gateway Timeout → TransportError(retryable=true)", () => {
      const error = classifyResponseError(504, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(true)
      expect(error.metadata).toEqual({ statusCode: 504, url: testUrl })
    })

    it("599 (edge of 5xx range) → TransportError(retryable=true)", () => {
      const error = classifyResponseError(599, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(true)
      expect(error.metadata).toEqual({ statusCode: 599, url: testUrl })
    })
  })

  describe("429 rate limiting (retryable)", () => {
    it("429 Too Many Requests → RateLimitedError(retryable=true)", () => {
      const error = classifyResponseError(429, testUrl)

      expect(error).toBeInstanceOf(RateLimitedError)
      expect(error.name).toBe("RateLimitedError")
      expect(error.code).toBe("RATE_LIMITED")
      expect(error.retryable).toBe(true)
      expect(error.message).toBe(`HTTP 429 Too Many Requests from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 429, url: testUrl })
    })
  })

  describe("408 request timeout (retryable)", () => {
    it("408 Request Timeout → TimeoutError(retryable=true)", () => {
      const error = classifyResponseError(408, testUrl)

      expect(error).toBeInstanceOf(TimeoutError)
      expect(error.name).toBe("TimeoutError")
      expect(error.code).toBe("TIMEOUT")
      expect(error.retryable).toBe(true)
      expect(error.message).toBe(`HTTP 408 Request Timeout from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 408, url: testUrl })
    })
  })

  describe("404 not found (non-retryable)", () => {
    it("404 Not Found → NotFoundError(retryable=false)", () => {
      const error = classifyResponseError(404, testUrl)

      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.name).toBe("NotFoundError")
      expect(error.code).toBe("NOT_FOUND")
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`HTTP 404 Not Found: ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 404, url: testUrl })
    })
  })

  describe("other 4xx client errors (non-retryable)", () => {
    it("400 Bad Request → TransportError(retryable=false)", () => {
      const error = classifyResponseError(400, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`HTTP 400 from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 400, url: testUrl })
    })

    it("401 Unauthorized → TransportError(retryable=false)", () => {
      const error = classifyResponseError(401, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.metadata).toEqual({ statusCode: 401, url: testUrl })
    })

    it("403 Forbidden → TransportError(retryable=false)", () => {
      const error = classifyResponseError(403, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.metadata).toEqual({ statusCode: 403, url: testUrl })
    })

    it("405 Method Not Allowed → TransportError(retryable=false)", () => {
      const error = classifyResponseError(405, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.metadata).toEqual({ statusCode: 405, url: testUrl })
    })

    it("422 Unprocessable Entity → TransportError(retryable=false)", () => {
      const error = classifyResponseError(422, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.metadata).toEqual({ statusCode: 422, url: testUrl })
    })

    it("499 (edge of 4xx range, excluding 408) → TransportError(retryable=false)", () => {
      const error = classifyResponseError(499, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.metadata).toEqual({ statusCode: 499, url: testUrl })
    })
  })

  describe("unexpected status codes (non-retryable)", () => {
    it("600 (beyond 5xx range) → TransportError(retryable=false)", () => {
      const error = classifyResponseError(600, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`Unexpected HTTP 600 from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 600, url: testUrl })
    })

    it("999 (far outside normal range) → TransportError(retryable=false)", () => {
      const error = classifyResponseError(999, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`Unexpected HTTP 999 from ${testUrl}`)
      expect(error.metadata).toEqual({ statusCode: 999, url: testUrl })
    })

    it("200 (success code, unexpected call) → TransportError(retryable=false)", () => {
      // Function should only be called for error responses, but handle gracefully
      const error = classifyResponseError(200, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`Unexpected HTTP 200 from ${testUrl}`)
    })

    it("301 (redirect, unexpected) → TransportError(retryable=false)", () => {
      const error = classifyResponseError(301, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`Unexpected HTTP 301 from ${testUrl}`)
    })

    it("100 (informational, unexpected) → TransportError(retryable=false)", () => {
      const error = classifyResponseError(100, testUrl)

      expect(error).toBeInstanceOf(TransportError)
      expect(error.retryable).toBe(false)
      expect(error.message).toBe(`Unexpected HTTP 100 from ${testUrl}`)
    })
  })

  describe("metadata preservation", () => {
    it("includes statusCode and url in all error metadata", () => {
      const testCases = [
        { code: 500, expectedType: TransportError },
        { code: 503, expectedType: TransportError },
        { code: 429, expectedType: RateLimitedError },
        { code: 408, expectedType: TimeoutError },
        { code: 404, expectedType: NotFoundError },
        { code: 400, expectedType: TransportError },
        { code: 403, expectedType: TransportError },
      ]

      for (const { code, expectedType } of testCases) {
        const error = classifyResponseError(code, testUrl)
        expect(error).toBeInstanceOf(expectedType)
        expect(error.metadata).toBeDefined()
        expect(error.metadata?.statusCode).toBe(code)
        expect(error.metadata?.url).toBe(testUrl)
      }
    })

    it("preserves different URLs correctly", () => {
      const url1 = "https://www.sec.gov/filing1"
      const url2 = "https://www.sec.gov/filing2"

      const error1 = classifyResponseError(404, url1)
      const error2 = classifyResponseError(404, url2)

      expect(error1.metadata?.url).toBe(url1)
      expect(error2.metadata?.url).toBe(url2)
    })
  })

  describe("error code assignment", () => {
    it("assigns correct error codes to each error type", () => {
      expect(classifyResponseError(500, testUrl).code).toBe("TRANSPORT_ERROR")
      expect(classifyResponseError(429, testUrl).code).toBe("RATE_LIMITED")
      expect(classifyResponseError(408, testUrl).code).toBe("TIMEOUT")
      expect(classifyResponseError(404, testUrl).code).toBe("NOT_FOUND")
      expect(classifyResponseError(400, testUrl).code).toBe("TRANSPORT_ERROR")
    })
  })

  describe("comprehensive status code coverage", () => {
    it("covers all common 5xx status codes as retryable", () => {
      const serverErrors = [500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511]

      for (const code of serverErrors) {
        const error = classifyResponseError(code, testUrl)
        expect(error.retryable).toBe(true)
      }
    })

    it("covers all common 4xx status codes as non-retryable (except 408, 429)", () => {
      const clientErrors = [400, 401, 402, 403, 405, 406, 407, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 431, 451]

      for (const code of clientErrors) {
        const error = classifyResponseError(code, testUrl)
        expect(error.retryable).toBe(false)
      }
    })
  })
})
