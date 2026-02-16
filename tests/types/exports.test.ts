import { describe, expect, it } from "vitest"
import type {
  EdgarClientOptions,
  RetryOptions,
  TelemetryOptions,
  RequestStartEvent,
  RequestEndEvent,
  RetryEvent,
  DiscoverFilingsInput,
  FilingRef,
  ExhibitRef,
  DownloadedExhibit,
} from "@/types"

describe("Type exports", () => {
  describe("EdgarClientOptions", () => {
    it("exports with required userAgent field", () => {
      const opts: EdgarClientOptions = {
        userAgent: "TestBot/1.0 (test@example.com)",
      }
      expect(opts.userAgent).toBe("TestBot/1.0 (test@example.com)")
    })

    it("accepts optional maxRequestsPerSecond", () => {
      const opts: EdgarClientOptions = {
        userAgent: "TestBot/1.0 (test@example.com)",
        maxRequestsPerSecond: 5,
      }
      expect(opts.maxRequestsPerSecond).toBe(5)
    })

    it("accepts optional timeoutMs", () => {
      const opts: EdgarClientOptions = {
        userAgent: "TestBot/1.0 (test@example.com)",
        timeoutMs: 15000,
      }
      expect(opts.timeoutMs).toBe(15000)
    })

    it("accepts optional retries object", () => {
      const retryOpts: RetryOptions = {
        maxAttempts: 5,
        baseDelayMs: 500,
        maxDelayMs: 8000,
      }
      const opts: EdgarClientOptions = {
        userAgent: "TestBot/1.0 (test@example.com)",
        retries: retryOpts,
      }
      expect(opts.retries?.maxAttempts).toBe(5)
    })

    it("accepts optional telemetry object", () => {
      const telemetry: TelemetryOptions = {
        onRequestStart: (event: RequestStartEvent) => {
          expect(event.url).toBeDefined()
        },
      }
      const opts: EdgarClientOptions = {
        userAgent: "TestBot/1.0 (test@example.com)",
        telemetry,
      }
      expect(opts.telemetry?.onRequestStart).toBeDefined()
    })
  })

  describe("RetryOptions", () => {
    it("exports with all required numeric fields", () => {
      const retry: RetryOptions = {
        maxAttempts: 3,
        baseDelayMs: 250,
        maxDelayMs: 4000,
      }
      expect(retry.maxAttempts).toBe(3)
      expect(retry.baseDelayMs).toBe(250)
      expect(retry.maxDelayMs).toBe(4000)
    })
  })

  describe("TelemetryOptions", () => {
    it("exports with optional callback functions", () => {
      const telemetry: TelemetryOptions = {
        onRequestStart: (event) => {
          expect(event.url).toBeDefined()
        },
        onRequestEnd: (event) => {
          expect(event.statusCode).toBeDefined()
        },
        onRetry: (event) => {
          expect(event.attempt).toBeDefined()
        },
      }
      expect(telemetry.onRequestStart).toBeDefined()
      expect(telemetry.onRequestEnd).toBeDefined()
      expect(telemetry.onRetry).toBeDefined()
    })

    it("allows all callbacks to be omitted", () => {
      const telemetry: TelemetryOptions = {}
      expect(telemetry).toEqual({})
    })
  })

  describe("Telemetry event types", () => {
    it("exports RequestStartEvent with required fields", () => {
      const event: RequestStartEvent = {
        url: "https://data.sec.gov/submissions/CIK0000320193.json",
        method: "GET",
        timestamp: Date.now(),
      }
      expect(event.url).toBeDefined()
      expect(event.method).toBe("GET")
      expect(event.timestamp).toBeTypeOf("number")
    })

    it("exports RequestEndEvent with required fields", () => {
      const event: RequestEndEvent = {
        url: "https://data.sec.gov/submissions/CIK0000320193.json",
        method: "GET",
        statusCode: 200,
        durationMs: 150,
        timestamp: Date.now(),
      }
      expect(event.statusCode).toBe(200)
      expect(event.durationMs).toBe(150)
      expect(event.timestamp).toBeTypeOf("number")
    })

    it("exports RetryEvent with required fields", () => {
      const event: RetryEvent = {
        url: "https://data.sec.gov/submissions/CIK0000320193.json",
        attempt: 2,
        maxAttempts: 3,
        delayMs: 500,
        error: "503 Service Unavailable",
        timestamp: Date.now(),
      }
      expect(event.attempt).toBe(2)
      expect(event.maxAttempts).toBe(3)
      expect(event.delayMs).toBe(500)
      expect(event.error).toBe("503 Service Unavailable")
    })
  })

  describe("DiscoverFilingsInput", () => {
    it("exports with required date fields", () => {
      const input: DiscoverFilingsInput = {
        from: "2024-01-01",
        to: "2024-12-31",
      }
      expect(input.from).toBe("2024-01-01")
      expect(input.to).toBe("2024-12-31")
    })

    it("accepts optional cik field", () => {
      const input: DiscoverFilingsInput = {
        from: "2024-01-01",
        to: "2024-12-31",
        cik: "0000320193",
      }
      expect(input.cik).toBe("0000320193")
    })

    it("accepts optional formTypes array", () => {
      const input: DiscoverFilingsInput = {
        from: "2024-01-01",
        to: "2024-12-31",
        formTypes: ["10-K", "10-Q"],
      }
      expect(input.formTypes).toHaveLength(2)
      expect(input.formTypes?.[0]).toBe("10-K")
    })
  })

  describe("FilingRef", () => {
    it("exports with all 5 required string fields", () => {
      const filing: FilingRef = {
        cik: "0000320193",
        accessionNo: "0001193125-24-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://www.sec.gov/cgi-bin/viewer?action=view&cik=320193&accession_number=0001193125-24-123456",
      }
      expect(filing.cik).toBe("0000320193")
      expect(filing.accessionNo).toBe("0001193125-24-123456")
      expect(filing.formType).toBe("10-K")
      expect(filing.filingDate).toBe("2024-01-15")
      expect(filing.filingUrl).toContain("sec.gov")
    })
  })

  describe("ExhibitRef", () => {
    it("exports with all 6 required fields", () => {
      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-24-123456",
        sequence: "5",
        type: "EX-10.1",
        filename: "ex10-1.htm",
        exhibitUrl: "https://www.sec.gov/Archives/edgar/data/320193/000119312524123456/ex10-1.htm",
        description: "Material Agreement",
      }
      expect(exhibit.accessionNo).toBe("0001193125-24-123456")
      expect(exhibit.sequence).toBe("5")
      expect(exhibit.type).toBe("EX-10.1")
      expect(exhibit.filename).toBe("ex10-1.htm")
      expect(exhibit.exhibitUrl).toContain("sec.gov")
      expect(exhibit.description).toBe("Material Agreement")
    })

    it("allows optional description to be omitted", () => {
      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-24-123456",
        sequence: "5",
        type: "EX-10.1",
        filename: "ex10-1.htm",
        exhibitUrl: "https://www.sec.gov/Archives/edgar/data/320193/000119312524123456/ex10-1.htm",
      }
      expect(exhibit.description).toBeUndefined()
    })
  })

  describe("DownloadedExhibit", () => {
    it("exports with all required fields", () => {
      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-24-123456",
        sequence: "5",
        type: "EX-10.1",
        filename: "ex10-1.htm",
        exhibitUrl: "https://www.sec.gov/Archives/edgar/data/320193/000119312524123456/ex10-1.htm",
      }
      const downloaded: DownloadedExhibit = {
        exhibit,
        bytes: new Uint8Array([0x61, 0x62, 0x63]), // "abc"
        sizeBytes: 3,
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      }
      expect(downloaded.exhibit).toBe(exhibit)
      expect(downloaded.bytes).toBeInstanceOf(Uint8Array)
      expect(downloaded.bytes.length).toBe(3)
      expect(downloaded.sizeBytes).toBe(3)
      expect(downloaded.sha256).toHaveLength(64)
    })

    it("accepts optional mimeType field", () => {
      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-24-123456",
        sequence: "5",
        type: "EX-10.1",
        filename: "ex10-1.htm",
        exhibitUrl: "https://www.sec.gov/Archives/edgar/data/320193/000119312524123456/ex10-1.htm",
      }
      const downloaded: DownloadedExhibit = {
        exhibit,
        bytes: new Uint8Array([0x61, 0x62, 0x63]),
        sizeBytes: 3,
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        mimeType: "text/html",
      }
      expect(downloaded.mimeType).toBe("text/html")
    })
  })

  describe("Barrel export re-exports", () => {
    it("types are accessible from main index", async () => {
      // Import from main barrel export
      const { EdgarClient } = await import("@/index")

      // Verify EdgarClient constructor accepts EdgarClientOptions
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      expect(client).toBeDefined()
    })
  })
})
