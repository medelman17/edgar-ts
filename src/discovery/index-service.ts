// IndexService — bulk filing discovery via SEC quarterly/daily index files

import type { SecHttpClient } from "@/http"
import type { FilingRef } from "@/types"
import { dedupeAndSort } from "./deduplication"
import { parseIndexFile } from "./index-parser"
import { normalizeAccession, normalizeFormType } from "./normalization"

const ACCESSION_RE = /(\d{10}-\d{2}-\d{6})|(\d{18})/

export type IndexDiscoveryInput = {
  from: string
  to: string
  formTypes?: string[]
}

export class IndexService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async discoverByIndex(input: IndexDiscoveryInput): Promise<FilingRef[]> {
    const quarters = getQuartersInRange(input.from, input.to)
    const formTypeSet = input.formTypes ? new Set(input.formTypes.map(normalizeFormType)) : null

    const allFilings: FilingRef[] = []

    for (const { year, quarter } of quarters) {
      const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${quarter}/master.idx`

      const response = (await this.httpClient.request(url, {
        context: { operation: "discoverByIndex", endpointClass: "full-index" },
      })) as unknown as { text(): Promise<string> }

      const content = await response.text()
      const entries = parseIndexFile(content)

      for (const entry of entries) {
        if (entry.filingDate < input.from || entry.filingDate > input.to) {
          continue
        }

        if (formTypeSet && !formTypeSet.has(entry.formType)) {
          continue
        }

        const accessionMatch = entry.filename.match(ACCESSION_RE)
        if (!accessionMatch) {
          continue
        }

        const rawAccession = accessionMatch[1] ?? accessionMatch[2] ?? ""
        const accessionNo = normalizeAccession(rawAccession)
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
