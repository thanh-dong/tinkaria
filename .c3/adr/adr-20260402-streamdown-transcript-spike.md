---
id: adr-20260402-streamdown-transcript-spike
c3-seal: a41efed9191fb7305e2df6c62c2766507a78743617746f4d5ae9245b06cad663
title: Streamdown transcript spike
type: adr
goal: Adopt Streamdown for assistant transcript rendering only, while preserving Kanna's existing markdown adapter behavior for local file links, rich-content fenced blocks, and `richcontent:autoExpand`, then verify the change with focused transcript tests, build output, browser smoke, and `c3x check` before considering a broader markdown migration.
status: implemented
date: "2026-04-02"
affects:
    - c3-103
    - c3-111
    - ref-project-context
---

## Goal

Adopt Streamdown for assistant transcript rendering only, while preserving Kanna's existing markdown adapter behavior for local file links, rich-content fenced blocks, and `richcontent:autoExpand`, then verify the change with focused transcript tests, build output, browser smoke, and `c3x check` before considering a broader markdown migration.
