---
id: adr-20260414-auto-upgrade-fenced-pug-blocks
c3-seal: f3dc269f94548cdd39d36ca85a3457b3b6609475ad09e6a6f80eccee24459a53
title: auto-upgrade-fenced-pug-blocks
type: adr
goal: Auto-upgrade fenced `pug` assistant markdown blocks into rendered rich embeds while preserving normal code-block behavior for other languages.
status: proposed
date: "2026-04-14"
---

## Goal

Auto-upgrade fenced `pug` assistant markdown blocks into rendered rich embeds while preserving normal code-block behavior for other languages.

## Context

Assistant text currently renders markdown/code directly. We want inline `pug` fenced blocks to behave like rich embed artifacts without requiring an explicit `present_content` tool call.

## Decision

TBD

## Consequences

TBD
