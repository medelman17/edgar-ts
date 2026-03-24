// IndexService — bulk filing discovery via SEC quarterly/daily index files

import type { SecHttpClient } from "@/http"
import type { FilingRef } from "@/types"
import { dedupeAndSort } from "./deduplication"
import { parseIndexFile } from "./index-parser"
import { normalizeAccession, normalizeFormType } from "./normalization"

export type IndexDiscoveryInput = {
  from: string
  to: string
  formTypes?: string[]
}

/**
 * Discover filings via SEC quarterly index files (master.idx).
 * More efficient than per-CIK Submissions API for broad discovery.
 */
export class IndexService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async discoverByIndex(input: IndexDiscoveryInput): Promise<FilingRef[]> {
    const quarters = getQuartersInRange(input.from, input.to)
    const normalizedFormTypes = input.formTypes?.map(normalizeFormType)

    const allFilings: FilingRef[] = []

    for (const { year, quarter } of quarters) {
      const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${quarter}/master.idx`

      const response = (await this.httpClient.request(url, {
        context: { operation: "discoverByIndex", endpointClass: "full-index" },
      })) as unknown as { text(): Promise<string> }

      const content = await response.text()
      const entries = parseIndexFile(content)

      for (const entry of entries) {
        // Date range filter
        if (entry.filingDate < input.from || entry.filingDate > input.to) {
          continue
        }

        // Form type filter
        if (normalizedFormTypes && !normalizedFormTypes.includes(entry.formType)) {
          continue
        }

        // Extract accession number from filename
        // Format: edgar/data/{cik}/{accessionNoCompact}.txt
        const accessionMatch =
          entry.filename.match(/(\d{10}-\d{2}-\d{6})/) ?? entry.filename.match(/(\d{18})/)
        if (!accessionMatch) {
          continue
        }

        const accessionNo = normalizeAccession(accessionMatch[1] ?? "")
        const accessionNoCompact = accessionNo.replace(/-/g, "")
        const filingUrl = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${entry.cik}&accession_number=${accessionNoCompact}&xbrl_type=v`

        allFilings.push({
          cik: entry.cik,
          accessionNo,
          formType: entry.formType,
          filingDate: entry.filingDate,
          filingUrl,
        })
      }
    }

    return dedupeAndSort(allFilings)
  }
}

type Quarter = { year: number; quarter: number }

function getQuartersInRange(from: string, to: string): Quarter[] {
  const startYear = Number.parseInt(from.slice(0, 4), 10)
  const startMonth = Number.parseInt(from.slice(5, 7), 10)
  const endYear = Number.parseInt(to.slice(0, 4), 10)
  const endMonth = Number.parseInt(to.slice(5, 7), 10)

  const startQ = Math.ceil(startMonth / 3)
  const endQ = Math.ceil(endMonth / 3)

  const quarters: Quarter[] = []

  for (let year = startYear; year <= endYear; year++) {
    const qStart = year === startYear ? startQ : 1
    const qEnd = year === endYear ? endQ : 4

    for (let q = qStart; q <= qEnd; q++) {
      quarters.push({ year, quarter: q })
    }
  }

  return quarters
}
