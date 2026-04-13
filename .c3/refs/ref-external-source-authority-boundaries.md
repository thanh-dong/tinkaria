---
id: ref-external-source-authority-boundaries
c3-seal: 292687674c0ed0292f9f056de0a98f551960489287318f9b1231f26d8e100e8f
title: external-source-authority-boundaries
type: ref
goal: Treat external session ids, file handles, provider-managed conversation references, and other out-of-process identifiers as advisory pointers whose validity must be re-established against the owning system before use.
---

## Goal

Treat external session ids, file handles, provider-managed conversation references, and other out-of-process identifiers as advisory pointers whose validity must be re-established against the owning system before use.

## Choice

When Tinkaria stores or receives an identifier owned by Claude, Codex, the filesystem, or any other external runtime, treat that value as cached foreign state rather than proof that the referenced object still exists. Re-check the owner at the point of use, and distinguish stale or missing external objects from internal state corruption.

## Why

External systems can delete, rotate, expire, rewrite, or transiently hide objects without Tinkaria's store changing at the same moment. Persisting the identifier is still useful for discovery and best-effort resume, but correctness depends on validating the pointer against the authority that owns it. Without that boundary, stale foreign ids look like trustworthy local state and failures surface too late and too ambiguously.

## How

At external boundaries, do three things in order: keep the foreign identifier as metadata for discovery, diagnostics, and optimistic resume; perform a source-of-truth lookup immediately before using it for a side effect or resume action; and branch explicitly on lookup failure with a stale-reference path that either clears the cached handle, starts a fresh session, or returns a user-visible "external resource no longer exists" error. Preserve provider-generated error payloads as evidence, but do not treat the pointer as valid until the lookup succeeds.
