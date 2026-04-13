---
id: adr-20260413-fix-ui-identity-c3-drift
c3-seal: 6d13ef52c251d74fec95c9328ca2bc2c513266018df83c8437c97367a029ead3
title: fix-ui-identity-c3-drift
type: adr
goal: Fix UI identity drift so all intentionally grabbable client surfaces expose C3-backed ownership metadata, regression tests assert both `data-ui-id` and `data-ui-c3`, and the C3 codemap resolves the current implementation files instead of stale route-era paths.
status: implemented
date: "2026-04-13"
---

## Goal

Fix UI identity drift so all intentionally grabbable client surfaces expose C3-backed ownership metadata, regression tests assert both `data-ui-id` and `data-ui-c3`, and the C3 codemap resolves the current implementation files instead of stale route-era paths.
