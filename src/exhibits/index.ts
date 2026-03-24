// Exhibit parsing, normalization, and EX-10* contract filtering

export { dedupeAndSortExhibits } from "./deduplication"
export { isContractExhibit } from "./filters/contract"
export { normalizeDescription, normalizeExhibitType, normalizeSequence } from "./normalization"
export { parseExhibitTableFromHtml } from "./parsing"
export { ExhibitService } from "./service"
export type { RawExhibit } from "./types"
