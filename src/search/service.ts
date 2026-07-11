// SearchService — wrap SEC EFTS full-text search (unofficial/undocumented API)

import type { SecHttpClient } from "@/http"
import { fetchJson } from "@/http/fetch-json"

export type SearchQuery = {
  q: string
  formTypes?: string[]
  from?: string
  to?: string
  entity?: string
  start?: number
}

export type SearchResult = {
  total: number
  /**
   * "eq" = exact count; "gte" = EFTS saturates totals at its 10,000-result window,
   * so the true count is at least `total` — slice the query (date/form) to enumerate fully.
   */
  totalRelation: "eq" | "gte"
  hits: SearchHit[]
}

export type SearchHit = {
  /** EFTS hit id: "{accessionNo}:{filename}" */
  id: string
  /** Accession number (hyphenated) of the filing containing the matched document */
  accessionNo: string
  /** Filename of the sub-document that matched the query */
  filename: string
  /** Type of the matched sub-document (e.g. "EX-5.1", "10-K") when EFTS provides it */
  fileType?: string
  /** All filer CIKs on the accession (10-digit zero-padded); co-filers included */
  ciks: string[]
  /** Display names, parallel to `ciks` (e.g. "Apple Inc.  (AAPL)  (CIK 0000320193)") */
  displayNames: string[]
  /** First display name (primary filer) */
  entityName: string
  fileNumber?: string
  formType: string
  fileDate: string
  fileDescription?: string
  periodOfReport?: string
  score: number
}

type EftsResponse = {
  hits: {
    total: { value: number; relation?: string }
    hits: Array<{
      _id: string
      _score: number
      _source: {
        display_names?: string[]
        ciks?: string[]
        file_num?: string[]
        form?: string
        root_forms?: string[]
        file_type?: string
        file_date?: string
        file_description?: string
        period_ending?: string
        adsh?: string
      }
    }>
  }
}

export class SearchService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async searchFilings(query: SearchQuery): Promise<SearchResult> {
    const url = this.buildUrl(query)

    const data = await fetchJson<EftsResponse>(url, this.httpClient, {
      operation: "searchFilings",
      endpointClass: "efts",
    })

    return {
      total: data.hits.total.value,
      totalRelation: data.hits.total.relation === "gte" ? "gte" : "eq",
      hits: data.hits.hits.map((hit) => {
        const separatorIndex = hit._id.indexOf(":")
        const idAccession = separatorIndex === -1 ? hit._id : hit._id.slice(0, separatorIndex)
        const filename = separatorIndex === -1 ? "" : hit._id.slice(separatorIndex + 1)
        return {
          id: hit._id,
          accessionNo: hit._source.adsh ?? idAccession,
          filename,
          fileType: hit._source.file_type,
          ciks: hit._source.ciks ?? [],
          displayNames: hit._source.display_names ?? [],
          entityName: hit._source.display_names?.[0] ?? "",
          fileNumber: hit._source.file_num?.[0],
          formType: hit._source.form ?? hit._source.root_forms?.[0] ?? "",
          fileDate: hit._source.file_date ?? "",
          fileDescription: hit._source.file_description,
          periodOfReport: hit._source.period_ending,
          score: hit._score,
        }
      }),
    }
  }

  private buildUrl(query: SearchQuery): string {
    const parts: string[] = [`q=${encodeURIComponent(query.q)}`]

    if (query.formTypes?.length) {
      parts.push(`forms=${encodeURIComponent(query.formTypes.join(","))}`)
    }

    if (query.from || query.to) {
      parts.push("dateRange=custom")
      if (query.from) parts.push(`startdt=${encodeURIComponent(query.from)}`)
      if (query.to) parts.push(`enddt=${encodeURIComponent(query.to)}`)
    }

    if (query.entity) {
      parts.push(`entity=${encodeURIComponent(query.entity)}`)
    }

    if (query.start !== undefined) {
      parts.push(`from=${query.start}`)
    }

    return `https://efts.sec.gov/LATEST/search-index?${parts.join("&")}`
  }
}
