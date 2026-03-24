// DownloadService integration tests with mocked SecHttpClient

import { describe, expect, it, vi } from "vitest"
import { DownloadService } from "@/download/service"
import type { SecHttpClient } from "@/http"
import type { ExhibitRef } from "@/types"

// Helper to create mock SecHttpClient
function createMockHttpClient(mockResponse: {
  arrayBuffer: () => Promise<ArrayBuffer>
  headers: { get: (name: string) => string | null }
}): SecHttpClient {
  return {
    request: vi.fn(async () => mockResponse),
  } as unknown as SecHttpClient
}

// Helper to create test ExhibitRef
function createTestExhibit(overrides?: Partial<ExhibitRef>): ExhibitRef {
  return {
    accessionNo: "0001234567-22-000123",
    sequence: "1",
    type: "EX-10.1",
    filename: "test.txt",
    exhibitUrl: "https://www.sec.gov/Archives/edgar/data/1234567/000123456722000123/test.txt",
    ...overrides,
  }
}

describe("DownloadService", () => {
  describe("downloadExhibit", () => {
    it("returns DownloadedExhibit with all required fields", async () => {
      const mockData = new TextEncoder().encode("test content")
      const mockBuffer = mockData.buffer

      const mockResponse = {
        arrayBuffer: async () => mockBuffer,
        headers: { get: () => "text/plain" },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result).toHaveProperty("exhibit")
      expect(result).toHaveProperty("bytes")
      expect(result).toHaveProperty("sizeBytes")
      expect(result).toHaveProperty("mimeType")
      expect(result).toHaveProperty("sha256")
    })

    it("uses exhibit.exhibitUrl for fetch", async () => {
      const mockData = new Uint8Array([1, 2, 3])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit({
        exhibitUrl: "https://www.sec.gov/Archives/edgar/data/1234567/test.pdf",
      })

      await service.downloadExhibit(exhibit)

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/data/1234567/test.pdf",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "downloadExhibit",
            endpointClass: "archive",
          }),
        }),
      )
    })

    it("extracts MIME type from Content-Type header", async () => {
      const mockData = new Uint8Array([1, 2, 3])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: (name: string) => (name === "Content-Type" ? "application/pdf" : null) },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.mimeType).toBe("application/pdf")
    })

    it("extracts MIME type without charset parameter", async () => {
      const mockData = new Uint8Array([1, 2, 3])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: {
          get: (name: string) => (name === "Content-Type" ? "text/html; charset=utf-8" : null),
        },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.mimeType).toBe("text/html")
    })

    it("sets mimeType to undefined when Content-Type header missing", async () => {
      const mockData = new Uint8Array([1, 2, 3])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.mimeType).toBeUndefined()
    })

    it("sizeBytes matches actual bytes.length", async () => {
      const mockData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.sizeBytes).toBe(10)
      expect(result.bytes.length).toBe(10)
      expect(result.sizeBytes).toBe(result.bytes.length)
    })

    it("computes SHA-256 digest correctly", async () => {
      // Use known test data: "abc" → "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      const mockData = new TextEncoder().encode("abc")
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    })

    it("bytes are exact binary from response (no transformation)", async () => {
      const mockData = new Uint8Array([0xff, 0x00, 0xaa, 0x55, 0x12, 0x34])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.bytes).toEqual(mockData)
      expect(Array.from(result.bytes)).toEqual([0xff, 0x00, 0xaa, 0x55, 0x12, 0x34])
    })

    it("returns exhibit reference in result", async () => {
      const mockData = new Uint8Array([1, 2, 3])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit({
        accessionNo: "0001234567-22-999999",
        sequence: "42",
        type: "EX-99.1",
      })

      const result = await service.downloadExhibit(exhibit)

      expect(result.exhibit).toBe(exhibit)
      expect(result.exhibit.accessionNo).toBe("0001234567-22-999999")
      expect(result.exhibit.sequence).toBe("42")
      expect(result.exhibit.type).toBe("EX-99.1")
    })

    it("handles empty file correctly", async () => {
      const mockData = new Uint8Array([])
      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: () => null },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.bytes.length).toBe(0)
      expect(result.sizeBytes).toBe(0)
      // Empty input SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(result.sha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    })

    it("handles large binary data correctly", async () => {
      // Create 10KB of random-looking binary data
      const size = 10 * 1024
      const mockData = new Uint8Array(size)
      for (let i = 0; i < size; i++) {
        mockData[i] = i % 256
      }

      const mockResponse = {
        arrayBuffer: async () => mockData.buffer,
        headers: { get: (name: string) => (name === "Content-Type" ? "application/pdf" : null) },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new DownloadService(httpClient)
      const exhibit = createTestExhibit()

      const result = await service.downloadExhibit(exhibit)

      expect(result.sizeBytes).toBe(size)
      expect(result.bytes.length).toBe(size)
      expect(result.mimeType).toBe("application/pdf")
      expect(result.sha256).toHaveLength(64)
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
    })
  })
})
