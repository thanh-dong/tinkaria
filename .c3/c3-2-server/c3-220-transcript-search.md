---
id: c3-220
c3-seal: 39875c1eae3e583fe8c1f4e75783e98dad847b81ee8bc4027bbe275b4b8fc6dd
title: transcript-search
type: component
category: feature
parent: c3-2
goal: TranscriptSearchIndex — BM25 lexical search over all transcript entries in a project. Wraps the standalone BM25 engine with transcript-aware document extraction and metadata indexing.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

TranscriptSearchIndex — BM25 lexical search over all transcript entries in a project. Wraps the standalone BM25 engine with transcript-aware document extraction and metadata indexing.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | TranscriptEntry and NormalizedToolCall types for extraction | c3-204 |
| IN | SearchResult, SearchDocumentKind types | c3-204 |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced |
| rule-bun-test-conventions | Bun test framework with describe/test grouping |
## Code References

| File | Purpose |
| --- | --- |
| src/server/bm25.ts | Standalone BM25 search engine with tokenizer and inverted index |
| src/server/bm25.test.ts | Tests for BM25 engine |
| src/server/transcript-search.ts | TranscriptSearchIndex wrapping BM25 with transcript-aware extraction |
| src/server/transcript-search.test.ts | Tests for TranscriptSearchIndex |
## Container Connection

Part of c3-2 (server). Provides lexical search over transcripts consumed by ProjectAgent (c3-222) for the search query surface.
