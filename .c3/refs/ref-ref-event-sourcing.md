---
id: ref-ref-event-sourcing
c3-seal: 962385de323de369673f4904c15c6dc266c808591151bbea26b134e8217e9f86
title: ref-event-sourcing
type: ref
goal: Persist application state as append-only event logs without requiring a database dependency, enabling easy replay, debugging, and human-readable audit trails.
---

## Goal

Persist application state as append-only event logs without requiring a database dependency, enabling easy replay, debugging, and human-readable audit trails.

## Choice

JSONL append-only logs per entity type (conversations, projects, preferences) with periodic snapshot.json files for fast startup. Events are appended sequentially; snapshots compact the log to avoid unbounded growth.

## Why

- Simple persistence without DB dependency — just files on disk
- Human-readable format enables easy debugging and manual inspection
- Append-only semantics are crash-safe (no partial writes corrupt state)
- Snapshot compaction keeps startup fast as logs grow
- Event replay enables time-travel debugging and state reconstruction
