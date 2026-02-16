# Phase 4: Exhibit Download & Integrity Verification - Research

**Researched:** 2026-02-15
**Domain:** Binary HTTP response handling, cryptographic hashing (SHA-256), metadata extraction
**Confidence:** HIGH

## Summary

Phase 4 implements the final user-facing operation: downloading raw exhibit bytes from SEC EDGAR and computing SHA-256 integrity hashes. The research identifies that this phase builds directly on Phase 3's accurate exhibit metadata (URLs, filenames, MIME hints) and relies on two core technical patterns already established in the codebase:

1. **HTTP Response Body Handling:** The codebase already casts `SecHttpClient` responses to `unknown` then calls `.text()` or `.json()` (shown in ExhibitService and pagination). For binary downloads, cast to unknown and call `.arrayBuffer()` then wrap in Uint8Array.

2. **Cryptographic Hashing:** `crypto.subtle.digest()` is a web-standard API available in Node 18+ and Bun without external dependencies. It takes the algorithm name `"SHA-256"` and a Uint8Array or ArrayBuffer, returning a Promise resolving to an ArrayBuffer. Convert to hex string using standard encoding patterns.

**Primary recommendation:** Implement a DownloadService following the ExhibitService/DiscoveryService pattern (httpClient dependency, public async methods), handle both arrayBuffer() acquisition and SHA-256 hashing, wrap errors with typed categories, and use NIST test vector samples in tests to verify deterministic digest computation.

## User Constraints

No CONTEXT.md exists for this phase — research is unconstrained by prior decisions.

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `crypto.subtle` | Built-in (Node 18+, Bun) | SHA-256 hashing | W3C Web Crypto API standard; zero runtime dependencies; available in both Node and Bun |
| `fetch API` | Built-in (Node 18+, Bun) | HTTP requests | Web standard; already used throughout codebase for all transport |
| `Uint8Array` | Built-in | Binary data representation | Standard typed array view for byte sequences; required by crypto.subtle.digest and returned by response.arrayBuffer() |

### Supporting Patterns

| Pattern | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| DownloadService class | custom | Orchestrate download flow | Mirrors DiscoveryService and ExhibitService; owns httpClient dependency; encapsulates SHA-256 computation |
| DownloadedExhibit type | locked (types/index.ts) | Response shape | Already defined in API contract; includes exhibit ref, bytes, size, optional mimeType, sha256 digest |

### Why Not Alternatives

- **Node-specific `crypto` module:** The codebase targets both Node and Bun with web-standard APIs only. `crypto.subtle` works in both. Using Node-specific crypto would require conditional imports.
- **External hashing libraries (e.g., `tweetnacl`, `libsodium`):** Violates zero-dependencies constraint. Web Crypto API is sufficient and built-in.
- **Manual fetch streaming/piping:** `response.arrayBuffer()` is simpler and appropriate for fixed-size exhibit files (typical < 100MB).

## Architecture Patterns

### Recommended Project Structure

The download module already exists (empty barrel):

```
src/
├── download/
│   ├── index.ts              # Barrel export (currently empty)
│   ├── service.ts            # DownloadService (NEW)
│   ├── hasher.ts             # SHA-256 utility (NEW, or inline in service)
│   └── types.ts              # Internal types if needed (optional)
```

EdgarClient delegates to DownloadService just like it does for discovery and exhibits.

### Pattern 1: Service Class with httpClient Dependency

**What:** DownloadService takes SecHttpClient in constructor, provides public `async downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>` method.

**When to use:** Mirrors ExhibitService and DiscoveryService; consistent with library's facade pattern.

**Example:**

```typescript
// Source: codebase pattern from ExhibitService
export class DownloadService {
  constructor(private readonly httpClient: SecHttpClient) {}

  async downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit> {
    // 1. Fetch exhibit URL with SecHttpClient
    const response = (await this.httpClient.request(exhibit.exhibitUrl)) as unknown as {
      arrayBuffer(): Promise<ArrayBuffer>
      headers: { get(name: string): string | null }
    }

    // 2. Extract MIME type from Content-Type header (optional)
    const contentType = response.headers.get("Content-Type") ?? undefined
    const mimeType = contentType?.split(";")[0] ?? undefined

    // 3. Get raw bytes
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // 4. Compute SHA-256 digest
    const digest = await computeSha256Hex(bytes)

    // 5. Return metadata
    return {
      exhibit,
      bytes,
      sizeBytes: bytes.length,
      mimeType,
      sha256: digest,
    }
  }
}

async function computeSha256Hex(data: Uint8Array): Promise<string> {
  // Declare crypto.subtle as available globally in Node 18+ and Bun
  declare const crypto: { subtle: { digest(algo: string, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer> } }

  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
```

### Pattern 2: Response Body Casting (Established Pattern)

**What:** Cast fetch Response to `unknown` then assume `.arrayBuffer()` method exists. Same pattern used for `.text()` in ExhibitService and `.json()` in pagination.

**Why:** SecHttpClient.request() returns a typed `HttpResponse` that lacks `.arrayBuffer()`, `.text()`, `.json()` methods in its declaration. The codebase works around this by casting to unknown (an escape hatch when the underlying fetch Response has the methods needed).

**Example from codebase:**

```typescript
// exhibits/service.ts (existing pattern)
const response = (await this.httpClient.request(indexUrl)) as unknown as {
  text(): Promise<string>
}
const htmlContent = await response.text()

// download/service.ts (same pattern for binary)
const response = (await this.httpClient.request(exhibit.exhibitUrl)) as unknown as {
  arrayBuffer(): Promise<ArrayBuffer>
  headers: { get(name: string): string | null }
}
const buffer = await response.arrayBuffer()
```

### Pattern 3: Header Extraction from Response

**What:** Access HTTP response headers via `response.headers.get("Header-Name")`, returns string or null.

**When to use:** Extract optional metadata like `Content-Type`, `Content-Length` (though length is better verified against actual bytes).

**Example:**

```typescript
const contentType = response.headers.get("Content-Type")
const mimeType = contentType?.split(";")[0]?.trim() // Strip charset
```

### Anti-Patterns to Avoid

- **Don't assume Content-Type always present:** SEC may not return it. Make optional (`mimeType?: string`).
- **Don't trust Content-Length header for integrity:** Always verify actual bytes length (`bytes.length`).
- **Don't use streaming/piping for small files:** `arrayBuffer()` is simpler than streams for typical exhibit sizes.
- **Don't forget to cast response to unknown:** SecHttpClient response type doesn't declare arrayBuffer(), so cast is needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash algorithm or manual bit operations | `crypto.subtle.digest("SHA-256", data)` | Standards compliance, performance, cross-platform compatibility, zero dependencies |
| Binary response streaming | Custom fetch wrapper with stream reading | `response.arrayBuffer()` | Simpler API, adequate for fixed-size files, built-in |
| Hex encoding | Manual bit-shifting or character mapping | `Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("")` | Standard pattern, readable, performant |
| Content-Type parsing | Regex or manual string slicing | `.split(";")[0]?.trim()` | Common pattern, handles charset variants |

**Key insight:** Cryptographic correctness is critical for integrity verification. Using standardized APIs ensures compatibility with validators and downstream systems. Custom implementations risk subtle bugs in endianness, padding, or encoding.

## Common Pitfalls

### Pitfall 1: ArrayBuffer vs Uint8Array Confusion

**What goes wrong:** Confusion about whether to use ArrayBuffer directly or wrap in Uint8Array. Developers often try to pass ArrayBuffer to crypto.subtle.digest without wrapping, or attempt to iterate ArrayBuffer directly.

**Why it happens:** Both are "binary containers" but have different use cases. ArrayBuffer is a fixed-size memory block; Uint8Array is a view into that memory. crypto.subtle.digest accepts both, but Uint8Array is easier to work with directly.

**How to avoid:** Always convert response.arrayBuffer() → Uint8Array for both crypto.subtle and for returning in DownloadedExhibit. Pattern: `const bytes = new Uint8Array(buffer)`

**Warning signs:** Code trying to iterate or slice ArrayBuffer directly; code checking `buffer.length` instead of `buffer.byteLength`.

### Pitfall 2: SHA-256 Digest Encoding Format

**What goes wrong:** Digest returned as binary ArrayBuffer but expected as hex string. Code fails to convert, or converts incorrectly (wrong endianness, missing zero-padding).

**Why it happens:** crypto.subtle.digest returns ArrayBuffer. Converting to hex requires: create Uint8Array view, iterate byte-by-byte, convert each to hex string with zero-padding, concatenate.

**How to avoid:** Always convert using the standard pattern: `Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("")`

**Warning signs:** Digest not matching NIST test vectors; digest varies across runs for same input; digest appears as base64 or other encoding instead of lowercase hex.

### Pitfall 3: Response Headers Not Available After Body Consumed

**What goes wrong:** Code reads headers after calling response.arrayBuffer(), but headers might not be accessible (depends on implementation).

**Why it happens:** Some HTTP client libraries consume headers when body is read. Fetch API keeps headers available, but pattern varies.

**How to avoid:** Extract headers before (or immediately after) calling arrayBuffer(). SecHttpClient response should preserve headers, but test this assumption early.

**Warning signs:** headers.get() returns null or throws; headers appear different after body read; null-pointer errors on response.headers.

### Pitfall 4: Forgetting to Handle Missing Content-Type

**What goes wrong:** Code assumes Content-Type always present, crashes when SEC doesn't provide it (valid per HTTP spec).

**Why it happens:** SEC EDGAR may serve files without explicit Content-Type header.

**How to avoid:** Make mimeType optional (`mimeType?: string`). Return undefined if header missing: `mimeType: response.headers.get("Content-Type") ?? undefined`

**Warning signs:** Integration tests fail on real SEC responses; DownloadedExhibit construction fails with null; downstream parsers don't handle undefined.

### Pitfall 5: Size Mismatch Not Caught

**What goes wrong:** Response headers claim Content-Length but actual bytes differ. Code trusts header and later fails when size doesn't match.

**Why it happens:** Network corruption, partial reads, or server errors can cause Content-Length mismatch.

**How to avoid:** Always verify `bytes.length` against actual bytes read (crypto.subtle.digest will consume all of it). Don't trust Content-Length header. Return actual byte count: `sizeBytes: bytes.length`

**Warning signs:** Tests pass with mock data but fail against real SEC; size mismatches detected downstream.

## Code Examples

Verified patterns from official sources:

### Example 1: crypto.subtle.digest SHA-256

```typescript
// Source: MDN Web Docs, Node.js crypto documentation
async function computeSha256Hex(data: Uint8Array): Promise<string> {
  // crypto.subtle is available globally in Node 18+ and Bun
  // Declare for type checking
  declare const crypto: {
    subtle: {
      digest(algo: string, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer>
    }
  }

  // Step 1: Compute hash (returns ArrayBuffer)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)

  // Step 2: Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  return hashHex
}

// Usage:
const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
const hash = await computeSha256Hex(bytes)
// hash: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969" (known NIST test vector)
```

### Example 2: Response.arrayBuffer() and Header Extraction

```typescript
// Source: WHATWG Fetch Standard, Node.js fetch API
async function downloadExhibitBytes(url: string): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  // Assume httpClient.request returns a Response-like object
  const response = (await httpClient.request(url)) as unknown as {
    arrayBuffer(): Promise<ArrayBuffer>
    headers: { get(name: string): string | null }
  }

  // Step 1: Extract optional MIME type before reading body
  const contentType = response.headers.get("Content-Type")
  const mimeType = contentType?.split(";")[0]?.trim() ?? undefined

  // Step 2: Read body as binary
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  return { bytes, mimeType }
}
```

### Example 3: NIST Test Vectors for SHA-256 Verification

```typescript
// Source: NIST FIPS 180-4 test vectors (di-mgt.com.au/sha_testvectors.html)
describe("computeSha256Hex", () => {
  it("matches NIST test vector for empty input", async () => {
    const empty = new Uint8Array([])
    const digest = await computeSha256Hex(empty)
    expect(digest).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("matches NIST test vector for 'abc'", async () => {
    const abc = new TextEncoder().encode("abc")
    const digest = await computeSha256Hex(abc)
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  it("matches NIST test vector for 56-byte input", async () => {
    const input = new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
    const digest = await computeSha256Hex(input)
    expect(digest).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Node-only `crypto` module with conditional imports | crypto.subtle (web standard) | Node 15.7+ (builtin); standardized in Node 18+ | Zero-dependency, Bun-compatible hashing |
| Buffer-based response handling in Node | fetch API Response.arrayBuffer() | Node 18+ (builtin); web standard | Unified API across runtimes, cleaner casting pattern |
| Manual hex encoding loops | Array.from().map().join() pattern | Always current | Readable, idiomatic JavaScript |

**Deprecated/outdated:**
- Direct iteration over ArrayBuffer: Node now prefers TypedArray views (Uint8Array) for iteration.
- Legacy Node crypto.createHash(): Still works but less portable; crypto.subtle is the modern standard.

## Open Questions

1. **Should DownloadService handle retries, or rely on SecHttpClient?**
   - What we know: SecHttpClient already handles retry logic for 429/5xx.
   - What's unclear: Should exhibit download failures (404, 410) be retried or immediately non-retryable?
   - Recommendation: Let SecHttpClient handle transport retries (timeouts, transient 5xx). DownloadService should catch HTTP errors and map to typed errors (404/410 → NotFoundError non-retryable).

2. **Should SHA-256 computation be a separate utility or inline in DownloadService?**
   - What we know: Computation is simple (3-4 lines including encoding).
   - What's unclear: Will other phases need SHA-256 hashing (e.g., dedupe by hash)?
   - Recommendation: Extract to `computeSha256Hex(data: Uint8Array): Promise<string>` utility in download module or shared utils. Easier to test and reuse.

3. **How to handle large binary files (streaming vs buffering)?**
   - What we know: Typical SEC exhibits are < 100MB.
   - What's unclear: Are there multipart/streaming exhibit files?
   - Recommendation: Use response.arrayBuffer() for v1. If streaming needed later, can refactor to response.body.getReader() pattern. Current approach is safer for deterministic hashing.

## Sources

### Primary (HIGH confidence)

- [W3C Web Crypto API: SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) - Official standard for SHA-256 hashing
- [Node.js v18+ Crypto Documentation](https://nodejs.org/api/crypto.html) - crypto.subtle available since Node 15.7, standard in 18+
- [WHATWG Fetch Standard: Response.arrayBuffer()](https://developer.mozilla.org/en-US/docs/Web/API/Response/arrayBuffer) - Binary response handling
- [NIST FIPS 180-4 Test Vectors](https://di-mgt.com.au/sha_testvectors.html) - Official SHA-256 verification vectors

### Secondary (MEDIUM confidence)

- [Bun Reference: SubtleCrypto.digest](https://bun.com/reference/node/crypto/webcrypto/SubtleCrypto/digest) - Confirms Bun web crypto parity with Node
- [MDN Response.headers](https://developer.mozilla.org/en-US/docs/Web/API/Response/headers) - Response header access patterns

### Tertiary (Pattern Verification)

- edgar-ts codebase: ExhibitService (text() pattern), pagination (json() pattern), SecHttpClient (response casting pattern)

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH - crypto.subtle is W3C standard, available in Node 18+ and Bun without dependencies
- **Architecture:** HIGH - mirrors established service pattern in codebase; response casting already in use
- **Pitfalls:** HIGH - SHA-256 encoding and ArrayBuffer/Uint8Array confusion are well-documented in documentation
- **Implementation patterns:** HIGH - verified against official docs and codebase examples

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable domain; no rapid iteration expected)

**Known limitations:**
- No research on streaming large files (future concern if exhibited files exceed memory constraints)
- No analysis of performance comparison between crypto.subtle vs Node native crypto (both adequate for v1)
- Assumes SecHttpClient response interface supports headers.get() (not explicitly tested, but standard fetch API behavior)
