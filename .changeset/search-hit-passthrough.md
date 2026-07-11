---
"edgar-ts": minor
---

Pass through EFTS sub-document identity and filer metadata on search results.

`SearchHit` now includes `accessionNo`, `filename` (parsed from the hit id, with `adsh`
preferred when present), `fileType` (the matched sub-document's type, e.g. `EX-5.1` — EFTS
indexes exhibits individually), and the full `ciks` / `displayNames` arrays so multi-filer
accessions (e.g. tender offers listing both bidder and target) no longer lose co-filers.
`SearchResult` gains `totalRelation` (`"eq" | "gte"`) so a saturated 10,000 total is
distinguishable from an exact count. `SearchQuery`, `SearchResult`, and `SearchHit` are now
exported from the package barrel.
