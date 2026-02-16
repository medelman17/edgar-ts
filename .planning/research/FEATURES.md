# Feature Landscape: SEC EDGAR HTTP Client

**Project:** edgar-ts
**Domain:** SEC EDGAR API client for filing discovery and contract exhibit acquisition
**Researched:** 2026-02-15

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Filing discovery by CIK | Core SEC EDGAR use case; every user needs to find filings | Medium | Query data.sec.gov; parse JSON; normalize |
| Form type filtering | Users want specific filing types (10-K, 10-Q, 8-K) | Low | Filter by formType after discovery |
| Date range filtering | Users want filings within time window | Low | Filter by filingDate after discovery |
| Exhibit enumeration | Users need contract exhibits within filings | Medium | Resolve filing detail; parse exhibit list |
| Contract exhibit filtering (EX-10*) | Core use case for contract analysis | Low | Match exhibit type with normalization |
| Exhibit download | Users must retrieve exhibit bytes | Medium | Fetch from SEC Archives; handle large files |
| SHA-256 integrity verification | Users need to verify exhibit authenticity/identity | Low | Compute hash; return in metadata |
| Typed errors with retryability | Orchestration systems need to decide whether to retry | Medium | Classify errors; include retryable flag |
| Rate limiting (10 req/s) | SEC enforces it; library must respect or fail | High | Implement token bucket; test thoroughly |
| Timeout enforcement | Requests must not hang; users need deterministic behavior | Medium | AbortSignal.timeout per request |
| User-agent requirement | SEC requires identification; compliance | Low | Validate format; reject invalid agents |
| Deterministic normalization | Callers need consistent, reproducible results | High | Canonical CIK, accession, date, type formats |

---

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Exponential backoff with jitter | Retries don't hammer SEC server; spreads load | Low | AWS-standard algorithm; improves production reliability |
| Zero runtime dependencies | Lighter installation; easier to integrate; no supply-chain risk | High | Requires all patterns (token bucket, retry, hashing) to be inline |
| Deterministic deduplication | Results reproducible; dedup stable across calls | Medium | Identity keys + canonical normalization + stable sort |
| Pagination support | Handles large filer lists (1000+ filings) automatically | Medium | Iterate over filings.files[] array in SEC response |
| Caller-provided abort signal | Users can cancel via their own AbortController | Medium | Merge with request timeout via AbortSignal.any() |
| Telemetry hooks (no logging) | Observability without forced opinions on logging | Low | Emit typed events; caller decides what to do |
| Contract-focused filtering | EX-10* matching is normalized and comprehensive | Low | Handles format variants (EX-10, EX_10, EX/10, EX-10.1, etc.) |

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Persistence (database, disk) | Out of scope; library is stateless | Callers own persistence; library returns data in memory |
| Caching | Out of scope; no cache invalidation logic | Callers cache at application layer if needed |
| Content parsing (PDF, HTML parsing) | Out of scope; exhibits are returned as raw bytes | Callers parse exhibit bytes using appropriate tools |
| Full-text search | Out of scope; discovery is CIK-based, not search-based | Callers implement search against cached results |
| Batch/streaming results | v1 scope is array return; simple, deterministic | Streaming can be added in v2 if needed |
| Automatic retry on all errors | Retryable errors only; non-retryable errors fail immediately | Caller decides what to retry based on error.retryable flag |
| Distributed rate limiting (Redis) | Single-instance in-memory token bucket | Callers running distributed should deploy one instance per region or use queue |
| Proxy/VPN support | Out of scope; use OS networking | Callers configure proxy at OS level or via fetch options |
| Custom SEC endpoints | Only official SEC endpoints supported | Callers can fork/extend if needed |

---

## Feature Dependencies

```
Discovery (filings)
  ↓
  Exhibit Enumeration (list exhibits)
    ↓
    Contract Filtering (EX-10* only)
      ↓
      Download (fetch bytes)
        ↓
        SHA-256 Verification (integrity)

Rate Limiting → (all operations)
Timeout → (all operations)
User-Agent Validation → (all operations)
Error Classification + Retry → (all operations)
```

**Critical Path:**
1. SecHttpClient (transport layer)
2. DiscoveryService (filing discovery)
3. ExhibitService (exhibit enumeration)
4. ContractExhibitFilter (EX-10* matching)
5. DownloadService (binary fetch + hash)
6. ErrorMapper + Telemetry (observability)

---

## MVP Recommendation

### Prioritize (Phase 1-4)

1. **SecHttpClient** (Phase 1)
   - Token bucket rate limiting (10 req/s)
   - Native fetch with AbortSignal.timeout()
   - Exponential backoff with full jitter
   - User-agent validation
   - Error classification with retryability flags
   - Why: Foundation for all downstream work; must be rock-solid

2. **DiscoveryService** (Phase 2)
   - Query data.sec.gov/submissions/CIK##########.json
   - Parse and normalize filings (CIK, accession, date, form type)
   - Filter by form type and date range
   - Deduplicate and stable sort
   - Handle pagination (filings.files[])
   - Why: Core use case; users need to find filings

3. **ExhibitService** (Phase 3)
   - Resolve filing detail
   - Parse exhibit list
   - Normalize exhibit metadata
   - Return ExhibitRef[]
   - Why: Extends discovery; users need exhibits

4. **ContractExhibitFilter** (Phase 3)
   - Match EX-10* with normalization
   - Handle format variants
   - Return filtered list
   - Why: Core use case for contract analysis

5. **DownloadService** (Phase 4)
   - Fetch exhibit bytes
   - Compute SHA-256
   - Capture MIME type and size
   - Return DownloadedExhibit
   - Why: Terminal operation; users need actual exhibits

### Defer (Phase 5+)

1. **Telemetry/Observability** (Phase 5)
   - Hook infrastructure for logging, metrics, tracing
   - Recommended but not blocking
   - Why: Post-MVP observability; nice-to-have for debugging

2. **Circuit Breaker** (v2)
   - Detect SEC outages
   - Fail fast instead of retrying endlessly
   - Why: Advanced resilience; not critical for v1

3. **Streaming Results** (v2)
   - Return async iterables instead of arrays
   - Useful for large result sets
   - Why: v1 scope is simple arrays; streaming can follow

4. **Additional Exhibit Families** (v2)
   - Support EX-4, EX-99, etc.
   - Why: v1 scope is EX-10* only

5. **Batch Operations** (v2)
   - downloadExhibits(exhibits[]) with per-item results
   - Why: v1 scope is single-item operations

---

## API Contracts (v1)

```typescript
// Discovery
discoverFilings(input: {
  cik?: string;
  formTypes?: string[];
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}): Promise<FilingRef[]>;

// Exhibit Enumeration
listExhibits(filing: FilingRef): Promise<ExhibitRef[]>;
listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]>; // EX-10* only

// Download
downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>;
```

---

## Success Metrics for MVP

| Metric | Target | Why |
|--------|--------|-----|
| **API Completeness** | All 4 public methods implemented | Users can discover, enumerate, filter, download |
| **Rate Limiting** | Never exceeds 10 req/s in tests | SEC compliance |
| **Error Handling** | 100% of errors classified with retryability | Orchestration-friendly |
| **Determinism** | Identical results on repeated calls | Reproducibility, caching |
| **Node + Bun** | Tests pass on Node 18+, 20, 22, Bun 1.0+ | Zero-dependency, parity |
| **Test Coverage** | >95% coverage on http/, discovery/, exhibits/, download/ | Confidence in implementation |
| **Bundle Size** | <20 KB (gzip) | Lean distribution |
| **Type Safety** | Zero `any` types; isolatedDeclarations | Production-ready DX |

---

## Sources

### SEC EDGAR
- [SEC.gov EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [data.sec.gov](https://data.sec.gov/)

### Project Specifications
- [edgar-ts PRD](docs/edgar-ts-prd.md)
- [edgar-ts Architecture](docs/edgar-ts-architecture.md)
- [edgar-ts API Contract](docs/edgar-ts-api-contract.md)
- [edgar-ts SEC Compliance](docs/edgar-ts-sec-compliance.md)
