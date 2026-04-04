// src/server/bm25.ts

const STOPWORDS = new Set([
  "a", "an", "the", "is", "it", "of", "in", "to", "and", "or", "for",
  "on", "at", "by", "with", "from", "as", "be", "was", "were", "been",
  "are", "has", "had", "have", "do", "does", "did", "but", "not", "this",
  "that", "these", "those", "i", "we", "you", "he", "she", "they",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

interface DocEntry {
  tokens: string[]
  length: number
}

export interface BM25Result<ID> {
  id: ID
  score: number
}

export class BM25Index<ID extends string = string> {
  private readonly k1 = 1.2
  private readonly b = 0.75
  private readonly docs = new Map<ID, DocEntry>()
  private readonly invertedIndex = new Map<string, Set<ID>>()
  private totalLength = 0

  get size(): number {
    return this.docs.size
  }

  private get avgLength(): number {
    return this.docs.size === 0 ? 0 : this.totalLength / this.docs.size
  }

  add(id: ID, text: string): void {
    this.remove(id)
    const tokens = tokenize(text)
    this.docs.set(id, { tokens, length: tokens.length })
    this.totalLength += tokens.length

    for (const token of tokens) {
      let set = this.invertedIndex.get(token)
      if (!set) {
        set = new Set()
        this.invertedIndex.set(token, set)
      }
      set.add(id)
    }
  }

  remove(id: ID): void {
    const doc = this.docs.get(id)
    if (!doc) return
    this.totalLength -= doc.length
    this.docs.delete(id)
    for (const token of doc.tokens) {
      const set = this.invertedIndex.get(token)
      if (set) {
        set.delete(id)
        if (set.size === 0) this.invertedIndex.delete(token)
      }
    }
  }

  search(query: string, limit = 10): BM25Result<ID>[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const scores = new Map<ID, number>()
    const N = this.docs.size
    const avgDl = this.avgLength

    for (const qt of queryTokens) {
      const postings = this.invertedIndex.get(qt)
      if (!postings) continue

      const df = postings.size
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))

      for (const docId of postings) {
        const doc = this.docs.get(docId)!
        const tf = doc.tokens.filter((t) => t === qt).length
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (doc.length / avgDl)))
        const score = idf * tfNorm
        scores.set(docId, (scores.get(docId) ?? 0) + score)
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }))
  }
}
