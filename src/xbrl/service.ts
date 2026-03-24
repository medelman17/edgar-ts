// XbrlService — typed access to SEC XBRL REST APIs (Layer 1)

import { normalizeCik } from "@/discovery/normalization"
import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"

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
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizedCik}.json`
    return this.fetchJson<CompanyFacts>(url, "getCompanyFacts")
  }

  async getCompanyConcept(cik: string, taxonomy: string, tag: string): Promise<CompanyConcept> {
    const normalizedCik = normalizeCik(cik)
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${normalizedCik}/${taxonomy}/${tag}.json`
    return this.fetchJson<CompanyConcept>(url, "getCompanyConcept")
  }

  async getFrame(taxonomy: string, tag: string, unit: string, period: string): Promise<Frame> {
    const url = `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`
    return this.fetchJson<Frame>(url, "getFrame")
  }

  private async fetchJson<T>(url: string, operation: string): Promise<T> {
    const response = (await this.httpClient.request(url, {
      context: { operation, endpointClass: "xbrl" },
    })) as unknown as { json(): Promise<unknown> }

    try {
      return (await response.json()) as T
    } catch (error) {
      throw new ParseError(`Failed to parse XBRL JSON from ${url}`, {
        metadata: { url },
        cause: error,
      })
    }
  }
}
