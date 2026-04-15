---
id: adr-20260415-fix-content-preview-dialog-rendering
c3-seal: 7e6c395f7d5ade8a48da4d0010d3c4c488ccc32af150254aa7162447b4182da8
title: fix-content-preview-dialog-rendering
type: adr
goal: 'Fix content-preview dialog regressions: oversized titlebar, absolute path titles, nonfunctional hash affordance, and broken monospace ASCII-tree markdown rendering.'
status: implemented
date: "2026-04-15"
---

## Goal

Fix content-preview dialog regressions: oversized titlebar, absolute path titles, nonfunctional hash affordance, and broken monospace ASCII-tree markdown rendering.

## Context

User reported c3:c3-111(messages) content-preview.dialog issues in the current UI.

## Decision

Patch the content preview dialog implementation and tests with minimal surface area, then verify through focused tests, typecheck, C3 check, and browser smoke.
