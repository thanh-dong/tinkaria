---
id: adr-20260414-extension-system
c3-seal: 8997c74033f4f49d0aecd930f74932c9ac8a42c285a1eb0d5069bad748c10f03
title: extension-system
type: adr
goal: 'Add a pluggable extension system to Tinkaria that shows project-level information in a dedicated Project Page. Three first-party extensions ship: c3 (architecture docs), agents (agent config), code (language-specific project overview). Extensions auto-detect relevance via filesystem probes and render as SegmentedControl tabs following ref-mobile-tabbed-page-pattern.'
status: proposed
date: "2026-04-14"
---

## Goal

Add a pluggable extension system to Tinkaria that shows project-level information in a dedicated Project Page. Three first-party extensions ship: c3 (architecture docs), agents (agent config), code (language-specific project overview). Extensions auto-detect relevance via filesystem probes and render as SegmentedControl tabs following ref-mobile-tabbed-page-pattern.
