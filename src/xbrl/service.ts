// XbrlService — typed access to SEC XBRL REST APIs (Layer 1)

import { normalizeCik } from "@/discovery/normalization"
import type { SecHttpClient } from "@/http"
import { fetchJson } from "@/http/fetch-json"

export type CompanyFacts = {
  cik: number
  entityName: string
  facts: Record<string, Record<string, FactEntry>>
}

export type FactEntry = {
  label: string
  description?: string
  units: Record<string, FactValue[]>
}

export type FactValue = {
  val: number
  accn: string
  fy?: number
  fp?: string
  form?: string
  filed?: string
  start?: string
  end?: string
}

export type CompanyConcept = {
  cik: number
  taxonomy: string
  tag: string
  label?: string
  entityName?: string
  units: Record<string, FactValue[]>
}

export type Frame = {
  taxonomy: string
  tag: string
  ccp?: string
  uom?: string
  label?: string
  pts?: number
  data: FrameEntry[]
}

export type FrameEntry = {
  accn: string
  cik: number
  entityName: string
  val: number
  start?: string
  end?: string
}

export class XbrlService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async getCompanyFacts(cik: string): Promise<CompanyFacts> {
    const normalizedCik = normalizeCik(cik)
    return fetchJson<CompanyFacts>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizedCik}.json`,
      this.httpClient,
      { operation: "getCompanyFacts", endpointClass: "xbrl" },
    )
  }

  async getCompanyConcept(cik: string, taxonomy: string, tag: string): Promise<CompanyConcept> {
    const normalizedCik = normalizeCik(cik)
    return fetchJson<CompanyConcept>(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${normalizedCik}/${taxonomy}/${tag}.json`,
      this.httpClient,
      { operation: "getCompanyConcept", endpointClass: "xbrl" },
    )
  }

  async getFrame(taxonomy: string, tag: string, unit: string, period: string): Promise<Frame> {
    return fetchJson<Frame>(
      `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`,
      this.httpClient,
      { operation: "getFrame", endpointClass: "xbrl" },
    )
  }
}
