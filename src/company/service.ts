// CompanyService — company metadata and ticker lookup from SEC

import { fetchSubmissionsResponse } from "@/discovery/fetch-submissions"
import { normalizeCik } from "@/discovery/normalization"
import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"
import type { CompanyInfo, CompanyTicker } from "@/types"

/** Raw entry from SEC company_tickers.json */
type RawTickerEntry = {
  cik_str: number
  ticker: string
  title: string
  exchange: string
}

export class CompanyService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async getCompanyInfo(cik: string): Promise<CompanyInfo> {
    const normalizedCik = normalizeCik(cik)

    const submissions = await fetchSubmissionsResponse(normalizedCik, this.httpClient, {
      operation: "getCompanyInfo",
      endpointClass: "submissions",
    })

    return {
      cik: normalizedCik,
      name: submissions.name,
      tickers: submissions.tickers ?? [],
      exchanges: submissions.exchanges ?? [],
      entityType: submissions.entityType,
      sic: submissions.sic,
      sicDescription: submissions.sicDescription,
      stateOfIncorporation: submissions.stateOfIncorporation,
      fiscalYearEnd: submissions.fiscalYearEnd,
    }
  }

  async lookupCompany(query: string): Promise<CompanyTicker[]> {
    const url = "https://www.sec.gov/files/company_tickers.json"
    const response = (await this.httpClient.request(url, {
      context: { operation: "lookupCompany", endpointClass: "files" },
    })) as unknown as { json(): Promise<unknown> }

    let raw: Record<string, RawTickerEntry>
    try {
      raw = (await response.json()) as Record<string, RawTickerEntry>
    } catch (error) {
      throw new ParseError(`Failed to parse company tickers JSON from ${url}`, {
        metadata: { url },
        cause: error,
      })
    }

    const entries = Object.values(raw)
    const queryUpper = query.toUpperCase().trim()
    const queryLower = query.toLowerCase().trim()

    // Exact ticker matches (case-insensitive)
    const tickerMatches: CompanyTicker[] = []
    // Name substring matches (case-insensitive)
    const nameMatches: CompanyTicker[] = []

    for (const entry of entries) {
      const mapped: CompanyTicker = {
        cik: String(entry.cik_str).padStart(10, "0"),
        ticker: entry.ticker,
        name: entry.title,
        exchange: entry.exchange,
      }

      if (entry.ticker.toUpperCase() === queryUpper) {
        tickerMatches.push(mapped)
      } else if (entry.title.toLowerCase().includes(queryLower)) {
        nameMatches.push(mapped)
      }
    }

    // Ticker matches first, then name matches
    return [...tickerMatches, ...nameMatches]
  }
}
