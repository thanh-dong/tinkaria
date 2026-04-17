---
id: adr-20260415-dedupe-session-ended-error
c3-seal: dd23e0b4634652f833201b01678831dfddb8556b9ee67e04aa1ed58cd875c62c
title: dedupe-session-ended-error
type: adr
goal: Prevent the Codex/CLI crash message from being displayed twice when a session ends unexpectedly after an API 500 or process failure.
status: implemented
date: "2026-04-15"
---

## Goal

Prevent the Codex/CLI crash message from being displayed twice when a session ends unexpectedly after an API 500 or process failure.

Work Breakdown:

- Affected component: c3-111 messages.
- Add focused RED/GREEN coverage for result messages whose detail already includes the standard session-ended fallback title and hint.
- Normalize only the rendered error-detail block so the fixed title/hint stay visible once and the underlying API error remains visible.
- Verify the messages component with focused tests, TypeScript, C3 check, whitespace check, and a browser smoke of the rendered error card.
Risks:
- Over-trimming could hide useful user error content. Limit trimming to leading exact fallback lines only.
- This is a render-only change under c3-111 messages; no container contract, transcript production, or shared type boundary changes are intended.
Parent Delta:
Parent Delta: none. Evidence: c3-1 already assigns result/status message rendering to c3-111 messages; this change only adjusts the c3-111 error detail presentation.
