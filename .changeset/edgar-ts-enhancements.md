---
"edgar-ts": minor
---

Add 9 new methods to EdgarClient for comprehensive SEC EDGAR API coverage:

**Company Data:**
- `getCompanyInfo(cik)` — fetch company metadata (name, tickers, SIC, entity type, state of incorporation) from SEC Submissions API
- `lookupCompany(query)` — search by ticker symbol (exact, case-insensitive) or company name (substring) via `company_tickers.json`

**Index File Discovery:**
- `discoverFilings({ from, to })` without a CIK now works — uses SEC quarterly index files (`master.idx`) instead of throwing `ConfigurationError`
- Supports date range spanning multiple years/quarters with automatic quarterly URL mapping

**Bulk Data:**
- `downloadSubmissionsBulk()` — download SEC nightly `submissions.zip` archive (all company metadata)
- `downloadCompanyFactsBulk()` — download SEC nightly `companyfacts.zip` archive (all XBRL facts)

**XBRL (Layer 1 — typed API access, no concept normalization):**
- `getCompanyFacts(cik)` — all XBRL facts across all filings for a company
- `getCompanyConcept(cik, taxonomy, tag)` — single concept time series (e.g., us-gaap/Revenue)
- `getFrame(taxonomy, tag, unit, period)` — cross-company comparison at a point in time

**Full-Text Search:**
- `searchFilings(query)` — wrap SEC's EFTS Elasticsearch API with keyword search, form type/date/entity filters, and pagination. Note: unofficial/undocumented API.

**Internal improvements:**
- Extract shared `fetchJson` utility eliminating duplicated fetch+parse+error boilerplate
- Extract `fetchSubmissionsResponse` shared between CompanyService and DiscoveryService
- Add `CompanyInfo`, `CompanyTicker`, `BulkDownloadResult`, XBRL types, and search types to public API
- Add `exchanges` and `stateOfIncorporation` to internal `SubmissionsResponse` type
