// DiscoveryService — orchestrates filing discovery with normalization and deduplication

import { ValidationError } from "@/errors"
import type { SecHttpClient } from "@/http"
import type { DiscoverFilingsInput, FilingRef } from "@/types"
import { dedupeAndSort } from "./deduplication"
import { IndexService } from "./index-service"
import { normalizeAccession, normalizeCik, normalizeFormType, validateDate } from "./normalization"
import { fetchAllFilings } from "./pagination"

const DEFAULT_FORM_TYPES = [
  "8-K",
  "10-K",
  "10-Q",
  "20-F",
  "S-1",
  "8-K/A",
  "10-K/A",
  "10-Q/A",
  "20-F/A",
  "S-1/A",
]

export class DiscoveryService {
  private readonly indexService: IndexService

  constructor(private readonly httpClient: SecHttpClient) {
    this.indexService = new IndexService(httpClient)
  }

  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]> {
    validateDate(input.from)
    validateDate(input.to)

    if (input.from > input.to) {
      throw new ValidationError("Date range invalid: 'from' must be <= 'to'", {
        metadata: { from: input.from, to: input.to },
      })
    }

    let normalizedCik: string | undefined
    if (input.cik) {
      normalizedCik = normalizeCik(input.cik)
    }

    const formTypes = input.formTypes ?? DEFAULT_FORM_TYPES
    const normalizedFormTypes = formTypes.map((form) => normalizeFormType(form))

    // CIK-less discovery uses index files
    if (!normalizedCik) {
      return this.indexService.discoverByIndex({
        from: input.from,
        to: input.to,
        formTypes: normalizedFormTypes,
      })
    }

    // CIK-scoped discovery uses Submissions API
    const rawFilings = await fetchAllFilings(normalizedCik, this.httpClient, {
      operation: "discoverFilings",
      endpointClass: "submissions",
    })

    const dateFiltered = rawFilings.filter((filing) => {
      return filing.filingDate >= input.from && filing.filingDate <= input.to
    })

    const formFiltered = dateFiltered.filter((filing) => {
      const normalized = normalizeFormType(filing.form)
      return normalizedFormTypes.includes(normalized)
    })

    const normalizedFilings = formFiltered.map((filing) => {
      const filingAccession = normalizeAccession(filing.accessionNumber)
      const filingFormType = normalizeFormType(filing.form)
      const accessionNoCompact = filingAccession.replace(/-/g, "")
      const filingUrl = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${normalizedCik}&accession_number=${accessionNoCompact}&xbrl_type=v`

      return {
        cik: normalizedCik as string,
        accessionNo: filingAccession,
        formType: filingFormType,
        filingDate: filing.filingDate,
        filingUrl,
      }
    })

    return dedupeAndSort(normalizedFilings)
  }
}
