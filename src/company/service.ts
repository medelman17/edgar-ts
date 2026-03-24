// CompanyService — company metadata and ticker lookup from SEC

import { fetchSubmissionsResponse } from "@/discovery/fetch-submissions"
import { normalizeCik } from "@/discovery/normalization"
import type { SecHttpClient } from "@/http"
import { fetchJson } from "@/http/fetch-json"
import type { CompanyInfo, CompanyTicker } from "@/types"

/** SEC company_tickers_exchange.json response: { fields: string[], data: [cik, name, ticker, exchange][] } */
type TickerExchangeResponse = {
  fields: string[]
  data: [number, string, string, string][]
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
    const raw = await fetchJson<TickerExchangeResponse>(
      "https://www.sec.gov/files/company_tickers_exchange.json",
      this.httpClient,
      { operation: "lookupCompany", endpointClass: "files" },
    )

    const queryUpper = query.toUpperCase().trim()
    const queryLower = query.toLowerCase().trim()

    const tickerMatches: CompanyTicker[] = []
    const nameMatches: CompanyTicker[] = []

    for (const [cikNum, name, ticker, exchange] of raw.data) {
      if (ticker.toUpperCase() === queryUpper) {
        tickerMatches.push({ cik: normalizeCik(String(cikNum)), ticker, name, exchange })
      } else if (name.toLowerCase().includes(queryLower)) {
        nameMatches.push({ cik: normalizeCik(String(cikNum)), ticker, name, exchange })
      }
    }

    return [...tickerMatches, ...nameMatches]
  }
}
