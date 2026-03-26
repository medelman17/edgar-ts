// DownloadService — orchestrates exhibit download with integrity verification

import type { SecHttpClient } from "@/http"
import type { DownloadedExhibit, ExhibitRef } from "@/types"
import { computeSha256Hex } from "./hasher"

/**
 * Download service for raw exhibit acquisition with SHA-256 integrity verification.
 *
 * Orchestration flow:
 * 1. Fetch exhibit binary content via SecHttpClient
 * 2. Extract optional MIME type from Content-Type header
 * 3. Convert response to Uint8Array
 * 4. Compute SHA-256 digest for integrity verification
 * 5. Return DownloadedExhibit with complete metadata
 *
 * The service always uses actual bytes.length for size reporting (not Content-Length header).
 * MIME type is optional and extracted from Content-Type header when available.
 */
export class DownloadService {
  constructor(private readonly httpClient: SecHttpClient) {}

  /**
   * Download exhibit and return raw bytes with metadata.
   *
   * @param exhibit - Exhibit reference to download
   * @returns Promise resolving to DownloadedExhibit with bytes, metadata, and SHA-256 digest
   */
  async downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit> {
    // 1. Fetch exhibit URL via SecHttpClient
    const response = await this.httpClient.request(exhibit.exhibitUrl, {
      context: { operation: "downloadExhibit", endpointClass: "archive" },
    })

    // 2. Extract optional MIME type from Content-Type header
    const contentType = response.headers.get("Content-Type")
    const mimeType = contentType?.split(";")[0]?.trim() ?? undefined

    // 3. Read binary response and convert to Uint8Array
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // 4. Compute SHA-256 digest
    const sha256 = await computeSha256Hex(bytes)

    // 5. Return DownloadedExhibit with all metadata
    return {
      exhibit,
      bytes,
      sizeBytes: bytes.length,
      mimeType,
      sha256,
    }
  }
}
