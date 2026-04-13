---
id: adr-20260407-fork-derived-context
c3-seal: d496c7644b27d93d117d0182daf9556391c69fafc9e103cd931dd535c216857c
title: fork-derived-context
type: adr
goal: Document the decision to treat user-facing forking as independent session seeding instead of delegation. Fork creation now derives the new chat's first prompt from the current chat transcript, the user's editable fork intent, and an optional preset lens, so the new session starts with a focused brief rather than copied raw history or a verbatim textarea payload.
status: implemented
date: "2026-04-07"
---

## Goal

Document the decision to treat user-facing forking as independent session seeding instead of delegation. Fork creation now derives the new chat's first prompt from the current chat transcript, the user's editable fork intent, and an optional preset lens, so the new session starts with a focused brief rather than copied raw history or a verbatim textarea payload.
