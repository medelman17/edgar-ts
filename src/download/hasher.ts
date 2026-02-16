// SHA-256 digest computation using Web Crypto API
// Reference: NIST FIPS 180-4 (SHA-256 specification)

// Type for the Web Crypto subtle interface (avoids @types/node dependency).
type SubtleCrypto = {
  digest(algorithm: string, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer>
}

/**
 * Lazily resolve crypto.subtle across Node.js and Bun runtimes.
 *
 * Strategy:
 * 1. Try globalThis.crypto.subtle (Bun, Node 19+, browsers)
 * 2. Fall back to node:crypto webcrypto (Node 18+, vitest environments)
 */
let _subtle: SubtleCrypto | undefined

async function getSubtle(): Promise<SubtleCrypto> {
  if (_subtle) return _subtle

  // Try globalThis first (available in Bun, Node 19+, browsers)
  const g = globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }
  if (g.crypto?.subtle) {
    _subtle = g.crypto.subtle
    return _subtle
  }

  // Fall back to node:crypto for Node 18 / vitest environments where
  // globalThis.crypto may not be defined
  try {
    // @ts-expect-error -- no @types/node; module exists at runtime on Node 18+
    const nodeCrypto = await import("node:crypto")
    const wc = (nodeCrypto as unknown as { webcrypto?: { subtle?: SubtleCrypto } }).webcrypto
    if (wc?.subtle) {
      _subtle = wc.subtle
      return _subtle
    }
  } catch {
    // not in a Node.js environment
  }

  throw new Error("Web Crypto API not available in this runtime")
}

/**
 * Compute SHA-256 hex digest of binary data.
 *
 * Uses the W3C Web Crypto API (crypto.subtle.digest) for cryptographic hashing.
 * Available natively in Node.js 18+ and Bun without polyfills.
 *
 * The digest is returned as a lowercase hexadecimal string (64 characters).
 *
 * @param data - Binary data to hash
 * @returns Promise resolving to lowercase hex digest (64 chars)
 *
 * @example
 * ```ts
 * const bytes = new TextEncoder().encode("hello world")
 * const hash = await computeSha256Hex(bytes)
 * // => "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
 * ```
 */
export async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const subtle = await getSubtle()
  const hashBuffer = await subtle.digest("SHA-256", data)

  // Convert ArrayBuffer to lowercase hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("")

  return hashHex
}
