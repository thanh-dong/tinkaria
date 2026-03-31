import { describe, test, expect } from "bun:test"
import { isGzipped, compressPayload, decompressPayload } from "./compression"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function makeJson(sizeHint: number): string {
  const entry = { kind: "text", id: "msg-001", content: "x".repeat(200), timestamp: "2026-03-31T00:00:00Z" }
  const entries: typeof entry[] = []
  while (JSON.stringify(entries).length < sizeHint) {
    entries.push({ ...entry, id: `msg-${entries.length}` })
  }
  return JSON.stringify(entries)
}

describe("isGzipped", () => {
  test("detects gzip magic bytes", () => {
    expect(isGzipped(new Uint8Array([0x1f, 0x8b, 0x08]))).toBe(true)
  })

  test("rejects plain JSON", () => {
    expect(isGzipped(encoder.encode('{"hello":"world"}'))).toBe(false)
  })

  test("rejects empty input", () => {
    expect(isGzipped(new Uint8Array([]))).toBe(false)
  })

  test("rejects single-byte input", () => {
    expect(isGzipped(new Uint8Array([0x1f]))).toBe(false)
  })
})

describe("compressPayload", () => {
  test("passes through small payloads unchanged", () => {
    const small = encoder.encode('{"tiny":true}')
    const result = compressPayload(small)
    expect(result).toBe(small) // same reference — no copy
  })

  test("compresses payloads above 64 KB threshold", () => {
    const largeJson = makeJson(100_000)
    const raw = encoder.encode(largeJson)
    expect(raw.length).toBeGreaterThan(65_536)

    const compressed = compressPayload(raw)
    expect(compressed.length).toBeLessThan(raw.length)
    expect(isGzipped(compressed)).toBe(true)
  })

  test("compressed output is valid gzip that roundtrips", async () => {
    const largeJson = makeJson(100_000)
    const raw = encoder.encode(largeJson)
    const compressed = compressPayload(raw)

    const decompressed = await decompressPayload(compressed)
    expect(decoder.decode(decompressed)).toBe(largeJson)
  })
})

describe("decompressPayload", () => {
  test("passes through non-gzipped data unchanged", async () => {
    const plain = encoder.encode('{"hello":"world"}')
    const result = await decompressPayload(plain)
    expect(decoder.decode(result)).toBe('{"hello":"world"}')
  })

  test("decompresses gzipped data correctly", async () => {
    const largeJson = makeJson(100_000)
    const raw = encoder.encode(largeJson)
    const compressed = compressPayload(raw)

    const result = await decompressPayload(compressed)
    expect(decoder.decode(result)).toBe(largeJson)
  })

  test("roundtrip: compressPayload -> decompressPayload", async () => {
    const largeJson = makeJson(200_000)
    const raw = encoder.encode(largeJson)
    const compressed = compressPayload(raw)
    const decompressed = await decompressPayload(compressed)

    expect(decoder.decode(decompressed)).toBe(largeJson)
  })
})
