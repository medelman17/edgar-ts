import { ConfigurationError } from "@/errors"
import { DiscoveryService } from "@/discovery"
import { DownloadService } from "@/download"
import { ExhibitService } from "@/exhibits"
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
  private readonly exhibitService: ExhibitService
  private readonly downloadService: DownloadService

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

    // Initialize HTTP client and services
    this.httpClient = new SecHttpClient(this.options)
    this.discoveryService = new DiscoveryService(this.httpClient)
    this.exhibitService = new ExhibitService(this.httpClient)
    this.downloadService = new DownloadService(this.httpClient)
  }

  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]> {
    return this.discoveryService.discoverFilings(input)
  }

  async listExhibits(filing: FilingRef): Promise<ExhibitRef[]> {
    return this.exhibitService.listExhibits(filing)
  }

  async listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]> {
    return this.exhibitService.listContractExhibits(filing)
  }

  async downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit> {
    return this.downloadService.downloadExhibit(exhibit)
  }
}
