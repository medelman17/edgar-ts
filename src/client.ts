import { ConfigurationError } from "@/errors"
import { DiscoveryService } from "@/discovery"
import { SecHttpClient } from "@/http"
import type {
  DiscoverFilingsInput,
  DownloadedExhibit,
  EdgarClientOptions,
  ExhibitRef,
  FilingRef,
  RetryOptions,
} from "@/types"

const DEFAULT_MAX_REQUESTS_PER_SECOND = 8
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
}

export class EdgarClient {
  private readonly options: Required<
    Pick<EdgarClientOptions, "userAgent" | "maxRequestsPerSecond" | "timeoutMs">
  > & { retries: RetryOptions; telemetry: EdgarClientOptions["telemetry"] }
  private readonly httpClient: SecHttpClient
  private readonly discoveryService: DiscoveryService

  constructor(options: EdgarClientOptions) {
    if (!options.userAgent || options.userAgent.trim().length === 0) {
      throw new ConfigurationError("userAgent is required and must be non-empty")
    }

    this.options = {
      userAgent: options.userAgent.trim(),
      maxRequestsPerSecond: options.maxRequestsPerSecond ?? DEFAULT_MAX_REQUESTS_PER_SECOND,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: { ...DEFAULT_RETRY, ...options.retries },
      telemetry: options.telemetry,
    }

    // Initialize HTTP client and discovery service
    this.httpClient = new SecHttpClient(this.options)
    this.discoveryService = new DiscoveryService(this.httpClient)
  }

  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]> {
    return this.discoveryService.discoverFilings(input)
  }

  async listExhibits(_filing: FilingRef): Promise<ExhibitRef[]> {
    // TODO: W-017
    throw new Error("Not yet implemented")
  }

  async listContractExhibits(_filing: FilingRef): Promise<ExhibitRef[]> {
    // TODO: W-019
    throw new Error("Not yet implemented")
  }

  async downloadExhibit(_exhibit: ExhibitRef): Promise<DownloadedExhibit> {
    // TODO: W-022
    throw new Error("Not yet implemented")
  }
}
