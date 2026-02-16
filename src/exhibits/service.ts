// ExhibitService — orchestrates exhibit enumeration with normalization and filtering

import type { SecHttpClient } from "@/http"
import type { ExhibitRef, FilingRef } from "@/types"
import { dedupeAndSortExhibits } from "./deduplication"
import { isContractExhibit } from "./filters/contract"
import {
  normalizeDescription,
  normalizeExhibitType,
  normalizeSequence,
} from "./normalization"
import { parseExhibitTableFromHtml } from "./parsing"

/**
 * ExhibitService orchestrates exhibit enumeration flow:
 *
 * 1. Build filing index URL from FilingRef (CIK + accession)
 * 2. Fetch index HTML from SEC archive
 * 3. Parse exhibits from HTML table structure
 * 4. Normalize exhibit fields (sequence, type, description)
 * 5. Build ExhibitRef objects with full exhibit URLs
 * 6. Deduplicate and stable-sort
 *
 * All HTTP requests route through SecHttpClient for rate limiting,
 * retry, and timeout handling.
 */
export class ExhibitService {
  constructor(private readonly httpClient: SecHttpClient) {}

  /**
   * Build filing index URL for SEC archive.
   *
   * URL pattern: https://www.sec.gov/Archives/edgar/data/{cik}/{accessionCompact}/index.html
   *
   * @param cik - Normalized 10-digit CIK (from FilingRef)
   * @param accessionNo - Canonical hyphenated accession (from FilingRef)
   * @returns Complete filing index URL
   *
   * @example
   * buildFilingIndexUrl("0000320193", "0001193125-20-123456")
   * // "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/index.html"
   */
  private buildFilingIndexUrl(cik: string, accessionNo: string): string {
    const accessionCompact = accessionNo.replace(/-/g, "")
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/index.html`
  }

  /**
   * Build exhibit URL for SEC archive.
   *
   * URL pattern: https://www.sec.gov/Archives/edgar/data/{cik}/{accessionCompact}/{filename}
   *
   * @param cik - Normalized 10-digit CIK
   * @param accessionNo - Canonical hyphenated accession
   * @param filename - Exhibit filename from filing index table
   * @returns Complete exhibit URL
   *
   * @example
   * buildExhibitUrl("0000320193", "0001193125-20-123456", "ex10-1.htm")
   * // "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm"
   */
  private buildExhibitUrl(
    cik: string,
    accessionNo: string,
    filename: string,
  ): string {
    const accessionCompact = accessionNo.replace(/-/g, "")
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/${filename}`
  }

  /**
   * List all exhibits for a filing.
   *
   * Orchestration flow:
   * 1. Fetch filing index HTML from SEC archive
   * 2. Parse exhibit table from HTML
   * 3. Normalize fields (sequence, type, description)
   * 4. Build ExhibitRef objects with full URLs
   * 5. Deduplicate and stable-sort
   *
   * @param filing - Filing reference from discovery
   * @returns Promise resolving to normalized, deduplicated, sorted ExhibitRef array
   * @throws TransportError if HTTP request fails (after retries)
   * @throws ParseError if HTML table structure is invalid
   * @throws ValidationError if exhibit fields fail normalization
   *
   * @example
   * const filing = await client.discoverFilings({ cik: "320193", from: "2024-01-01", to: "2024-12-31" })
   * const exhibits = await service.listExhibits(filing[0])
   * // [{ accessionNo: "...", sequence: "1", type: "EX-10.1", ... }]
   */
  async listExhibits(filing: FilingRef): Promise<ExhibitRef[]> {
    // 1. Build filing index URL
    const indexUrl = this.buildFilingIndexUrl(filing.cik, filing.accessionNo)

    // 2. Fetch index HTML
    const response = (await this.httpClient.request(indexUrl)) as unknown as {
      text(): Promise<string>
    }
    const htmlContent = await response.text()

    // 3. Parse exhibits from HTML table
    const rawExhibits = parseExhibitTableFromHtml(htmlContent)

    // 4. Normalize and build ExhibitRef objects
    const normalized = rawExhibits.map((raw) => {
      const exhibit: ExhibitRef = {
        accessionNo: filing.accessionNo, // reuse from filing
        sequence: normalizeSequence(raw.sequence),
        type: normalizeExhibitType(raw.type),
        description: normalizeDescription(raw.description),
        filename: raw.filename,
        exhibitUrl: this.buildExhibitUrl(
          filing.cik,
          filing.accessionNo,
          raw.filename,
        ),
      }
      return exhibit
    })

    // 5. Deduplicate and sort
    return dedupeAndSortExhibits(normalized)
  }

  /**
   * List only material contract exhibits (EX-10*) for a filing.
   *
   * Delegates to listExhibits() then filters by contract pattern.
   *
   * @param filing - Filing reference from discovery
   * @returns Promise resolving to filtered ExhibitRef array (only EX-10* exhibits)
   * @throws TransportError if HTTP request fails (after retries)
   * @throws ParseError if HTML table structure is invalid
   * @throws ValidationError if exhibit fields fail normalization
   *
   * @example
   * const filing = await client.discoverFilings({ cik: "320193", from: "2024-01-01", to: "2024-12-31" })
   * const contracts = await service.listContractExhibits(filing[0])
   * // [{ accessionNo: "...", sequence: "1", type: "EX-10.1", ... }] (only EX-10*)
   */
  async listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]> {
    // 1. Get all exhibits
    const allExhibits = await this.listExhibits(filing)

    // 2. Filter to contracts only
    return allExhibits.filter((e) => isContractExhibit(e.type))
  }
}
