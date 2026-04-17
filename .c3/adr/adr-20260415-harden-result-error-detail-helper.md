---
id: adr-20260415-harden-result-error-detail-helper
c3-seal: 399ddce96599527a0535bab2eb4e4cd034e2e4beab6de84ac27170b3fedb57db
title: harden-result-error-detail-helper
type: adr
goal: Harden the session-ended error detail normalization with direct helper coverage and self-review evidence, keeping the existing render-layer fix scoped to c3-111 messages.
status: implemented
date: "2026-04-15"
---

## Goal

Harden the session-ended error detail normalization with direct helper coverage and self-review evidence, keeping the existing render-layer fix scoped to c3-111 messages.

Work Breakdown:

- Affected component: c3-111 messages.
- Export getResultErrorDetail for direct focused unit coverage.
- Prove exact trimming behavior: leading fallback title/hint removed, API detail preserved, non-leading text untouched.
- Self-review diff for over-trimming, unnecessary blast radius, and unrelated worktree changes.
Risks:
- Exporting a helper can widen local module API. Acceptable because it is test-facing and remains colocated with ResultMessage.
- Over-normalization could hide user detail. Direct tests cover leading-only behavior and normal API/rate-limit detail.
Parent Delta:
Parent Delta: none. Evidence: c3-1 already assigns message rendering to c3-111 messages; this only adds helper-level proof for c3-111 result error rendering.
