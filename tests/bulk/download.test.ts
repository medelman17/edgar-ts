// Bulk data download tests

import { describe, expect, it, vi } from "vitest"
import { BulkDataService } from "@/bulk/service"
import type { SecHttpClient } from "@/http"

function createMockHttpClient(body: ArrayBuffer): SecHttpClient {
  return {
    request: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => body,
      headers: {
        get: (name: string) => {
          if (name === "Content-Length") return String(body.byteLength)
          if (name === "Content-Type") return "application/zip"
          return null
        },
      },
    }),
  } as unknown as SecHttpClient
}

describe("BulkDataService", () => {
  describe("downloadSubmissionsBulk", () => {
    it("should download submissions.zip and return raw bytes with metadata", async () => {
      const mockData = new TextEncoder().encode("fake-zip-content")
      const httpClient = createMockHttpClient(mockData.buffer as ArrayBuffer)
      const service = new BulkDataService(httpClient)

      const result = await service.downloadSubmissionsBulk()

      expect(result.bytes).toBeInstanceOf(Uint8Array)
      expect(result.sizeBytes).toBe(mockData.byteLength)
      expect(result.mimeType).toBe("application/zip")
      expect(result.source).toBe("submissions")
    })

    it("should fetch the correct SEC bulk data URL", async () => {
      const mockData = new TextEncoder().encode("fake")
      const httpClient = createMockHttpClient(mockData.buffer as ArrayBuffer)
      const service = new BulkDataService(httpClient)

      await service.downloadSubmissionsBulk()

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip",
        { context: { operation: "downloadSubmissionsBulk", endpointClass: "bulk-data" } },
      )
    })
  })

  describe("downloadCompanyFactsBulk", () => {
    it("should download companyfacts.zip and return raw bytes with metadata", async () => {
      const mockData = new TextEncoder().encode("fake-zip-content")
      const httpClient = createMockHttpClient(mockData.buffer as ArrayBuffer)
      const service = new BulkDataService(httpClient)

      const result = await service.downloadCompanyFactsBulk()

      expect(result.bytes).toBeInstanceOf(Uint8Array)
      expect(result.sizeBytes).toBe(mockData.byteLength)
      expect(result.source).toBe("companyfacts")
    })

    it("should fetch the correct SEC bulk data URL", async () => {
      const mockData = new TextEncoder().encode("fake")
      const httpClient = createMockHttpClient(mockData.buffer as ArrayBuffer)
      const service = new BulkDataService(httpClient)

      await service.downloadCompanyFactsBulk()

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip",
        { context: { operation: "downloadCompanyFactsBulk", endpointClass: "bulk-data" } },
      )
    })
  })
})
