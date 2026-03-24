// SearchService — wrap SEC EFTS full-text search (unofficial/undocumented API)

import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"

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
        entity_name: string
        file_num?: string
        form_type: string
        file_date: string
        display_date_filed?: string
        file_description?: string
        period_of_report?: string
      }
    }>
  }
}

export class SearchService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async searchFilings(query: SearchQuery): Promise<SearchResult> {
    const url = this.buildUrl(query)

    const response = (await this.httpClient.request(url, {
      context: { operation: "searchFilings", endpointClass: "efts" },
    })) as unknown as { json(): Promise<unknown> }

    let data: EftsResponse
    try {
      data = (await response.json()) as EftsResponse
    } catch (error) {
      throw new ParseError(`Failed to parse EFTS search response from ${url}`, {
        metadata: { url },
        cause: error,
      })
    }

    return {
      total: data.hits.total.value,
      hits: data.hits.hits.map((hit) => ({
        id: hit._id,
        entityName: hit._source.entity_name,
        fileNumber: hit._source.file_num,
        formType: hit._source.form_type,
        fileDate: hit._source.file_date,
        fileDescription: hit._source.file_description,
        periodOfReport: hit._source.period_of_report,
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
