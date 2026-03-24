// Public types — edgar-ts API contract

export type EdgarClientOptions = {
  /** Descriptive user-agent string (required by SEC). e.g. "AcmeLegalBot/1.0 (ops@acme.test)" */
  userAgent: string
  /** Max requests per second to SEC EDGAR. Default: 8 */
  maxRequestsPerSecond?: number
  /** Request timeout in milliseconds. Default: 10000 */
  timeoutMs?: number
  /** Retry configuration */
  retries?: RetryOptions
  /** Optional telemetry hooks */
  telemetry?: TelemetryOptions
}

export type RetryOptions = {
  /** Maximum retry attempts. Default: 3 */
  maxAttempts: number
  /** Base delay between retries in ms. Default: 250 */
  baseDelayMs: number
  /** Maximum delay between retries in ms. Default: 4000 */
  maxDelayMs: number
}

export type TelemetryOptions = {
  onRequestStart?: (event: RequestStartEvent) => void
  onRequestEnd?: (event: RequestEndEvent) => void
  onRetry?: (event: RetryEvent) => void
}

export type RequestStartEvent = {
  url: string
  method: string
  timestamp: number
  requestId: string
  operation: string
  endpointClass: string
  runtime: "node" | "bun"
}

export type RequestEndEvent = {
  url: string
  method: string
  statusCode: number
  durationMs: number
  timestamp: number
  requestId: string
  operation: string
  endpointClass: string
  runtime: "node" | "bun"
}

export type RetryEvent = {
  url: string
  attempt: number
  maxAttempts: number
  delayMs: number
  error: string
  timestamp: number
  requestId: string
  operation: string
  endpointClass: string
  runtime: "node" | "bun"
}

export type DiscoverFilingsInput = {
  /** Start date (YYYY-MM-DD) */
  from: string
  /** End date (YYYY-MM-DD) */
  to: string
  /** Optional CIK to scope discovery */
  cik?: string
  /** Optional form types. Defaults to core set (8-K, 10-K, 10-Q, 20-F, S-1 + amendments) */
  formTypes?: string[]
}

export type FilingRef = {
  /** Central Index Key (10-digit zero-padded) */
  cik: string
  /** Canonical accession number */
  accessionNo: string
  /** SEC form type */
  formType: string
  /** Filing date (YYYY-MM-DD) */
  filingDate: string
  /** Full URL to filing on EDGAR */
  filingUrl: string
}

export type ExhibitRef = {
  /** Accession number of parent filing */
  accessionNo: string
  /** Exhibit sequence number */
  sequence: string
  /** Exhibit type (e.g. "EX-10.1") */
  type: string
  /** Exhibit description from filing index */
  description?: string
  /** Exhibit filename */
  filename: string
  /** Full URL to exhibit on EDGAR */
  exhibitUrl: string
}

export type CompanyInfo = {
  /** Central Index Key (10-digit zero-padded) */
  cik: string
  /** Entity name */
  name: string
  /** Trading symbols */
  tickers: string[]
  /** Stock exchanges */
  exchanges: string[]
  /** Entity type (e.g. "operating") */
  entityType?: string
  /** SIC code */
  sic?: string
  /** SIC description */
  sicDescription?: string
  /** State of incorporation */
  stateOfIncorporation?: string
  /** Fiscal year end (MMDD format) */
  fiscalYearEnd?: string
}

export type CompanyTicker = {
  /** Central Index Key (10-digit zero-padded) */
  cik: string
  /** Trading symbol */
  ticker: string
  /** Company name */
  name: string
  /** Stock exchange */
  exchange: string
}

export type DownloadedExhibit = {
  /** The exhibit reference */
  exhibit: ExhibitRef
  /** Raw exhibit content */
  bytes: Uint8Array
  /** MIME type hint */
  mimeType?: string
  /** Content size in bytes */
  sizeBytes: number
  /** SHA-256 hex digest */
  sha256: string
}
