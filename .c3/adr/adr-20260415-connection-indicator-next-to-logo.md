---
id: adr-20260415-connection-indicator-next-to-logo
c3-seal: 193df115c707ee7b04690939ad30aa1e268c99b602d93c9216508d8e350b3cd1
title: connection-indicator-next-to-logo
type: adr
goal: Add a compact connection indicator next to the Tinkaria logo in the top navigation, preserving existing connection-state semantics and layout.
status: proposed
date: "2026-04-15"
---

## Goal

Add a compact connection indicator next to the Tinkaria logo in the top navigation, preserving existing connection-state semantics and layout.

## Context

User requested a connection indicator beside the Tinkaria logo on top.

## Plan

1. Locate top/logo ownership through C3 lookup.
2. Add focused regression test for visible connection indicator placement/semantics.
3. Implement minimal UI change.
4. Verify focused tests, typecheck, C3 check, git diff check, and browser smoke.
