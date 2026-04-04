// src/server/bm25.test.ts
import { describe, expect, test } from "bun:test"
import { BM25Index } from "./bm25"

describe("BM25Index", () => {
  describe("tokenize", () => {
    test("lowercases and splits on whitespace/punctuation", () => {
      const index = new BM25Index<string>()
      index.add("d1", "Hello, World! This is a test.")
      const results = index.search("hello")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d1")
    })

    test("filters stopwords", () => {
      const index = new BM25Index<string>()
      index.add("d1", "the quick brown fox")
      index.add("d2", "a lazy dog")
      // "the" and "a" are stopwords, should not dominate results
      const results = index.search("quick")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d1")
    })
  })

  describe("search", () => {
    test("ranks relevant documents higher", () => {
      const index = new BM25Index<string>()
      index.add("d1", "postgres database migration schema users table")
      index.add("d2", "react component button styling CSS")
      index.add("d3", "database connection pool postgres config")

      const results = index.search("postgres database")
      expect(results.length).toBeGreaterThanOrEqual(2)
      // d1 and d3 both mention postgres+database terms
      const ids = results.map((r) => r.id)
      expect(ids).toContain("d1")
      expect(ids).toContain("d3")
      // d2 should not appear or rank very low
      expect(ids.indexOf("d1")).toBeLessThan(ids.indexOf("d2") === -1 ? Infinity : ids.indexOf("d2"))
    })

    test("returns empty for no matches", () => {
      const index = new BM25Index<string>()
      index.add("d1", "hello world")
      const results = index.search("nonexistent")
      expect(results).toEqual([])
    })

    test("respects limit parameter", () => {
      const index = new BM25Index<string>()
      for (let i = 0; i < 20; i++) {
        index.add(`d${i}`, `document ${i} about testing`)
      }
      const results = index.search("testing", 5)
      expect(results.length).toBe(5)
    })

    test("handles multi-field documents via concatenation", () => {
      const index = new BM25Index<string>()
      index.add("d1", "auth middleware implementation error handling retry logic")
      index.add("d2", "auth login form validation")
      const results = index.search("auth error handling")
      expect(results[0].id).toBe("d1")
    })
  })

  describe("remove", () => {
    test("removes document from index", () => {
      const index = new BM25Index<string>()
      index.add("d1", "hello world")
      index.add("d2", "hello there")
      index.remove("d1")
      const results = index.search("hello")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d2")
    })
  })

  describe("size", () => {
    test("tracks document count", () => {
      const index = new BM25Index<string>()
      expect(index.size).toBe(0)
      index.add("d1", "hello")
      expect(index.size).toBe(1)
      index.add("d2", "world")
      expect(index.size).toBe(2)
      index.remove("d1")
      expect(index.size).toBe(1)
    })
  })
})
