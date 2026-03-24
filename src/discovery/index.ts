// Filing discovery — date-bounded search, form filtering, normalization

export { dedupeAndSort } from "./deduplication"
export type { IndexEntry } from "./index-parser"
export { parseIndexFile } from "./index-parser"
export type { IndexDiscoveryInput } from "./index-service"

export { IndexService } from "./index-service"
export {
  normalizeAccession,
  normalizeCik,
  normalizeFormType,
  validateDate,
} from "./normalization"
export { fetchAllFilings } from "./pagination"
export { DiscoveryService } from "./service"

export type {
  FilingRecord,
  PaginatedFileRef,
  ParallelFilingArrays,
  SubmissionsResponse,
} from "./types"
export { recordsFromParallelArrays } from "./types"
