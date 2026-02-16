import type { TelemetryOptions, RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

type TelemetryEvent = RequestStartEvent | RequestEndEvent | RetryEvent

export type StructuredLoggerOptions = {
  /**
   * Writable stream to output logs to.
   * @default process.stdout
   */
  stream?: NodeJS.WritableStream

  /**
   * Custom formatter for events.
   * @default JSON.stringify
   */
  formatter?: (event: TelemetryEvent & { event: string }) => string
}

/**
 * Create a structured logger that outputs JSON Lines format (one JSON object per line).
 *
 * @example
 * ```typescript
 * const client = new EdgarClient({
 *   userAgent: "Bot/1.0",
 *   telemetry: createStructuredLogger()
 * })
 * ```
 */
export function createStructuredLogger(options: StructuredLoggerOptions = {}): TelemetryOptions {
  const {
    stream = process.stdout,
    formatter = (event) => JSON.stringify(event),
  } = options

  // Validate stream at creation time
  if (!stream.writable) {
    throw new Error("stream must be writable")
  }

  const write = (eventType: string, event: TelemetryEvent) => {
    try {
      const payload = { event: eventType, ...event }
      const output = formatter(payload)
      stream.write(output + "\n")
    } catch (err) {
      console.error(
        "[edgar-ts/telemetry:structured-logger] Error serializing event:",
        (err as Error).message
      )
    }
  }

  const onRequestStart = (event: RequestStartEvent) => {
    write("request.start", event)
  }

  const onRequestEnd = (event: RequestEndEvent) => {
    write("request.end", event)
  }

  const onRetry = (event: RetryEvent) => {
    write("request.retry", event)
  }

  return {
    onRequestStart,
    onRequestEnd,
    onRetry,
  }
}
