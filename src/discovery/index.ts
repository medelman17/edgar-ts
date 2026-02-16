// Filing discovery — date-bounded search, form filtering, normalization

export {
  normalizeCik,
  normalizeAccession,
  normalizeFormType,
  validateDate,
} from "./normalization"

export { dedupeAndSort } from "./deduplication"

export { fetchAllFilings } from "./pagination"

export type { SubmissionsResponse, FilingRecord, PaginatedFileRef } from "./types"
