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
  hits: SearchHit[]
}

export type SearchHit = {
  id: string
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
    total: { value: number }
    hits: Array<{
      _id: string
      _score: number
      _source: {
        display_names?: string[]
        file_num?: string[]
        form?: string
        root_forms?: string[]
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
      hits: data.hits.hits.map((hit) => ({
        id: hit._id,
        entityName: hit._source.display_names?.[0] ?? "",
        fileNumber: hit._source.file_num?.[0],
        formType: hit._source.form ?? hit._source.root_forms?.[0] ?? "",
        fileDate: hit._source.file_date ?? "",
        fileDescription: hit._source.file_description,
        periodOfReport: hit._source.period_ending,
        score: hit._score,
      })),
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
