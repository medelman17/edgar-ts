// CompanyService — fetch company metadata from SEC Submissions API

import { fetchSubmissionsResponse } from "@/discovery/fetch-submissions"
import { normalizeCik } from "@/discovery/normalization"
import type { SecHttpClient } from "@/http"
import type { CompanyInfo } from "@/types"

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
}
