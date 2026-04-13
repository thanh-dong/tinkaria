---
id: adr-20260413-fix-subagent-transcript-load
c3-seal: 6ebfb968c29c4679aa6e87125ebf83cd1e1342cefebbbe4e0c652c414f64dbdd
title: fix-subagent-transcript-load
type: adr
goal: Restore transcript loading for the chat composer subagent transcript surface owned by chat input/composer flows.
status: proposed
date: "2026-04-13"
---

## Goal

Restore transcript loading for the chat composer subagent transcript surface owned by chat input/composer flows.

## Context

User reports `chat.composer.subagents.transcript | c3:c3-112(chat-input)` shows that the transcript cannot be loaded.

## Change

Investigate the transcript loading path, identify the root cause, and implement the narrowest code/test/doc updates needed to make the transcript render again.

## Affected

- c3-110
- c3-112
