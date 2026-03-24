// Shared utility for fetching JSON from SEC endpoints with ParseError wrapping

import { ParseError } from "@/errors"
import type { SecHttpClient } from "./client"

/**
 * Fetch a URL via SecHttpClient, parse JSON, and wrap parse failures in ParseError.
 */
export async function fetchJson<T>(
  url: string,
  httpClient: SecHttpClient,
  context: { readonly operation: string; readonly endpointClass: string },
): Promise<T> {
  const response = (await httpClient.request(url, { context })) as unknown as {
    json(): Promise<unknown>
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new ParseError(`Failed to parse JSON from ${url}`, {
      metadata: { url },
      cause: error,
    })
  }
}
