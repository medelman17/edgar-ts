import { describe, expect, it } from "vitest"
import {
  ConfigurationError,
  EdgarError,
  NotFoundError,
  ParseError,
  RateLimitedError,
  TimeoutError,
  TransportError,
  ValidationError,
} from "@/errors"

describe("Error taxonomy", () => {
  it("ConfigurationError is non-retryable", () => {
    const err = new ConfigurationError("bad config")
    expect(err).toBeInstanceOf(EdgarError)
    expect(err.code).toBe("CONFIGURATION_ERROR")
    expect(err.retryable).toBe(false)
    expect(err.name).toBe("ConfigurationError")
  })

  it("ValidationError is non-retryable", () => {
    const err = new ValidationError("invalid input")
    expect(err.code).toBe("VALIDATION_ERROR")
    expect(err.retryable).toBe(false)
  })

  it("TransportError retryability is configurable", () => {
    const retryable = new TransportError("503", true)
    const nonRetryable = new TransportError("400", false)
    expect(retryable.retryable).toBe(true)
    expect(nonRetryable.retryable).toBe(false)
  })

  it("RateLimitedError is retryable", () => {
    const err = new RateLimitedError("429 Too Many Requests")
    expect(err.code).toBe("RATE_LIMITED")
    expect(err.retryable).toBe(true)
  })

  it("TimeoutError is retryable", () => {
    const err = new TimeoutError("request timed out")
    expect(err.code).toBe("TIMEOUT")
    expect(err.retryable).toBe(true)
  })

  it("NotFoundError is non-retryable", () => {
    const err = new NotFoundError("filing not found")
    expect(err.code).toBe("NOT_FOUND")
    expect(err.retryable).toBe(false)
  })

  it("ParseError is non-retryable", () => {
    const err = new ParseError("unexpected response shape")
    expect(err.code).toBe("PARSE_ERROR")
    expect(err.retryable).toBe(false)
  })

  it("preserves cause chain", () => {
    const cause = new Error("original")
    const err = new TransportError("wrapped", true, { cause })
    expect(err.cause).toBe(cause)
  })

  it("carries metadata", () => {
    const err = new TransportError("failed", false, {
      metadata: { statusCode: 500, url: "https://efts.sec.gov/..." },
    })
    expect(err.metadata?.statusCode).toBe(500)
  })
})
