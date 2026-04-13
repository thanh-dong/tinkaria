---
id: adr-20260330-harden-coding-rules
c3-seal: ead4b7526fd5b2b831065af2ffbe454691cb88acfecb648b2ba931b40f16cd69
title: harden-coding-rules
type: adr
goal: Codify existing coding patterns as enforceable C3 rules to harden code quality, error handling, and testing conventions.
status: implemented
date: "2026-03-30"
---

## Goal

Codify existing coding patterns as enforceable C3 rules to harden code quality, error handling, and testing conventions.

## Decision

Created 5 coding rules extracted from existing golden patterns in the codebase:

| Rule | Scope | Key Enforcement |
| --- | --- | --- |
| rule-error-extraction | All catch blocks | error instanceof Error ? error.message : String(error) |
| rule-bun-test-conventions | All test files | Bun test, describe/test, afterEach cleanup, typed helpers |
| rule-type-guards | Type validation | is* predicates, normalize* functions, require*/get* duality |
| rule-prefixed-logging | All logging | LOG_PREFIX constant, severity-appropriate console methods |
| rule-graceful-fallbacks | External inputs | Normalize with fallback, handle ENOENT/SyntaxError, never crash on bad data |
## Status

Implemented. All rules wired to relevant components.
