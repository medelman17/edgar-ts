import { describe, expect, it } from "vitest"
import { EdgarClient, ConfigurationError } from "@/index"

describe("EdgarClient", () => {
  describe("constructor", () => {
    it("accepts valid options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("rejects empty userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "" })).toThrow(ConfigurationError)
    })

    it("rejects whitespace-only userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "   " })).toThrow(ConfigurationError)
    })

    it("trims userAgent", () => {
      const client = new EdgarClient({
        userAgent: "  TestBot/1.0 (test@example.com)  ",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom retry options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        retries: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8000 },
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom rate limit", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        maxRequestsPerSecond: 4,
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom timeout", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        timeoutMs: 30000,
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })
  })
})
