/**
 * Transparent gzip compression for NATS payloads.
 *
 * Large chat snapshots exceed NATS max_payload (8 MB).
 * JSON compresses 10-20x, raising the effective ceiling to ~80-160 MB.
 */

const COMPRESS_THRESHOLD = 65_536

export function isGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b
}

// TS 5.8 widens Uint8Array to Uint8Array<ArrayBufferLike>, but Bun APIs require Uint8Array<ArrayBuffer>.
// TextEncoder.encode() always backs by ArrayBuffer, making the narrowing safe.
type BunBytes = Uint8Array<ArrayBuffer>

function toBunBytes(data: Uint8Array): BunBytes {
  if (data.buffer instanceof ArrayBuffer) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  return new Uint8Array(data.slice())
}

export function compressPayload(raw: Uint8Array): Uint8Array {
  if (raw.length <= COMPRESS_THRESHOLD) return raw
  return Bun.gzipSync(toBunBytes(raw), { level: 1 })
}

export async function decompressPayload(data: Uint8Array): Promise<Uint8Array> {
  if (!isGzipped(data)) return data
  // Server (Bun): use synchronous gunzip — no stream overhead
  if (typeof Bun !== "undefined") {
    return Bun.gunzipSync(toBunBytes(data))
  }
  // Browser fallback: DecompressionStream
  const ds = new DecompressionStream("gzip")
  const writer = ds.writable.getWriter()
  void writer.write(toBunBytes(data)).then(() => writer.close())
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}
