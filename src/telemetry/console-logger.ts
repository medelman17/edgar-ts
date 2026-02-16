declare const process: { stderr: WriteStream }
declare const console: { error: (message: string, extra?: string) => void }

import type { TelemetryOptions, RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

type WriteStream = {
  write: (data: string) => boolean
}

// Simple ANSI color mapping for Node.js terminals
const ansiColors: Record<string, string> = {
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
}

const styleText = (text: string, color: string): string => {
  const code = ansiColors[color]
  if (!code) return text
  return `${code}${text}${ansiColors.reset}`
}

export type ConsoleLoggerOptions = {
  /**
   * Enable colored output using ANSI escape codes.
   * @default true
   */
  colors?: boolean

  /**
   * Include timestamps in output.
   * @default true
   */
  timestamps?: boolean

  /**
   * Stream to write output to.
   * @default process.stderr
   */
  errorStream?: WriteStream
}

/**
 * Create a console logger that formats telemetry events as human-readable output.
 *
 * @example
 * ```typescript
 * const client = new EdgarClient({
 *   userAgent: "Bot/1.0",
 *   telemetry: createConsoleLogger()
 * })
 * ```
 */
export function createConsoleLogger(options: ConsoleLoggerOptions = {}): TelemetryOptions {
  const {
    colors = true,
    timestamps = true,
    errorStream = process.stderr,
  } = options

  const colorize = (text: string, color: string) => {
    if (!colors) return text
    return styleText(text, color)
  }

  const write = (message: string) => {
    errorStream.write(`${message}\n`)
  }

  const formatTimestamp = () => {
    if (!timestamps) return ""
    return `[${new Date().toISOString()}] `
  }

  const onRequestStart = (event: RequestStartEvent) => {
    try {
      const msg = `${formatTimestamp()}${colorize("→", "cyan")} ${event.method} ${event.url} ${colorize(`[${event.operation}]`, "gray")} {${event.requestId.slice(0, 8)}}`
      write(msg)
    } catch (err) {
      console.error("[edgar-ts/telemetry:console-logger] Error in onRequestStart:", (err as Error).message)
      write(JSON.stringify(event))
    }
  }

  const onRequestEnd = (event: RequestEndEvent) => {
    try {
      const statusColor = event.statusCode >= 200 && event.statusCode < 300 ? "green" : "red"
      const msg = `${formatTimestamp()}${colorize("←", "cyan")} ${colorize(String(event.statusCode), statusColor)} ${event.method} ${event.url} ${colorize(`${event.durationMs}ms`, "gray")} ${colorize(`[${event.operation}]`, "gray")}`
      write(msg)
    } catch (err) {
      console.error("[edgar-ts/telemetry:console-logger] Error in onRequestEnd:", (err as Error).message)
      write(JSON.stringify(event))
    }
  }

  const onRetry = (event: RetryEvent) => {
    try {
      const msg = `${formatTimestamp()}${colorize("⟳", "yellow")} Retry ${event.attempt}/${event.maxAttempts} after ${event.delayMs}ms: ${event.url} (${colorize(event.error, "red")})`
      write(msg)
    } catch (err) {
      console.error("[edgar-ts/telemetry:console-logger] Error in onRetry:", (err as Error).message)
      write(JSON.stringify(event))
    }
  }

  return {
    onRequestStart,
    onRequestEnd,
    onRetry,
  }
}
