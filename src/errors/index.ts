// Typed error taxonomy with retryability hints

export type EdgarErrorCode =
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "TRANSPORT_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "PARSE_ERROR"
  | "UNKNOWN_ERROR"

export class EdgarError extends Error {
  readonly code: EdgarErrorCode
  readonly retryable: boolean
  readonly metadata?: Record<string, unknown>

  constructor(
    message: string,
    code: EdgarErrorCode,
    retryable: boolean,
    options?: { cause?: unknown; metadata?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause })
    this.name = "EdgarError"
    this.code = code
    this.retryable = retryable
    this.metadata = options?.metadata
  }
}

export class ConfigurationError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "CONFIGURATION_ERROR", false, options)
    this.name = "ConfigurationError"
  }
}

export class ValidationError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "VALIDATION_ERROR", false, options)
    this.name = "ValidationError"
  }
}

export class TransportError extends EdgarError {
  constructor(
    message: string,
    retryable: boolean,
    options?: { cause?: unknown; metadata?: Record<string, unknown> },
  ) {
    super(message, "TRANSPORT_ERROR", retryable, options)
    this.name = "TransportError"
  }
}

export class RateLimitedError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "RATE_LIMITED", true, options)
    this.name = "RateLimitedError"
  }
}

export class TimeoutError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "TIMEOUT", true, options)
    this.name = "TimeoutError"
  }
}

export class NotFoundError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "NOT_FOUND", false, options)
    this.name = "NotFoundError"
  }
}

export class ParseError extends EdgarError {
  constructor(message: string, options?: { cause?: unknown; metadata?: Record<string, unknown> }) {
    super(message, "PARSE_ERROR", false, options)
    this.name = "ParseError"
  }
}
