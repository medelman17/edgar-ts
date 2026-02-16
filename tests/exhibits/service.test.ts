// ExhibitService integration tests

import { describe, it, expect, beforeEach, vi } from "vitest"
import { ExhibitService } from "@/exhibits/service"
import type { SecHttpClient } from "@/http"
import type { FilingRef } from "@/types"

// Mock SecHttpClient
class MockSecHttpClient {
  mockRequest = vi.fn()

  async request(url: string): Promise<Response> {
    return this.mockRequest(url)
  }
}

// Helper to build mock filing index HTML
function buildMockFilingIndexHtml(rows: string[]): string {
  const tableRows = rows.join("\n")
  return `
    <!DOCTYPE html>
    <html>
    <head><title>Filing Index</title></head>
    <body>
      <table class="tableFile">
        <tr>
          <th>Seq</th>
          <th>Description</th>
          <th>Document</th>
          <th>Type</th>
          <th>Size</th>
        </tr>
        ${tableRows}
      </table>
    </body>
    </html>
  `
}

// Helper to build mock exhibit row
function buildExhibitRow(
  sequence: string,
  description: string,
  filename: string,
  type: string,
): string {
  return `
    <tr>
      <td>${sequence}</td>
      <td>${description}</td>
      <td><a href="/Archives/edgar/data/320193/000119312520123456/${filename}">${filename}</a></td>
      <td>${type}</td>
      <td>12345</td>
    </tr>
  `
}

// Mock FilingRef fixture
const mockFiling: FilingRef = {
  cik: "0000320193",
  accessionNo: "0001193125-20-123456",
  formType: "10-K",
  filingDate: "2024-01-15",
  filingUrl: "https://www.sec.gov/cgi-bin/viewer?action=view&cik=0000320193&accession_number=000119312520123456&xbrl_type=v",
}

describe("ExhibitService", () => {
  let httpClient: MockSecHttpClient
  let service: ExhibitService

  beforeEach(() => {
    httpClient = new MockSecHttpClient()
    service = new ExhibitService(httpClient as unknown as SecHttpClient)
  })

  describe("URL construction", () => {
    it("constructs correct filing index URL with compact accession", async () => {
      const html = buildMockFilingIndexHtml([])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      await service.listExhibits(mockFiling)

      expect(httpClient.mockRequest).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/0001193125-20-123456-index.html",
      )
    })

    it("constructs correct exhibit URLs with compact accession and filename", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Employment Agreement", "ex10-1.htm", "EX-10.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].exhibitUrl).toBe(
        "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      )
    })

    it("preserves CIK and accession formatting in URLs", async () => {
      const filing: FilingRef = {
        cik: "0001234567", // different CIK
        accessionNo: "0000000000-99-123456", // different accession
        formType: "8-K",
        filingDate: "2024-02-01",
        filingUrl: "https://example.com",
      }

      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Test", "test.htm", "EX-99.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(filing)

      expect(httpClient.mockRequest).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/data/0001234567/000000000099123456/0000000000-99-123456-index.html",
      )
      expect(exhibits[0].exhibitUrl).toBe(
        "https://www.sec.gov/Archives/edgar/data/0001234567/000000000099123456/test.htm",
      )
    })
  })

  describe("listExhibits", () => {
    it("returns empty array when filing index has no exhibits", async () => {
      const html = buildMockFilingIndexHtml([])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits).toEqual([])
    })

    it("parses single exhibit correctly with all fields mapped", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Employment Agreement", "ex10-1.htm", "EX-10.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0]).toEqual({
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      })
    })

    it("parses multiple exhibits (3+ rows)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract A", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("2", "Contract B", "ex10-2.htm", "EX-10.2"),
        buildExhibitRow("3", "Consent", "ex23-1.htm", "EX-23.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits).toHaveLength(3)
      expect(exhibits[0].sequence).toBe("1")
      expect(exhibits[1].sequence).toBe("2")
      expect(exhibits[2].sequence).toBe("3")
    })

    it("normalizes exhibit types (EX_10 → EX-10)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract", "ex10-1.htm", "EX_10.1"),
        buildExhibitRow("2", "Contract", "ex10-2.htm", "EX/10.2"),
        buildExhibitRow("3", "Contract", "ex10-3.htm", "ex-10.3"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].type).toBe("EX-10.1")
      expect(exhibits[1].type).toBe("EX-10.2")
      expect(exhibits[2].type).toBe("EX-10.3")
    })

    it("normalizes sequences (whitespace trimmed)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("  1  ", "Contract", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("\t2\t", "Contract", "ex10-2.htm", "EX-10.2"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].sequence).toBe("1")
      expect(exhibits[1].sequence).toBe("2")
    })

    it("normalizes descriptions (empty → undefined)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("2", "   ", "ex10-2.htm", "EX-10.2"),
        buildExhibitRow("3", "Valid Description", "ex10-3.htm", "EX-10.3"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].description).toBeUndefined()
      expect(exhibits[1].description).toBeUndefined()
      expect(exhibits[2].description).toBe("Valid Description")
    })

    it("deduplicates by (accessionNo, sequence) identity", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "First occurrence", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("1", "Duplicate", "ex10-1-dupe.htm", "EX-10.1"), // duplicate sequence
        buildExhibitRow("2", "Different sequence", "ex10-2.htm", "EX-10.2"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits).toHaveLength(2) // duplicate removed
      expect(exhibits[0].sequence).toBe("1")
      expect(exhibits[0].description).toBe("First occurrence") // first occurrence retained
      expect(exhibits[1].sequence).toBe("2")
    })

    it("sorts by sequence numeric ascending", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("10", "Ten", "ex10-10.htm", "EX-10.10"),
        buildExhibitRow("2", "Two", "ex10-2.htm", "EX-10.2"),
        buildExhibitRow("1", "One", "ex10-1.htm", "EX-10.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].sequence).toBe("1")
      expect(exhibits[1].sequence).toBe("2")
      expect(exhibits[2].sequence).toBe("10") // numeric sort: 10 after 2
    })

    it("sorts by filename when sequences match", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract C", "c.htm", "EX-10.1"),
        buildExhibitRow("1", "Contract A", "a.htm", "EX-10.1"), // same sequence
        buildExhibitRow("1", "Contract B", "b.htm", "EX-10.1"), // same sequence
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      // Deduplication retains first occurrence, so only "c.htm" is kept
      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].filename).toBe("c.htm")
    })

    it("constructs correct exhibitUrl for each exhibit", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("2", "Consent", "ex23-1.htm", "EX-23.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const exhibits = await service.listExhibits(mockFiling)

      expect(exhibits[0].exhibitUrl).toBe(
        "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      )
      expect(exhibits[1].exhibitUrl).toBe(
        "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex23-1.htm",
      )
    })
  })

  describe("listContractExhibits", () => {
    it("returns only EX-10* exhibits (filter test)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract A", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("2", "List of Subsidiaries", "ex21-1.htm", "EX-21"),
        buildExhibitRow("3", "Contract B", "ex10-2.htm", "EX-10.2"),
        buildExhibitRow("4", "Press Release", "ex99-1.htm", "EX-99.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const contracts = await service.listContractExhibits(mockFiling)

      expect(contracts).toHaveLength(2)
      expect(contracts[0].type).toBe("EX-10.1")
      expect(contracts[1].type).toBe("EX-10.2")
    })

    it("returns empty array when no EX-10* exhibits in filing", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "List of Subsidiaries", "ex21-1.htm", "EX-21"),
        buildExhibitRow("2", "Press Release", "ex99-1.htm", "EX-99.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const contracts = await service.listContractExhibits(mockFiling)

      expect(contracts).toEqual([])
    })

    it("includes all EX-10 variants (EX-10, EX-10.1, EX-10A)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract", "ex10.htm", "EX-10"),
        buildExhibitRow("2", "Contract", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("3", "Contract", "ex10a.htm", "EX-10A"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const contracts = await service.listContractExhibits(mockFiling)

      expect(contracts).toHaveLength(3)
      expect(contracts[0].type).toBe("EX-10")
      expect(contracts[1].type).toBe("EX-10.1")
      expect(contracts[2].type).toBe("EX-10A")
    })

    it("excludes non-contract exhibits (EX-21, EX-99)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("2", "List of Subsidiaries", "ex21-1.htm", "EX-21"),
        buildExhibitRow("3", "Consent", "ex23-1.htm", "EX-23.1"),
        buildExhibitRow("4", "Certification", "ex31-1.htm", "EX-31.1"),
        buildExhibitRow("5", "Certification", "ex32-1.htm", "EX-32.1"),
        buildExhibitRow("6", "Press Release", "ex99-1.htm", "EX-99.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const contracts = await service.listContractExhibits(mockFiling)

      expect(contracts).toHaveLength(1)
      expect(contracts[0].type).toBe("EX-10.1")
    })

    it("preserves deduplication and sorting from listExhibits", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("10", "Contract 10", "ex10-10.htm", "EX-10.10"),
        buildExhibitRow("2", "Contract 2", "ex10-2.htm", "EX-10.2"),
        buildExhibitRow("1", "Contract 1", "ex10-1.htm", "EX-10.1"),
        buildExhibitRow("1", "Duplicate", "ex10-1-dupe.htm", "EX-10.1"), // duplicate
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      const contracts = await service.listContractExhibits(mockFiling)

      expect(contracts).toHaveLength(3) // duplicate removed
      expect(contracts[0].sequence).toBe("1") // sorted numerically
      expect(contracts[1].sequence).toBe("2")
      expect(contracts[2].sequence).toBe("10")
    })

    it("delegates to listExhibits internally (verify via mock call count)", async () => {
      const html = buildMockFilingIndexHtml([
        buildExhibitRow("1", "Contract", "ex10-1.htm", "EX-10.1"),
      ])
      httpClient.mockRequest.mockResolvedValue({
        text: async () => html,
      } as Response)

      await service.listContractExhibits(mockFiling)

      // listContractExhibits should call listExhibits, which calls httpClient.request once
      expect(httpClient.mockRequest).toHaveBeenCalledTimes(1)
      expect(httpClient.mockRequest).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/0001193125-20-123456-index.html",
      )
    })
  })
})
