// BulkDataService — download SEC bulk data archives

import type { SecHttpClient } from "@/http"

export type BulkDownloadResult = {
  bytes: Uint8Array
  sizeBytes: number
  mimeType?: string
  source: "submissions" | "companyfacts"
}

const SUBMISSIONS_URL = "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip"
const COMPANYFACTS_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"

export class BulkDataService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async downloadSubmissionsBulk(): Promise<BulkDownloadResult> {
    return this.downloadBulk(SUBMISSIONS_URL, "submissions", "downloadSubmissionsBulk")
  }

  async downloadCompanyFactsBulk(): Promise<BulkDownloadResult> {
    return this.downloadBulk(COMPANYFACTS_URL, "companyfacts", "downloadCompanyFactsBulk")
  }

  private async downloadBulk(
    url: string,
    source: BulkDownloadResult["source"],
    operation: string,
  ): Promise<BulkDownloadResult> {
    const response = await this.httpClient.request(url, {
      context: { operation, endpointClass: "bulk-data" },
    })

    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const contentType = response.headers.get("Content-Type")
    const mimeType = contentType?.split(";")[0]?.trim()

    return {
      bytes,
      sizeBytes: bytes.byteLength,
      mimeType,
      source,
    }
  }
}
