// CompanyService — company metadata and ticker lookup from SEC

import { fetchSubmissionsResponse } from "@/discovery/fetch-submissions"
import { normalizeCik } from "@/discovery/normalization"
import type { SecHttpClient } from "@/http"
import { fetchJson } from "@/http/fetch-json"
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
    const raw = await fetchJson<Record<string, RawTickerEntry>>(
      "https://www.sec.gov/files/company_tickers.json",
      this.httpClient,
      { operation: "lookupCompany", endpointClass: "files" },
    )

    const entries = Object.values(raw)
    const queryUpper = query.toUpperCase().trim()
    const queryLower = query.toLowerCase().trim()

    const tickerMatches: CompanyTicker[] = []
    const nameMatches: CompanyTicker[] = []

    for (const entry of entries) {
      if (entry.ticker.toUpperCase() === queryUpper) {
        tickerMatches.push(toCompanyTicker(entry))
      } else if (entry.title.toLowerCase().includes(queryLower)) {
        nameMatches.push(toCompanyTicker(entry))
      }
    }

    return [...tickerMatches, ...nameMatches]
  }
}

function toCompanyTicker(entry: RawTickerEntry): CompanyTicker {
  return {
    cik: normalizeCik(String(entry.cik_str)),
    ticker: entry.ticker,
    name: entry.title,
    exchange: entry.exchange,
  }
}
