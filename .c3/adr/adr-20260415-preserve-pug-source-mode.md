---
id: adr-20260415-preserve-pug-source-mode
c3-seal: 05d41d65138185204babcbc9d21ccbd848d1b10432131183fe8f0b6b59507a1b
title: preserve-pug-source-mode
type: adr
goal: Preserve original Pug source when rich-content embed viewer switches to source mode. Commit the existing focused fix with regression coverage so rendered mode still compiles Pug while source mode shows author input instead of compiled HTML.
status: proposed
date: "2026-04-15"
---

## Goal

Preserve original Pug source when rich-content embed viewer switches to source mode. Commit the existing focused fix with regression coverage so rendered mode still compiles Pug while source mode shows author input instead of compiled HTML.
