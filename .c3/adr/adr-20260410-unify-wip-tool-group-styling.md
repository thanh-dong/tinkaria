---
id: adr-20260410-unify-wip-tool-group-styling
c3-seal: b22fcc21d3072997cb05df780f35baaa92de164c1d646e998a3d7f011ac0d923
title: unify-wip-tool-group-styling
type: adr
goal: 'Unify the visual structure of WipBlock (message.wip-block.area) and CollapsedToolGroup (message.tool-group.area) so they share the same header layout pattern: chevron-left icon slot, label text, consistent expand/collapse behavior.'
status: accepted
date: "2026-04-10"
---

## Goal

Unify the visual structure of WipBlock (message.wip-block.area) and CollapsedToolGroup (message.tool-group.area) so they share the same header layout pattern: chevron-left icon slot, label text, consistent expand/collapse behavior.

### Changes

- **WipBlock header**: Switched from 3-column grid (dot | label | chevron-right) to 2-column grid (chevron-left | label) matching CollapsedToolGroup
- **Loading indicator**: Moved pulsing coral dot from icon slot to inline with label text
- **Sub-lines**: Narration and latest tool step only show when collapsed, with consistent 26px left margin
- **Expanded timeline**: Replaced custom border-l tree with shared VerticalLineContainer component
