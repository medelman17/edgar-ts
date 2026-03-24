// NIST FIPS 180-4 test vectors for SHA-256
// Reference: https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines/example-values

import { describe, expect, it } from "vitest"
import { computeSha256Hex } from "@/download/hasher"

describe("computeSha256Hex", () => {
  it("computes SHA-256 digest for empty input (NIST test vector)", async () => {
    const input = new Uint8Array([])
    const digest = await computeSha256Hex(input)

    expect(digest).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("computes SHA-256 digest for 'abc' (NIST test vector)", async () => {
    const input = new TextEncoder().encode("abc")
    const digest = await computeSha256Hex(input)

    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  it("computes SHA-256 digest for 56-byte input (NIST test vector)", async () => {
    const input = new TextEncoder().encode(
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    )
    const digest = await computeSha256Hex(input)

    expect(digest).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
  })

  it("returns lowercase hexadecimal format (no uppercase)", async () => {
    const input = new TextEncoder().encode("test")
    const digest = await computeSha256Hex(input)

    // SHA-256 always produces 64 hex characters
    expect(digest).toHaveLength(64)

    // Ensure lowercase only
    expect(digest).toBe(digest.toLowerCase())

    // Ensure no separators or formatting
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it("handles Uint8Array input correctly", async () => {
    // Explicit binary data (not string)
    const input = new Uint8Array([0xff, 0x00, 0xaa, 0x55])
    const digest = await computeSha256Hex(input)

    // Verify it produces valid hex digest
    expect(digest).toHaveLength(64)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it("produces different digests for different inputs", async () => {
    const input1 = new TextEncoder().encode("hello")
    const input2 = new TextEncoder().encode("world")

    const digest1 = await computeSha256Hex(input1)
    const digest2 = await computeSha256Hex(input2)

    expect(digest1).not.toBe(digest2)
  })

  it("produces same digest for identical inputs", async () => {
    const input1 = new TextEncoder().encode("consistent")
    const input2 = new TextEncoder().encode("consistent")

    const digest1 = await computeSha256Hex(input1)
    const digest2 = await computeSha256Hex(input2)

    expect(digest1).toBe(digest2)
  })
})
