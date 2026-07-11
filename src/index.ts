/**
 * edgar-ts: TypeScript SEC EDGAR client library
 *
 * Provides filing discovery, exhibit enumeration, contract filtering,
 * and raw exhibit download with SEC-compliant request behavior.
 */

export { EdgarClient } from "./client"
export * from "./errors"
export type { SearchHit, SearchQuery, SearchResult } from "./search"
export * from "./types"
