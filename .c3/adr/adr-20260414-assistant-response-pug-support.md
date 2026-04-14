---
id: adr-20260414-assistant-response-pug-support
c3-seal: 1f59bbc12d66def382c35da297f87d81b3818dee7de2f8745bdc9859e2d4fa3b
title: assistant-response-pug-support
type: adr
goal: Add pugjs support to `message.assistant.response` alongside existing html and iframe render paths, with default Tailwind v4-friendly behavior when the embed environment supports it.
status: proposed
date: "2026-04-14"
---

## Goal

Add pugjs support to `message.assistant.response` alongside existing html and iframe render paths, with default Tailwind v4-friendly behavior when the embed environment supports it.

## Context

Assistant responses already support rich HTML and iframe rendering. We need Pug authoring support in the same response surface without widening the feature beyond the existing rich-content boundary.

## Decision

TBD

## Consequences

TBD
