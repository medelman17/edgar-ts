// SHA-256 digest computation using W3C Web Crypto API
// Reference: NIST FIPS 180-4 (SHA-256 specification)

// Declare crypto global (available in Node 18+ and Bun)
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer>
  }
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
  // Compute SHA-256 digest using Web Crypto API
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)

  // Convert ArrayBuffer to lowercase hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("")

  return hashHex
}
